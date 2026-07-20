import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { pagoSchema } from '@/lib/server/dto/cuentas-corrientes.dto';
import { registrarPago } from '@/lib/server/admin/cuentas-corrientes.service';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const input = pagoSchema.parse(await req.json());
    const data = await registrarPago(Number(id), input, session.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'MODIFICO',
      entidad: 'CuentaCorriente',
      entidadId: data.id,
      detalle: `Registró pago de Bs. ${input.monto} — ${data.contraparte} (${data.estado})`,
      monto: input.monto,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}
