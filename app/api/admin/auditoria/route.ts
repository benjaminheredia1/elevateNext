import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import prisma from '@/lib/prisma';
import type { Rol } from '@prisma/client';

export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q')?.toLowerCase() ?? '';
    const rol = searchParams.get('rol') as Rol | null;
    const page = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit = 50;
    const skip = (page - 1) * limit;

    const where = {
      ...(rol ? { rol } : {}),
      ...(q ? {
        OR: [
          { detalle: { contains: q, mode: 'insensitive' as const } },
          { entidad: { contains: q, mode: 'insensitive' as const } },
          { usuario: { nombre: { contains: q, mode: 'insensitive' as const } } },
        ],
      } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.registroAuditoria.findMany({
        where,
        include: { usuario: { select: { nombre: true, apellido_paterno: true, email: true } } },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
      prisma.registroAuditoria.count({ where }),
    ]);

    return NextResponse.json({
      items: items.map(r => ({
        ...r,
        monto: r.monto != null ? Number(r.monto) : null,
        usuario_nombre: `${r.usuario.nombre} ${r.usuario.apellido_paterno}`,
        usuario_email: r.usuario.email,
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (e) { return handleApiError(e); }
}
