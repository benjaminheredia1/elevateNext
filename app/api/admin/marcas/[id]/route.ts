import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ConflictError, NotFoundError } from '@/lib/server/errors';
import { aMenuPublico, slugLibre } from '@/lib/server/menus/menus';
import { z } from 'zod';

/** Todo opcional: la pantalla manda solo lo que cambió (ej. archivar u ordenar). */
const MenuPatchSchema = z.object({
  nombre:      z.string().min(1).max(60).optional(),
  slug:        z.string().min(1).max(40).optional(),
  color:       z.string().max(20).nullable().optional(),
  estado:      z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']).optional(),
  orden:       z.number().int().min(0).optional(),
  eyebrow:     z.string().max(60).nullable().optional(),
  kicker:      z.string().max(60).nullable().optional(),
  titulo:      z.string().max(80).nullable().optional(),
  tagline:     z.string().max(200).nullable().optional(),
  descripcion: z.string().max(1200).nullable().optional(),
  bullets:     z.array(z.string().max(120)).max(6).optional(),
  cta_texto:   z.string().max(60).nullable().optional(),
  icono:       z.string().max(40).nullable().optional(),
  imagen_url:  z.string().max(500).nullable().optional(),
});

async function buscar(id: number) {
  const marca = await prisma.marca.findUnique({ where: { id } });
  if (!marca) throw new NotFoundError('Menú no encontrado');
  return marca;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN', 'CAJERO']);
    const { id } = await params;
    const marca = await buscar(Number(id));
    return NextResponse.json({ data: aMenuPublico(marca) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { id } = await params;
    const menuId = Number(id);
    await buscar(menuId);

    const parsed = MenuPatchSchema.parse(await req.json());
    // `key` no se toca nunca: es lo que usan el filtro de caja, la analítica y
    // los enlaces internos para identificar la carta.
    const { slug, ...resto } = parsed;

    const marca = await prisma.marca.update({
      where: { id: menuId },
      data: {
        ...resto,
        // Normaliza y desambigua: el slug va en la URL pública.
        ...(slug !== undefined ? { slug: await slugLibre(slug, menuId) } : {}),
      },
    });

    return NextResponse.json({ data: aMenuPublico(marca) });
  } catch (error) {
    return handleApiError(error);
  }
}

/**
 * Borrado definitivo, solo si la carta está vacía. Con productos adentro se
 * frena: ProductoMarca está en cascada, así que borrar acá desvincularía los
 * productos en silencio y la analítica por menú perdería el histórico. Para
 * sacar una carta de la web está ARCHIVADO.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const { id } = await params;
    const menuId = Number(id);
    await buscar(menuId);

    const productos = await prisma.productoMarca.findMany({
      where: { marca_id: menuId },
      select: { producto_id: true },
      distinct: ['producto_id'],
    });
    if (productos.length > 0) {
      throw new ConflictError(
        `No se puede eliminar: ${productos.length} producto(s) están en este menú. `
        + 'Quitalos del menú o archivá la carta para sacarla de la web sin perder el histórico.',
      );
    }

    await prisma.marca.delete({ where: { id: menuId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
