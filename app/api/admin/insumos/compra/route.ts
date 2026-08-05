import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { RegistrarCompraSchema } from '@/lib/server/dto/inventario.dto';
import { registrarCompra } from '@/lib/server/inventario/inventario.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = RegistrarCompraSchema.parse(body);

    const result = await prisma.$transaction(async (tx) =>
      registrarCompra(
        tx,
        parsed.insumo_id,
        parsed.cantidad,
        parsed.costo_unitario,
        parsed.nota,
        session.id,
        session.rol,
        await resolverSucursal(parsed.sucursal_id, tx),
      ),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
