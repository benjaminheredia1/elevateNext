import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, NotFoundError, ValidationError, ConflictError } from '@/lib/server/errors';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

type Ctx = { params: Promise<{ id: string }> };

const hora = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM').nullable().optional();

const EditarSchema = z.object({
  nombre: z.string().trim().min(2).optional(),
  descripcion: z.string().trim().max(500).nullable().optional(),
  imagen_url: z.string().trim().max(500).nullable().optional(),
  modo_precio: z.enum(['PORCENTAJE', 'PRECIO_FIJO', 'MONTO_DESCUENTO']).optional(),
  monto: z.number().nonnegative().optional(),
  activo: z.boolean().optional(),
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().positive().default(1),
  })).min(1).optional(),
  sucursales: z.array(z.object({
    sucursal_id: z.number().int().positive(),
    monto: z.number().nonnegative().nullable().optional(),
    disponible: z.boolean().optional().default(true),
  })).min(1).optional(),
  vigencias: z.array(z.object({
    fecha_inicio: z.string().min(1),
    fecha_fin: z.string().min(1),
    hora_inicio: hora,
    hora_fin: hora,
    dias_semana: z.array(z.number().int().min(1).max(7)).optional().default([]),
  })).min(1).optional(),
});

async function comboId(params: Ctx['params']) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Id de combo inválido');
  return id;
}

/**
 * Edita el combo. Items, sucursales y vigencias se reemplazan enteros cuando
 * vienen: es más simple de razonar que un diff parcial, y la pantalla siempre
 * manda la lista completa.
 */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await comboId(params);
    const input = EditarSchema.parse(await req.json());

    const actual = await prisma.promocionesDescuentos.findUnique({ where: { id } });
    if (!actual) throw new NotFoundError('La promoción no existe');

    const modo = input.modo_precio ?? actual.modo_precio;
    const monto = input.monto ?? Number(actual.monto);
    if (modo === 'PORCENTAJE' && monto > 100) throw new ValidationError('El descuento no puede superar el 100%');

    for (const s of input.sucursales ?? []) {
      if (alcanceSucursal(session, s.sucursal_id) !== s.sucursal_id) {
        throw new ValidationError('Solo podés publicar combos en tu propia sucursal');
      }
    }

    const combo = await prisma.$transaction(async (tx) => {
      if (input.items) {
        // Según el tipo, los productos son el contenido del combo o la lista de
        // productos que abarata el descuento. Se limpian ambos lados por si la
        // promoción cambió de tipo.
        await tx.comboItem.deleteMany({ where: { promocion_id: id } });
        await tx.promocionProducto.deleteMany({ where: { promocion_descuentos_id: id } });

        if (actual.tipo === 'COMBO') {
          await tx.comboItem.createMany({
            data: input.items.map(i => ({ promocion_id: id, producto_id: i.producto_id, cantidad: i.cantidad })),
            skipDuplicates: true,
          });
        } else {
          await tx.promocionProducto.createMany({
            data: input.items.map(i => ({
              promocion_descuentos_id: id,
              producto_id: i.producto_id,
              key: input.nombre ?? actual.nombre,
            })),
            skipDuplicates: true,
          });
        }
      }
      if (input.sucursales) {
        await tx.promocionSucursal.deleteMany({ where: { promocion_id: id } });
        await tx.promocionSucursal.createMany({
          data: input.sucursales.map(s => ({
            promocion_id: id, sucursal_id: s.sucursal_id, monto: s.monto ?? null, disponible: s.disponible,
          })),
          skipDuplicates: true,
        });
      }
      if (input.vigencias) {
        await tx.reglasHorarias.deleteMany({ where: { promocionesDescuentos_id: id } });
        await tx.reglasHorarias.createMany({
          data: input.vigencias.map(v => ({
            promocionesDescuentos_id: id,
            fecha_inicio: new Date(v.fecha_inicio),
            fecha_fin: new Date(v.fecha_fin),
            hora_inicio: v.hora_inicio ?? null,
            hora_fin: v.hora_fin ?? null,
            dias_semana: v.dias_semana,
          })),
        });
      }

      return tx.promocionesDescuentos.update({
        where: { id },
        data: {
          ...(input.nombre !== undefined ? { nombre: input.nombre } : {}),
          ...(input.descripcion !== undefined ? { descripcion: input.descripcion } : {}),
          ...(input.imagen_url !== undefined ? { imagen_url: input.imagen_url } : {}),
          ...(input.activo !== undefined ? { activo: input.activo } : {}),
          modo_precio: modo,
          monto,
          valor: modo === 'PORCENTAJE' ? `${monto}%` : String(monto),
        },
        include: { items: true, sucursales: true, reglasHorarias_id: true },
      });
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Promocion', entidadId: id,
      detalle: `Editó el combo "${combo.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: combo });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Elimina el combo. Si ya se vendió no se borra —dejaría ventas apuntando a un
 * combo inexistente—: se desactiva, que lo saca de la carta igual.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await comboId(params);

    const combo = await prisma.promocionesDescuentos.findUnique({ where: { id } });
    if (!combo) throw new NotFoundError('La promoción no existe');

    const vendido = await prisma.transaccionesDetalles.count({ where: { combo_id: id } });
    if (vendido > 0) {
      await prisma.promocionesDescuentos.update({ where: { id }, data: { activo: false } });
      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
        entidad: 'Promocion', entidadId: id,
        detalle: `Desactivó el combo "${combo.nombre}" (tiene ${vendido} venta(s), no se elimina)`,
        ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
      });
      throw new ConflictError(
        `El combo ya se vendió ${vendido} vez/veces, así que no se elimina: quedó desactivado y fuera de la carta.`,
      );
    }

    await prisma.promocionesDescuentos.delete({ where: { id } });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'ELIMINO',
      entidad: 'Promocion', entidadId: id,
      detalle: `Eliminó el combo "${combo.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
