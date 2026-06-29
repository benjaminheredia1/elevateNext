import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { z } from 'zod';

const MarcaSchema = z.object({
  nombre: z.string().min(1).max(60),
  key:    z.string().min(1).max(40).optional(),
  color:  z.string().optional(),
});


// ─── GET: listar todas las marcas ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);

    const marcas = await prisma.marca.findMany({
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json({ data: marcas });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── POST: crear una marca nueva ──────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = MarcaSchema.parse(body);

    const marca = await prisma.marca.create({
      data: {
        nombre: parsed.nombre,
        key:    parsed.key    ?? parsed.nombre.toLowerCase().replace(/\s+/g, '_'),
        color:  parsed.color  ?? null,
      },
    });


    return NextResponse.json({ data: marca }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
