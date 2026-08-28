import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { obtenerCentro } from '@/lib/server/centro-produccion/centro-produccion.service';

type Ctx = { params: Promise<{ id: string }> };

/** Igual que en el listado de insumos: el id llega por la ruta y también se valida. */
function parseCentroId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('Id de centro inválido');
  return n;
}

/**
 * Kardex del centro: los últimos movimientos de su insumo bruto.
 *
 * Filtra por centro, a diferencia del kardex de sucursal
 * (`GET /api/insumo/movimiento`), que devuelve los últimos 50 del negocio sin
 * mirar el local. Acá la pantalla está siempre parada en un centro concreto y
 * mezclar dos centros haría ilegible el historial de cada uno.
 *
 * Los 50 son el mismo tope que usa la sucursal, para que las dos mitades del
 * panel compartido se comporten igual. Es lectura: no lleva `logAudit`.
 */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const centroId = parseCentroId((await params).id);
    await obtenerCentro(centroId);

    const movimientos = await prisma.movimientoCentro.findMany({
      where: { centro_id: centroId },
      include: { insumo: { select: { nombre: true, unidad_medida: true } } },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    return NextResponse.json({ data: movimientos });
  } catch (e) {
    return handleApiError(e);
  }
}
