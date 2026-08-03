import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { copiarInsumosASucursal } from '@/lib/server/inventario/stock-sucursal.service';
import { alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';

const CopiarSchema = z.object({
  origen: z.number().int().positive(),
  destino: z.number().int().positive(),
  insumos: z.array(z.number().int().positive()).min(1),
});

/**
 * Habilita en lote insumos de una sucursal en otra, con stock en cero.
 *
 * Es cómo se pone en marcha el inventario de un local nuevo sin recrear los
 * insumos a mano —lo que duplicaría nombres y partiría el kardex—. El stock no
 * viaja: para mover mercadería real está la transferencia.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = CopiarSchema.parse(await req.json());

    // Un ADMIN solo puede traer insumos hacia su propia sucursal. El origen
    // queda libre: es lectura de un inventario que igual va a ver copiado.
    const permitido = alcanceSucursal(session, input.destino);
    if (permitido !== input.destino) {
      throw new ValidationError('Solo podés habilitar insumos en tu propia sucursal');
    }

    const { copiados, yaEstaban } = await copiarInsumosASucursal(input);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Sucursal', entidadId: input.destino,
      detalle: `Copió ${copiados} insumo(s) desde la sucursal #${input.origen}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ copiados, ya_estaban: yaEstaban }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
