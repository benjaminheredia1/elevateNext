import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole, getClientIp } from '@/lib/server/auth/session';
import { logAudit } from '@/lib/server/audit/audit.service';
import { handleApiError } from '@/lib/server/errors';
import { crearClienteCajaSchema } from '@/lib/server/dto/clientes.dto';
import { crearClienteDesdeCaja } from '@/lib/server/clientes/clientes.service';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') ?? '').trim();
    // browse=1: navegar el directorio sin búsqueda (página Clientes de caja).
    // Sin browse se mantiene el contrato original del buscador del POS.
    const browse = searchParams.get('browse') === '1';
    if (!browse && q.length < 2) return NextResponse.json({ data: [] });

    const clientes = await prisma.cliente.findMany({
      where: {
        es_anonimo: false,
        ...(q.length >= 2
          ? {
              OR: [
                { nombre: { contains: q, mode: 'insensitive' } },
                { telefono: { contains: q } },
                { nit: { contains: q } },
              ],
            }
          : {}),
      },
      select: {
        id: true, nombre: true, telefono: true, nit: true, email: true,
        privilegios: {
          where: { privilegio: { activo: true } },
          select: { privilegio: { select: { id: true, nombre: true, porcentaje: true } } },
        },
        cuentas_corrientes: {
          where: { tipo: 'POR_COBRAR', estado: { not: 'PAGADA' } },
          select: { monto: true, monto_pagado: true },
        },
      },
      orderBy: { nombre: 'asc' },
      take: browse ? 50 : 10,
    });

    const data = clientes.map(c => {
      const privilegios = c.privilegios.map(p => ({
        id: p.privilegio.id,
        nombre: p.privilegio.nombre,
        porcentaje: Number(p.privilegio.porcentaje),
      }));
      const mejor = privilegios.reduce<{ nombre: string; pct: number } | null>((best, p) =>
        !best || p.porcentaje > best.pct ? { nombre: p.nombre, pct: p.porcentaje } : best, null);
      const deudaSaldo = Number(c.cuentas_corrientes
        .reduce((s, d) => s + Number(d.monto) - Number(d.monto_pagado), 0)
        .toFixed(2));
      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        nit: c.nit,
        email: c.email,
        privilegios,
        deuda_saldo: deudaSaldo,
        descuento_pct: mejor?.pct ?? 0,
        descuento_nombre: mejor?.nombre ?? null,
      };
    });
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}

/**
 * Alta de cliente desde caja (directorio o POS), sin necesidad de una venta.
 * Duplicado por celular/email/NIT → 409 (usar el existente). Los privilegios
 * asignados en el alta deben ser activos; todo queda en auditoría.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const input = crearClienteCajaSchema.parse(await req.json());

    const { cliente, privilegios } = await crearClienteDesdeCaja(input);

    const detallePriv = privilegios.length > 0
      ? ` con privilegios: ${privilegios.map(p => `${p.nombre} (${p.porcentaje}%)`).join(', ')}`
      : '';
    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Cliente', entidadId: cliente.id,
      detalle: `Registró cliente "${cliente.nombre}" (#${cliente.id}) desde caja${detallePriv}`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    // Misma forma que el GET (ClienteResultado) para poder seleccionarlo en el POS.
    const mejor = privilegios.reduce<{ nombre: string; pct: number } | null>((best, p) =>
      !best || p.porcentaje > best.pct ? { nombre: p.nombre, pct: p.porcentaje } : best, null);
    return NextResponse.json({
      data: {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        nit: cliente.nit,
        email: cliente.email,
        privilegios,
        deuda_saldo: 0,
        descuento_pct: mejor?.pct ?? 0,
        descuento_nombre: mejor?.nombre ?? null,
      },
    }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
