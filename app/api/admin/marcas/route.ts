import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { aMenuPublico, slugLibre } from '@/lib/server/menus/menus';
import { z } from 'zod';

/**
 * Menús (cartas). La tabla es `Marca` por historia: empezó siendo solo la marca
 * del producto y hoy es la carta que se publica en la web.
 */
const MenuSchema = z.object({
  nombre:      z.string().min(1).max(60),
  key:         z.string().min(1).max(40).optional(),
  slug:        z.string().min(1).max(40).optional(),
  color:       z.string().max(20).optional().nullable(),
  estado:      z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']).optional(),
  orden:       z.number().int().min(0).optional(),
  eyebrow:     z.string().max(60).optional().nullable(),
  kicker:      z.string().max(60).optional().nullable(),
  titulo:      z.string().max(80).optional().nullable(),
  tagline:     z.string().max(200).optional().nullable(),
  descripcion: z.string().max(1200).optional().nullable(),
  bullets:     z.array(z.string().max(120)).max(6).optional(),
  cta_texto:   z.string().max(60).optional().nullable(),
  icono:       z.string().max(40).optional().nullable(),
  imagen_url:  z.string().max(500).optional().nullable(),
});

// ─── GET: listar los menús con cuántos productos tiene cada uno ────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);

    const marcas = await prisma.marca.findMany({
      orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
    });

    // Un producto puede tener varias filas en ProductoMarca (la del catálogo más
    // una por sucursal que lo sobrescriba), así que contar filas exagera. Se
    // cuentan productos distintos, que es lo que el dueño ve en la carta.
    const vinculos = await prisma.productoMarca.findMany({
      select: { marca_id: true, producto_id: true },
      distinct: ['marca_id', 'producto_id'],
    });
    const productosPorMenu = new Map<number, number>();
    for (const v of vinculos) {
      productosPorMenu.set(v.marca_id, (productosPorMenu.get(v.marca_id) ?? 0) + 1);
    }

    return NextResponse.json({
      data: marcas.map(m => ({ ...aMenuPublico(m), productos: productosPorMenu.get(m.id) ?? 0 })),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── POST: crear un menú nuevo ────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = MenuSchema.parse(body);

    // Un menú nuevo va al final de la lista salvo que se pida otra posición.
    const ultimo = await prisma.marca.aggregate({ _max: { orden: true } });

    const marca = await prisma.marca.create({
      data: {
        nombre: parsed.nombre,
        key:    parsed.key ?? await slugLibre(parsed.nombre),
        slug:   await slugLibre(parsed.slug ?? parsed.nombre),
        color:  parsed.color ?? null,
        // Nace en borrador: se arma la carta y se publica cuando está lista.
        estado: parsed.estado ?? 'BORRADOR',
        orden:  parsed.orden ?? (ultimo._max.orden ?? 0) + 1,
        eyebrow:     parsed.eyebrow ?? null,
        kicker:      parsed.kicker ?? null,
        titulo:      parsed.titulo ?? null,
        tagline:     parsed.tagline ?? null,
        descripcion: parsed.descripcion ?? null,
        bullets:     parsed.bullets ?? [],
        cta_texto:   parsed.cta_texto ?? null,
        icono:       parsed.icono ?? null,
        imagen_url:  parsed.imagen_url ?? null,
      },
    });

    return NextResponse.json({ data: aMenuPublico(marca) }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
