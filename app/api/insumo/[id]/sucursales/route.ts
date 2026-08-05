import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { quitarInsumoDeSucursal } from '@/lib/server/inventario/stock-sucursal.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

type Ctx = { params: Promise<{ id: string }> };

async function insumoId(params: Ctx['params']) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Id de insumo inválido');
  return id;
}

/** En qué sucursales se maneja el insumo, con su stock y sus mínimos. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await insumoId(params);

    const [sucursales, filas] = await Promise.all([
      prisma.sucursal.findMany({ where: { activa: true }, orderBy: { id: 'asc' }, select: { id: true, nombre: true } }),
      prisma.stockSucursal.findMany({ where: { insumo_id: id } }),
    ]);
    const porSucursal = new Map(filas.map(f => [f.sucursal_id, f]));

    return NextResponse.json({
      items: sucursales.map(s => {
        const fila = porSucursal.get(s.id);
        return {
          sucursal_id: s.id,
          sucursal: s.nombre,
          en_inventario: !!fila,
          stock_actual: fila?.stock_actual ?? null,
          stock_minimo: fila?.stock_minimo ?? null,
          punto_critico: fila?.punto_critico ?? null,
        };
      }),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

const QuitarSchema = z.object({ sucursal_id: z.number().int().positive() });

/**
 * Saca el insumo del inventario de UNA sucursal. No borra el insumo ni toca a
 * las demás: para retirarlo de todo el negocio está la baja del insumo, que
 * tampoco lo elimina.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const id = await insumoId(params);
    const { sucursal_id } = QuitarSchema.parse(await req.json());

    // La restricción vive en el servidor: la API se puede llamar a mano.
    const permitida = alcanceSucursal(session, sucursal_id);
    if (permitida !== sucursal_id) {
      throw new ValidationError('Solo podés modificar el inventario de tu propia sucursal');
    }

    const data = await quitarInsumoDeSucursal(id, sucursal_id);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Insumo', entidadId: id,
      detalle: `Quitó el insumo #${id} del inventario de la sucursal #${sucursal_id} (el insumo no se eliminó)`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data });
  } catch (e) {
    return handleApiError(e);
  }
}
