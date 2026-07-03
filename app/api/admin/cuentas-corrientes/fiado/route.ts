import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { fiadoSchema } from '@/lib/server/dto/cuentas-corrientes.dto';
import { crearFiado } from '@/lib/server/admin/cuentas-corrientes.service';

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);
    const input = fiadoSchema.parse(await req.json());
    const data = await crearFiado(input, session.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'CuentaCorriente',
      entidadId: data.id,
      detalle: `Fiado creado para pedido #${input.transaccion_id} — ${data.contraparte}: Bs. ${data.monto}`,
      monto: data.monto,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
