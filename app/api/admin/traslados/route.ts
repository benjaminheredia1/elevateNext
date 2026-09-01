import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import { leerClaveIdempotencia } from '@/lib/server/idempotencia';
import { CrearEnvioSchema, ESTADOS_TRASLADO } from '@/lib/server/dto/centro-produccion.dto';
import { crearEnvio, listarTraslados, valorEnTransito } from '@/lib/server/centro-produccion/traslados.service';
import { OPCIONES_TX_TRASLADO } from '@/lib/server/centro-produccion/traslados.tx';

/**
 * GET /api/admin/traslados?centro_id=&sucursal_id=&estado=
 *
 * Lo puede leer también un CAJERO: es quien recibe la mercadería en su local.
 * Despachar, en cambio, es de administración.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);

    const params = req.nextUrl.searchParams;
    const numero = (clave: string) => {
      const crudo = params.get(clave);
      if (!crudo) return undefined;
      const valor = Number(crudo);
      if (!Number.isInteger(valor) || valor <= 0) throw new ValidationError(`${clave} inválido`);
      return valor;
    };

    const estadoCrudo = params.get('estado');
    if (estadoCrudo && !ESTADOS_TRASLADO.includes(estadoCrudo as typeof ESTADOS_TRASLADO[number])) {
      throw new ValidationError('estado inválido');
    }

    // Un cajero solo ve los traslados de su propia sucursal: los de otro local
    // no son asunto suyo, igual que el resto del modelo particionado.
    const sucursalId = session.rol === 'CAJERO'
      ? (session.sucursal_id ?? undefined)
      : numero('sucursal_id');

    const items = await listarTraslados({
      centroId: numero('centro_id'),
      sucursalId,
      estado: (estadoCrudo as typeof ESTADOS_TRASLADO[number] | null) ?? undefined,
    });

    return NextResponse.json({
      items,
      valor_en_transito: await valorEnTransito({ centroId: numero('centro_id'), sucursalId }),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const parsed = CrearEnvioSchema.parse(await req.json());
    const clave = leerClaveIdempotencia(req);

    const result = await prisma.$transaction(
      (tx) => crearEnvio(
        tx, parsed.centro_id, parsed.sucursal_id, parsed.lineas,
        parsed.observaciones, session.id, session.rol, clave,
      ),
      OPCIONES_TX_TRASLADO,
    );

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
