import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import {
  sucursalesDeProducto,
  habilitarProductoEnSucursal,
  deshabilitarProductoEnSucursal,
  quitarProductoDeSucursal,
  darDeBajaEnSucursal,
  restaurarEnSucursal,
} from '@/lib/server/productos/catalogo-sucursal.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

type Ctx = { params: Promise<{ id: string }> };

async function productoId(params: Ctx['params']) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Id de producto inválido');
  return id;
}

/** En qué sucursales está habilitado el producto, con su precio y su receta. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    return NextResponse.json({ items: await sucursalesDeProducto(await productoId(params)) });
  } catch (e) {
    return handleApiError(e);
  }
}

const HabilitarSchema = z.object({
  sucursal_id:      z.number().int().positive(),
  precio:           z.number().positive().optional(),
  disponible:       z.boolean().optional(),
  nombre:           z.string().trim().max(160).nullable().optional(),
  imagen_url:       z.string().trim().max(500).nullable().optional(),
  /** Sucursal desde la que copiar la ficha técnica en el alta. */
  copiar_receta_de: z.number().int().positive().optional(),
});

/**
 * Habilita el producto en una sucursal (o actualiza su precio/presentación).
 * En el alta copia la receta indicada para no reescribir la ficha técnica.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await productoId(params);
    const input = HabilitarSchema.parse(await req.json());

    const habilitacion = await habilitarProductoEnSucursal(id, input.sucursal_id, input);
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Producto', entidadId: id,
      detalle: `Habilitó el producto #${id} en la sucursal #${input.sucursal_id}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: habilitacion }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}

const EstadoSucursalSchema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('BAJA'),
    sucursal_id: z.number().int().positive(),
    // Obligatorio: una baja sin motivo no se puede auditar ni explicar después.
    motivo: z.string().trim().min(3).max(300),
  }),
  z.object({
    accion: z.literal('RESTAURAR'),
    sucursal_id: z.number().int().positive(),
  }),
]);

/**
 * Baja lógica y restauración del producto EN UNA SUCURSAL. No toca el catálogo
 * ni el menú de los demás locales.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await productoId(params);
    const input = EstadoSucursalSchema.parse(await req.json());

    const permitida = alcanceSucursal(session, input.sucursal_id);
    if (permitida !== input.sucursal_id) {
      throw new ValidationError('Solo podés modificar el menú de tu propia sucursal');
    }

    const data = input.accion === 'BAJA'
      ? await darDeBajaEnSucursal(id, input.sucursal_id, input.motivo)
      : await restaurarEnSucursal(id, input.sucursal_id);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Producto', entidadId: id,
      detalle: input.accion === 'BAJA'
        ? `Dio de baja el producto #${id} en la sucursal #${input.sucursal_id}: ${input.motivo}`
        : `Restauró el producto #${id} en el menú de la sucursal #${input.sucursal_id}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data });
  } catch (e) {
    return handleApiError(e);
  }
}

const QuitarSchema = z.object({
  sucursal_id: z.number().int().positive(),
  /**
   * `true` (por defecto) quita el producto del catálogo de esa sucursal: si no
   * tuvo ventas ahí, borra la habilitación y su receta local. `false` solo lo
   * marca no disponible, conservando precio y ficha para reactivarlo.
   */
  quitar: z.boolean().optional().default(true),
});

/**
 * Saca el producto del menú de UNA sucursal. Nunca toca a las demás ni borra el
 * producto del catálogo: para eso está DELETE /api/admin/productos/[id].
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await productoId(params);
    const input = QuitarSchema.parse(await req.json());

    // Un ADMIN solo puede tocar el menú de su propia sucursal, aunque mande otra
    // en el body: la restricción vive en el servidor, no en la interfaz.
    const permitida = alcanceSucursal(session, input.sucursal_id);
    if (permitida !== input.sucursal_id) {
      throw new ValidationError('Solo podés modificar el menú de tu propia sucursal');
    }

    const resultado = input.quitar
      ? await quitarProductoDeSucursal(id, input.sucursal_id)
      : { ...(await deshabilitarProductoEnSucursal(id, input.sucursal_id)), modo: 'DESHABILITADO' as const };

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Producto', entidadId: id,
      detalle: 'modo' in resultado && resultado.modo === 'ELIMINADO'
        ? `Quitó el producto #${id} del catálogo de la sucursal #${input.sucursal_id}`
        : `Marcó no disponible el producto #${id} en la sucursal #${input.sucursal_id}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: resultado });
  } catch (e) {
    return handleApiError(e);
  }
}
