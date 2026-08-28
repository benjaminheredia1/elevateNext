import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, ForbiddenError } from '@/lib/server/auth/session';
import { handleApiError, NotFoundError } from '@/lib/server/errors';
import { RecibirTrasladoSchema } from '@/lib/server/dto/centro-produccion.dto';
import { recibirTraslado } from '@/lib/server/centro-produccion/traslados.service';

/**
 * Recibir es del local que recibe: lo hace el CAJERO de esa sucursal, o
 * administración. No hace falta clave de idempotencia — recibir es una
 * operación de estado (EN_TRANSITO → RECIBIDO) y el segundo intento choca con
 * el 409 de "ya está recibido".
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);
    const parsed = RecibirTrasladoSchema.parse(await req.json());

    if (session.rol === 'CAJERO') {
      const traslado = await prisma.traslado.findUnique({
        where: { id: parsed.traslado_id },
        select: { sucursal_id: true },
      });
      if (!traslado) throw new NotFoundError('Traslado no encontrado');
      if (traslado.sucursal_id !== session.sucursal_id) {
        throw new ForbiddenError('Ese traslado no viene a tu sucursal');
      }
    }

    const result = await prisma.$transaction((tx) =>
      recibirTraslado(tx, parsed.traslado_id, parsed.recibido, session.id, session.rol),
    );

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}
