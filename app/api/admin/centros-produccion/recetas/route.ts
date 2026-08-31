import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { DefinirRecetaCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { definirRecetaCentro, obtenerRecetaCentro, rindeDelCentro } from '@/lib/server/centro-produccion/produccion.service';

/**
 * GET  ?centro_id=1              → rinde de todos los productos con receta
 * GET  ?centro_id=1&producto_id=2 → receta de ese producto
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const centroId = Number(req.nextUrl.searchParams.get('centro_id'));
    if (!Number.isInteger(centroId) || centroId <= 0) throw new ValidationError('centro_id inválido');

    const crudoProducto = req.nextUrl.searchParams.get('producto_id');
    if (crudoProducto) {
      const productoId = Number(crudoProducto);
      if (!Number.isInteger(productoId) || productoId <= 0) throw new ValidationError('producto_id inválido');
      return NextResponse.json({ items: await obtenerRecetaCentro(centroId, productoId) });
    }

    return NextResponse.json({ items: await rindeDelCentro(centroId) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = DefinirRecetaCentroSchema.parse(await req.json());

    // La transacción la abre el llamador: el servicio escribe en varias tablas
    // y ya no la abre por dentro, para poder participar de la transacción del
    // alta de producto.
    const receta = await prisma.$transaction((tx) =>
      definirRecetaCentro(
        parsed.centro_id, parsed.producto_id, parsed.lineas, session.id, session.rol, tx,
      ),
    );

    return NextResponse.json({ data: receta }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
