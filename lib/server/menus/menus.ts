import prisma from '@/lib/prisma';
import type { Marca } from '@prisma/client';
import { aSlug, type Menu } from '@/lib/menus';

/**
 * Menús (las cartas públicas). Viven en la tabla `Marca`: el nombre quedó de
 * cuando solo eran marcas de producto, y renombrarla implicaría tocar todas las
 * relaciones de producto, así que se mantiene y acá se la trata como menú.
 */

/**
 * Resuelve los campos opcionales para que la vista nunca tenga que decidir qué
 * mostrar cuando el menú se creó sin llenar toda la presentación.
 */
export function aMenuPublico(m: Marca): Menu {
  return {
    id: m.id,
    key: m.key,
    slug: m.slug,
    nombre: m.nombre,
    estado: m.estado as Menu['estado'],
    orden: m.orden,
    color: m.color,
    eyebrow: m.eyebrow,
    kicker: m.kicker ?? m.eyebrow,
    titulo: m.titulo?.trim() || m.nombre,
    tagline: m.tagline,
    descripcion: m.descripcion,
    bullets: m.bullets,
    cta_texto: m.cta_texto?.trim() || 'Ver menú',
    icono: m.icono,
    imagen_url: m.imagen_url,
  };
}

/**
 * Busca un slug libre agregando -2, -3… Sin esto, crear dos menús con nombres
 * que se normalizan igual reventaría contra el índice único.
 */
export async function slugLibre(base: string, excluirId?: number): Promise<string> {
  const raiz = aSlug(base) || 'menu';
  for (let intento = 0; ; intento++) {
    const candidato = intento === 0 ? raiz : `${raiz}-${intento + 1}`;
    const usado = await prisma.marca.findFirst({
      where: { slug: candidato, ...(excluirId ? { NOT: { id: excluirId } } : {}) },
      select: { id: true },
    });
    if (!usado) return candidato;
  }
}

/** Los menús que salen a la web, en el orden que definió el dueño. */
export async function menusPublicados(): Promise<Menu[]> {
  const marcas = await prisma.marca.findMany({
    where: { estado: 'PUBLICADO' },
    orderBy: [{ orden: 'asc' }, { nombre: 'asc' }],
  });
  return marcas.map(aMenuPublico);
}
