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
        cuentas_corrientes: {
          where: { tipo: 'POR_COBRAR', estado: { not: 'PAGADA' } },
          select: { monto: true, monto_pagado: true },
        },
      },
      orderBy: { nombre: 'asc' },
      take: browse ? 50 : 10,
    });

    const data = clientes.map(c => {
      const deudaSaldo = Number(c.cuentas_corrientes
        .reduce((s, d) => s + Number(d.monto) - Number(d.monto_pagado), 0)
        .toFixed(2));
      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        nit: c.nit,
        email: c.email,
        deuda_saldo: deudaSaldo,
      };
    });
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}

/**
 * Alta de cliente desde caja (directorio o POS), sin necesidad de una venta.
 * Duplicado por celular/email/NIT → 409 (usar el existente). Los privilegios
 * ya no se asignan al cliente: se eligen por venta en el POS.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['CAJERO', 'DUENO', 'ADMIN']);
    const input = crearClienteCajaSchema.parse(await req.json());

    const { cliente } = await crearClienteDesdeCaja(input);

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'CREO',
      entidad: 'Cliente', entidadId: cliente.id,
      detalle: `Registró cliente "${cliente.nombre}" (#${cliente.id}) desde caja`,
      ip: getClientIp(req), userAgent: req.headers.get('user-agent'),
    });

    // Misma forma que el GET (ClienteResultado) para poder seleccionarlo en el POS.
    return NextResponse.json({
      data: {
        id: cliente.id,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        nit: cliente.nit,
        email: cliente.email,
        deuda_saldo: 0,
      },
    }, { status: 201 });
  } catch (e) { return handleApiError(e); }
}
