import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ConflictError, NotFoundError } from '@/lib/server/errors';
import { feriadoCreateSchema, idSchema } from '@/lib/server/dto/horarios-trabajadores.dto';
import prisma from '@/lib/prisma';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { searchParams } = new URL(req.url);
    const sucursalIdParam = searchParams.get('sucursal_id');
    const anioParam = searchParams.get('anio');

    const where: Prisma.DiaFeriadoWhereInput = {};
    if (sucursalIdParam) where.sucursal_id = Number(sucursalIdParam);
    if (anioParam) {
      const anio = Number(anioParam);
      where.fecha = { gte: new Date(Date.UTC(anio, 0, 1)), lt: new Date(Date.UTC(anio + 1, 0, 1)) };
    }

    const feriados = await prisma.diaFeriado.findMany({
      where,
      include: { sucursal: { select: { id: true, nombre: true } } },
      orderBy: { fecha: 'asc' },
    });

    return NextResponse.json({ items: feriados });
  } catch (e) { return handleApiError(e); }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const input = feriadoCreateSchema.parse(await req.json());

    // La unique (fecha, sucursal_id) no cubre sucursal_id NULL en Postgres
    // (NULLs son distintos entre sí), así que el duplicado global se valida aquí.
    const existente = await prisma.diaFeriado.findFirst({
      where: { fecha: input.fecha, sucursal_id: input.sucursal_id ?? null },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictError('Ya existe un feriado para esa fecha y sucursal');
    }

    const feriado = await prisma.diaFeriado.create({
      data: {
        fecha: input.fecha,
        nombre: input.nombre,
        sucursal_id: input.sucursal_id ?? null,
      },
    });

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'CREO',
      entidad: 'DiaFeriado',
      entidadId: feriado.id,
      detalle: `Creó feriado "${feriado.nombre}" (${input.fecha.toISOString().slice(0, 10)})`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json(feriado, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return handleApiError(new ConflictError('Ya existe un feriado para esa fecha y sucursal'));
    }
    return handleApiError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { searchParams } = new URL(req.url);
    const { id } = idSchema.parse({ id: searchParams.get('id') });

    const feriado = await prisma.diaFeriado.findUnique({ where: { id } });
    if (!feriado) throw new NotFoundError('Feriado no encontrado');

    await prisma.diaFeriado.delete({ where: { id } });

    await logAudit({
      usuarioId: session.id,
      rol: session.rol,
      accion: 'ELIMINO',
      entidad: 'DiaFeriado',
      entidadId: id,
      detalle: `Eliminó feriado "${feriado.nombre}"`,
      ip: getClientIp(req),
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ ok: true });
  } catch (e) { return handleApiError(e); }
}
