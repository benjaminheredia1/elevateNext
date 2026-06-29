import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { cuentaCorrienteSchema } from '@/lib/server/dto/cuentas-corrientes.dto';
import { crearCuenta, listarCuentas } from '@/lib/server/admin/cuentas-corrientes.service';
import type { TipoCuentaCxCxP } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo') as TipoCuentaCxCxP | null;
    const estado = searchParams.get('estado') ?? undefined;
    const data = await listarCuentas(tipo ?? undefined, estado);
    return NextResponse.json(data);
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const input = cuentaCorrienteSchema.parse(await req.json());
    const data = await crearCuenta(input, session.id);
    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'CuentaCorriente',
      entidadId: data.id,
      detalle: `Creó cuenta ${data.tipo} — ${data.contraparte}: ${data.concepto}`,
      monto: data.monto,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
