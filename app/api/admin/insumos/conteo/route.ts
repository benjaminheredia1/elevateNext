import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { requireAuth, requireRole, ForbiddenError } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ConteoFisicoSchema } from '@/lib/server/dto/inventario.dto';
import { registrarConteoFisico } from '@/lib/server/inventario/inventario.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    // El cajero es quien ve caerse el brownie y quien cuenta la vitrina al
    // cerrar turno: si tuviera que llamar al admin por 3 unidades no lo haría y
    // el stock derivaría hasta que nadie confíe en él. El control no es el
    // permiso sino la auditoría: la operación queda con su usuario.
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);

    const body   = await req.json();
    const parsed = ConteoFisicoSchema.parse(body);

    // El cajero opera SOLO el stock de su propio local. El admin puede tener
    // alcance global, así que la restricción es únicamente para el cajero, y va
    // antes de escribir nada.
    const sucursalId = await resolverSucursal(parsed.sucursal_id ?? session.sucursal_id);
    if (session.rol === 'CAJERO' && sucursalId !== session.sucursal_id) {
      throw new ForbiddenError('Solo podés mover el stock de tu sucursal.');
    }

    const result = await prisma.$transaction(async (tx) =>
      registrarConteoFisico(
        tx,
        parsed.insumo_id,
        parsed.nuevo_stock,
        parsed.descripcion,
        session.id,
        session.rol,
        sucursalId,
      ),
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
