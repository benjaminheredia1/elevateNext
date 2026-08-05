/**
 * Un menú es una carta de la web: agrupa productos y se publica en /menu/<slug>.
 * Este módulo es el contrato que comparten la web pública, el admin y el
 * servidor, así que no importa prisma: lo puede usar un componente de cliente.
 */

export type EstadoMenu = 'BORRADOR' | 'PUBLICADO' | 'ARCHIVADO';

/** Menú con los campos opcionales ya resueltos (ver aMenuPublico en el server). */
export interface Menu {
  id: number;
  /** Identificador interno estable. Lo usan el filtro de caja y la analítica. */
  key: string;
  /** Lo que va en la URL pública. Se puede cambiar sin tocar `key`. */
  slug: string;
  nombre: string;
  estado: EstadoMenu;
  orden: number;
  color: string | null;
  eyebrow: string | null;
  kicker: string | null;
  titulo: string;
  tagline: string | null;
  descripcion: string | null;
  bullets: string[];
  cta_texto: string;
  icono: string | null;
  imagen_url: string | null;
}

/**
 * De "Elevate × Fitbull" a "elevate-fitbull". Sin acentos ni símbolos, porque
 * termina en una URL (/menu/<slug>).
 */
export function aSlug(texto: string): string {
  return texto
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}
