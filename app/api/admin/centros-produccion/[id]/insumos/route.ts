import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { AltaInsumoCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { altaInsumoEnCentro } from '@/lib/server/centro-produccion/insumos-centro.service';
import { inventarioDeCentro } from '@/lib/server/centro-produccion/stock-centro.service';
import { obtenerCentro } from '@/lib/server/centro-produccion/centro-produccion.service';

type Ctx = { params: Promise<{ id: string }> };

function parseCentroId(id: string): number {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('Id de centro inválido');
  return n;
}

/** Inventario de insumo bruto del centro. */
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const centroId = parseCentroId((await params).id);
    await obtenerCentro(centroId);

    return NextResponse.json({ items: await inventarioDeCentro(centroId) });
  } catch (e) {
    return handleApiError(e);
  }
}

/** Alta de un insumo nuevo (o reutilizado del catálogo) en el centro. */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const centroId = parseCentroId((await params).id);
    await obtenerCentro(centroId);
    const input = AltaInsumoCentroSchema.parse(await req.json());

    const resultado = await prisma.$transaction((tx) =>
      altaInsumoEnCentro(tx, centroId, input, session.id, session.rol),
    );

    return NextResponse.json({ data: resultado }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
