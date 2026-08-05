import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { transferirStock } from '@/lib/server/inventario/stock-sucursal.service';

const TransferenciaSchema = z.object({
  insumo_id:      z.number().int().positive(),
  desde_sucursal: z.number().int().positive(),
  hacia_sucursal: z.number().int().positive(),
  cantidad:       z.number().positive(),
  nota:           z.string().trim().max(200).optional(),
});

/**
 * Mueve mercadería de una sucursal a otra. El stock global del negocio no
 * cambia: solo cambia de local, y quedan dos movimientos para auditarlo.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = TransferenciaSchema.parse(await req.json());

    if (input.desde_sucursal === input.hacia_sucursal) {
      throw new ValidationError('El origen y el destino deben ser sucursales distintas');
    }

    const resultado = await transferirStock({
      insumoId:      input.insumo_id,
      desdeSucursal: input.desde_sucursal,
      haciaSucursal: input.hacia_sucursal,
      cantidad:      input.cantidad,
      responsable:   String(session.id),
      nota:          input.nota,
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Insumo', entidadId: input.insumo_id,
      detalle: `Transfirió ${input.cantidad} del insumo #${input.insumo_id} de la sucursal #${input.desde_sucursal} a la #${input.hacia_sucursal}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: resultado }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
