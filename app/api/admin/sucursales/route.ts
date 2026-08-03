import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';

export const SucursalSchema = z.object({
  nombre:    z.string().trim().min(2).max(120),
  direccion: z.string().trim().max(200).optional(),
  lat:       z.number().optional(),
  lng:       z.number().optional(),
});

/**
 * Lista de sucursales. Por defecto solo las activas (es lo que necesitan los
 * selectores de asignación); con ?todas=1 incluye las desactivadas, para la
 * pantalla de administración.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const todas = new URL(req.url).searchParams.get('todas') === '1';

    const sucursales = await prisma.sucursal.findMany({
      where: todas ? {} : { activa: true },
      orderBy: { id: 'asc' },
      include: {
        _count: { select: { usuarios: true, transacciones: true, turnos: true } },
        cuentas: { select: { id: true, tipo: true, saldo: true } },
      },
    });

    // Se conserva la clave `items` porque ya la consumen usuarios y horarios.
    return NextResponse.json({
      items: sucursales.map(s => ({
        id: s.id,
        nombre: s.nombre,
        direccion: s.direccion,
        lat: s.lat,
        lng: s.lng,
        activa: s.activa,
        usuarios: s._count.usuarios,
        ventas: s._count.transacciones,
        turnos: s._count.turnos,
        cuentas: s.cuentas.map(c => ({ id: c.id, tipo: c.tipo, saldo: Number(c.saldo) })),
        created_at: s.created_at,
      })),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

/**
 * Alta de sucursal. Crea también sus cuentas de caja (EFECTIVO y QR): sin ellas
 * no se puede abrir turno, así que la sucursal nacería inoperable.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO']);
    const input = SucursalSchema.parse(await req.json());

    const repetida = await prisma.sucursal.findFirst({
      where: { nombre: { equals: input.nombre, mode: 'insensitive' } },
      select: { id: true },
    });
    if (repetida) throw new ValidationError('Ya existe una sucursal con ese nombre');

    const sucursal = await prisma.$transaction(async (tx) => {
      const creada = await tx.sucursal.create({
        data: {
          nombre:    input.nombre,
          direccion: input.direccion ?? null,
          lat:       input.lat ?? null,
          lng:       input.lng ?? null,
        },
      });
      await tx.cuentaFinanciera.createMany({
        data: [
          { sucursal_id: creada.id, tipo: 'EFECTIVO', nombre: 'Caja EFECTIVO' },
          { sucursal_id: creada.id, tipo: 'QR',       nombre: 'Caja QR' },
        ],
      });
      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'CREO',
        entidad: 'Sucursal', entidadId: creada.id,
        detalle: `Creó la sucursal "${creada.nombre}" con sus cuentas de caja`,
        ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
      }, tx);
      return creada;
    });

    return NextResponse.json({ data: sucursal }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
