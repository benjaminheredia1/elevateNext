import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError, ValidationError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';
import { coordenadasParaGuardar } from '@/lib/server/maps-url';

/** Hosts de Google Maps aceptados en `maps_url`. */
const MAPS_HOSTS = ['google.com', 'www.google.com', 'maps.google.com', 'maps.app.goo.gl', 'goo.gl'];

/**
 * El link de la sucursal se le abre al cliente desde la tienda, así que no se
 * acepta cualquier URL: solo enlaces de Google Maps. Un pegado descuidado no
 * puede terminar mandando gente a un sitio ajeno.
 */
const MapsUrlSchema = z.string().trim().max(500)
  .refine(v => {
    try {
      const url = new URL(v);
      return url.protocol === 'https:' && MAPS_HOSTS.includes(url.hostname);
    } catch {
      return false;
    }
  }, 'Debe ser un enlace https de Google Maps (google.com/maps o maps.app.goo.gl)');

export const SucursalSchema = z.object({
  nombre:    z.string().trim().min(2).max(120),
  direccion: z.string().trim().max(200).optional(),
  // Formato libre pero acotado: se guarda como lo escribe el dueño y recién al
  // armar el enlace de WhatsApp se normaliza.
  telefono:  z.string().trim().min(7).max(20).regex(/^[\d+\s()-]+$/, 'Teléfono inválido').optional(),
  maps_url:  MapsUrlSchema.optional(),
  lat:       z.number().optional(),
  lng:       z.number().optional(),
  // Límites de reparto del local. El precio sale del tarifario por tramos de
  // lib/envio.ts, que es único para todas las sucursales.
  envio_maximo:       z.number().nonnegative().nullable().optional(),
  envio_radio_km:     z.number().nonnegative().nullable().optional(),
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
        telefono: s.telefono,
        maps_url: s.maps_url,
        lat: s.lat,
        lng: s.lng,
        activa: s.activa,
        // Límites de reparto. Los Decimal salen como string en JSON y la
        // pantalla hace cuentas con ellos.
        envio_maximo: s.envio_maximo == null ? null : Number(s.envio_maximo),
        envio_radio_km: s.envio_radio_km,
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

    // Fuera de la transacción: resolver el enlace de Maps es una llamada de red
    // y no tiene por qué tener una transacción abierta esperándola.
    const { lat, lng } = await coordenadasParaGuardar(input);

    const sucursal = await prisma.$transaction(async (tx) => {
      const creada = await tx.sucursal.create({
        data: {
          nombre:    input.nombre,
          direccion: input.direccion ?? null,
          telefono:  input.telefono ?? null,
          maps_url:  input.maps_url ?? null,
          lat,
          lng,
          // Sin valores explícitos, el local queda sin tope y sin límite de radio.
          ...(input.envio_maximo !== undefined ? { envio_maximo: input.envio_maximo } : {}),
          ...(input.envio_radio_km !== undefined ? { envio_radio_km: input.envio_radio_km } : {}),
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
