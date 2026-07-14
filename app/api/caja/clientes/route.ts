import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';

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
