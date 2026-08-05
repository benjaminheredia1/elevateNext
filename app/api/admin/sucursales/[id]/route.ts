import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, NotFoundError, ValidationError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';
import { SucursalSchema } from '../route';

type Ctx = { params: Promise<{ id: string }> };

async function sucursalId(params: Ctx['params']) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) throw new ValidationError('Id de sucursal inválido');
  return id;
}

/** Edición de los datos de la sucursal. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO']);
    const id = await sucursalId(params);
    const input = SucursalSchema.parse(await req.json());

    const existe = await prisma.sucursal.findUnique({ where: { id }, select: { id: true } });
    if (!existe) throw new NotFoundError('Sucursal no encontrada');

    const repetida = await prisma.sucursal.findFirst({
      where: { nombre: { equals: input.nombre, mode: 'insensitive' }, id: { not: id } },
      select: { id: true },
    });
    if (repetida) throw new ValidationError('Ya existe otra sucursal con ese nombre');

    const sucursal = await prisma.sucursal.update({
      where: { id },
      data: {
        nombre:    input.nombre,
        direccion: input.direccion ?? null,
        telefono:  input.telefono ?? null,
        maps_url:  input.maps_url ?? null,
        lat:       input.lat ?? null,
        lng:       input.lng ?? null,
          // Sin valores explícitos quedan los defaults del schema (Bs 8 / 2,5 km / Bs 2,50).
          ...(input.envio_base !== undefined ? { envio_base: input.envio_base } : {}),
          ...(input.envio_km_incluidos !== undefined ? { envio_km_incluidos: input.envio_km_incluidos } : {}),
          ...(input.envio_por_km !== undefined ? { envio_por_km: input.envio_por_km } : {}),
          ...(input.envio_maximo !== undefined ? { envio_maximo: input.envio_maximo } : {}),
          ...(input.envio_radio_km !== undefined ? { envio_radio_km: input.envio_radio_km } : {}),
      },
    });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Sucursal', entidadId: id,
      detalle: `Editó la sucursal "${sucursal.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: sucursal });
  } catch (e) {
    return handleApiError(e);
  }
}

const EstadoSchema = z.object({ activa: z.boolean() });

/**
 * Activa o desactiva la sucursal. Nunca se borra: su histórico de ventas debe
 * quedar intacto (la FK de Transaccion es RESTRICT justamente por eso).
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO']);
    const id = await sucursalId(params);
    const { activa } = EstadoSchema.parse(await req.json());

    const sucursal = await prisma.sucursal.findUnique({
      where: { id },
      select: { id: true, nombre: true, activa: true },
    });
    if (!sucursal) throw new NotFoundError('Sucursal no encontrada');

    if (!activa) {
      const turnoAbierto = await prisma.cajaTurno.findFirst({
        where: { sucursal_id: id, estado: 'ABIERTO' },
        select: { id: true },
      });
      if (turnoAbierto) throw new ValidationError('No se puede desactivar: la sucursal tiene un turno de caja abierto');

      const activasRestantes = await prisma.sucursal.count({ where: { activa: true, id: { not: id } } });
      if (activasRestantes === 0) throw new ValidationError('No se puede desactivar la única sucursal activa');
    }

    const actualizada = await prisma.sucursal.update({ where: { id }, data: { activa } });
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Sucursal', entidadId: id,
      detalle: `${activa ? 'Activó' : 'Desactivó'} la sucursal "${sucursal.nombre}"`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ data: actualizada });
  } catch (e) {
    return handleApiError(e);
  }
}
