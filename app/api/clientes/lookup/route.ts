import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { isRateLimited } from '@/lib/server/rate-limit';

/**
 * Reconocimiento de cliente en el checkout.
 * Dado un teléfono o carnet/NIT, devuelve solo el nombre del cliente recurrente
 * (a partir de su pedido más reciente). No expone correo, dirección ni más datos.
 */
export async function GET(req: NextRequest) {
  // Frena la enumeración masiva de teléfonos/NIT (el checkout legítimo consulta 1-2 veces)
  if (isRateLimited(req, 60000, 10)) {
    return NextResponse.json({ data: null }, { status: 429 });
  }
  try {
    const q = (new URL(req.url).searchParams.get('q') ?? '').trim();
    if (q.length < 5) return NextResponse.json({ data: null });

    const tx = await prisma.transaccion.findFirst({
      where: { OR: [{ cliente_telefono: q }, { cliente_nit: q }] },
      orderBy: { created_at: 'desc' },
      select: { cliente_nombre: true },
    });

    return NextResponse.json({ data: tx?.cliente_nombre ? { nombre: tx.cliente_nombre } : null });
  } catch {
    return NextResponse.json({ data: null });
  }
}

export const dynamic = 'force-dynamic';
