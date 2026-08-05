import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { promocionesDeSucursal } from '@/lib/server/promociones/combos.service';
import { alcanceSucursal, resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';

/** Franja horaria "HH:MM"; vacío = todo el día. */
const hora = z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Usá el formato HH:MM').nullable().optional();

const VigenciaSchema = z.object({
  fecha_inicio: z.string().min(1),
  fecha_fin: z.string().min(1),
  hora_inicio: hora,
  hora_fin: hora,
  // 1=lunes … 7=domingo. Vacío = todos los días.
  dias_semana: z.array(z.number().int().min(1).max(7)).optional().default([]),
});

const ComboSchema = z.object({
  nombre: z.string().trim().min(2),
  descripcion: z.string().trim().max(500).optional().nullable(),
  imagen_url: z.string().trim().max(500).optional().nullable(),
  /**
   * COMBO: paquete que se cobra como una línea.
   * DESCUENTO: abarata productos que se siguen vendiendo por separado.
   */
  tipo: z.enum(['COMBO', 'DESCUENTO']).optional().default('COMBO'),
  /** PORCENTAJE sobre lo que suman sus productos, o PRECIO_FIJO en Bs. */
  modo_precio: z.enum(['PORCENTAJE', 'PRECIO_FIJO', 'MONTO_DESCUENTO']),
  monto: z.number().nonnegative(),
  activo: z.boolean().optional().default(true),
  items: z.array(z.object({
    producto_id: z.number().int().positive(),
    cantidad: z.number().positive().default(1),
  })).min(1, 'Elegí al menos un producto'),
  /** Sucursales donde se vende, con su precio propio opcional. */
  sucursales: z.array(z.object({
    sucursal_id: z.number().int().positive(),
    monto: z.number().nonnegative().nullable().optional(),
    disponible: z.boolean().optional().default(true),
  })).min(1, 'Elegí al menos una sucursal'),
  vigencias: z.array(VigenciaSchema).min(1, 'El combo necesita al menos una vigencia'),
});

/** Promociones de la sucursal (combos y descuentos), vigentes o no. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const pedida = alcanceSucursal(session, parseSucursal(new URL(req.url).searchParams));
    const sucursalId = await resolverSucursal(pedida);

    return NextResponse.json({ data: await promocionesDeSucursal(sucursalId), sucursal_id: sucursalId });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Crea un combo con sus productos, sus sucursales y sus vigencias.
 *
 * El porcentaje se valida acá: un 120% dejaría precios negativos, y un combo
 * sin productos no se puede armar ni valorizar.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = ComboSchema.parse(await req.json());

    if (input.modo_precio === 'PORCENTAJE' && input.monto > 100) {
      throw new ValidationError('El descuento no puede superar el 100%');
    }
    // Un ADMIN solo publica combos en su propia sucursal.
    for (const s of input.sucursales) {
      if (alcanceSucursal(session, s.sucursal_id) !== s.sucursal_id) {
        throw new ValidationError('Solo podés publicar combos en tu propia sucursal');
      }
    }

    const productos = await prisma.producto.findMany({
      where: { id: { in: input.items.map(i => i.producto_id) } },
      select: { id: true },
    });
    if (productos.length !== input.items.length) throw new ValidationError('Algún producto del combo no existe');

    const esCombo = input.tipo === 'COMBO';
    const combo = await prisma.promocionesDescuentos.create({
      data: {
        nombre: input.nombre,
        descripcion: input.descripcion ?? null,
        imagen_url: input.imagen_url ?? null,
        tipo: input.tipo,
        modo_precio: input.modo_precio,
        monto: input.monto,
        activo: input.activo,
        // `valor` es la columna histórica; se mantiene coherente para no dejar
        // filas nuevas ilegibles desde las pantallas viejas.
        valor: input.modo_precio === 'PORCENTAJE' ? `${input.monto}%` : String(input.monto),
        // En un combo los productos son su contenido; en un descuento son los
        // productos a los que abarata, que se siguen vendiendo por separado.
        ...(esCombo
          ? { items: { create: input.items.map(i => ({ producto_id: i.producto_id, cantidad: i.cantidad })) } }
          : {
              promocionProducto_id: {
                create: input.items.map(i => ({ producto_id: i.producto_id, key: input.nombre })),
              },
            }),
        sucursales: {
          create: input.sucursales.map(s => ({
            sucursal_id: s.sucursal_id,
            monto: s.monto ?? null,
            disponible: s.disponible,
          })),
        },
        reglasHorarias_id: {
          create: input.vigencias.map(v => ({
            fecha_inicio: new Date(v.fecha_inicio),
            fecha_fin: new Date(v.fecha_fin),
            hora_inicio: v.hora_inicio ?? null,
            hora_fin: v.hora_fin ?? null,
            dias_semana: v.dias_semana,
          })),
        },
      },
      include: { items: true, sucursales: true, reglasHorarias_id: true },
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Promocion', entidadId: combo.id,
      detalle: `Creó ${esCombo ? 'el combo' : 'la promoción'} "${combo.nombre}" con ${input.items.length} producto(s) en ${combo.sucursales.length} sucursal(es)`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: combo }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
