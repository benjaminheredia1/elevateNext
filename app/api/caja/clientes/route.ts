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
    if (q.length < 2) return NextResponse.json({ data: [] });

    const clientes = await prisma.cliente.findMany({
      where: {
        es_anonimo: false,
        OR: [
          { nombre: { contains: q, mode: 'insensitive' } },
          { telefono: { contains: q } },
          { nit: { contains: q } },
        ],
      },
      select: {
        id: true, nombre: true, telefono: true, nit: true, email: true,
        privilegios: {
          where: { privilegio: { activo: true } },
          select: { privilegio: { select: { nombre: true, porcentaje: true } } },
        },
      },
      orderBy: { nombre: 'asc' },
      take: 10,
    });

    const data = clientes.map(c => {
      const mejor = c.privilegios.reduce<{ nombre: string; pct: number } | null>((best, p) => {
        const pct = Number(p.privilegio.porcentaje);
        return !best || pct > best.pct ? { nombre: p.privilegio.nombre, pct } : best;
      }, null);
      return {
        id: c.id,
        nombre: c.nombre,
        telefono: c.telefono,
        nit: c.nit,
        email: c.email,
        descuento_pct: mejor?.pct ?? 0,
        descuento_nombre: mejor?.nombre ?? null,
      };
    });
    return NextResponse.json({ data });
  } catch (e) { return handleApiError(e); }
}
