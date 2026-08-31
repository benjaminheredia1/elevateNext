import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { handleApiError, ValidationError, NotFoundError, ConflictError } from '@/lib/server/errors';
import { logAudit } from '@/lib/server/audit/audit.service';
import { z } from 'zod';
import { AltaInsumoCentroSchema } from '@/lib/server/dto/centro-produccion.dto';
import { altaInsumoEnCentro } from '@/lib/server/centro-produccion/insumos-centro.service';
import { inventarioDeCentro } from '@/lib/server/centro-produccion/stock-centro.service';
import { obtenerCentro } from '@/lib/server/centro-produccion/centro-produccion.service';

type Ctx = { params: Promise<{ id: string }> };

const QuitarInsumoDelCentroSchema = z.object({
  insumo_id: z.number().int().positive(),
});

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

/**
 * Saca un insumo del inventario de este centro.
 *
 * Solo cuando no queda nada que perder: sin stock y sin movimientos. Con
 * historial la salida es "Dar de baja", que conserva la fila — el kardex del
 * centro es lo que explica de dónde salió el costo de lo que ya se produjo y se
 * despachó, y borrarlo dejaría esos números sin respaldo.
 *
 * El insumo en sí no se toca: sigue en el catálogo del negocio y en los demás
 * centros. Esto es de alcance, como quitar un insumo del inventario de un local.
 */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const centroId = parseCentroId((await params).id);
    await obtenerCentro(centroId);
    const { insumo_id } = QuitarInsumoDelCentroSchema.parse(await req.json());

    const fila = await prisma.stockCentro.findUnique({
      where: { centro_id_insumo_id: { centro_id: centroId, insumo_id } },
      include: { insumo: { select: { nombre: true } } },
    });
    if (!fila) throw new NotFoundError('Ese insumo no está en el inventario de este centro');

    if (fila.stock_actual !== 0) {
      throw new ConflictError(
        `"${fila.insumo.nombre}" tiene ${fila.stock_actual} en el centro: dejalo en cero con un conteo o usá "Dar de baja"`,
      );
    }
    const movimientos = await prisma.movimientoCentro.count({
      where: { centro_id: centroId, insumo_id },
    });
    if (movimientos > 0) {
      throw new ConflictError(
        `"${fila.insumo.nombre}" tiene ${movimientos} movimiento(s) en este centro: usá "Dar de baja" para conservar el historial`,
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.stockCentro.delete({ where: { id: fila.id } });
      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'ELIMINO',
        entidad: 'StockCentro', entidadId: fila.id,
        detalle: `Quitó "${fila.insumo.nombre}" del inventario del centro #${centroId} (sin stock ni movimientos)`,
        ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
      }, tx);
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
