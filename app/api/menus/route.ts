import { NextResponse } from 'next/server';
import { menusPublicados } from '@/lib/server/menus/menus';

/**
 * Los menús que la web puede mostrar: la landing arma sus secciones con esto y
 * /menu/[slug] resuelve la carta que pidió el visitante. Pública y sin auth,
 * igual que /api/productos, porque es contenido de la tienda.
 *
 * Solo devuelve los PUBLICADOS: un menú en borrador o archivado no existe para
 * el visitante, ni siquiera entrando a su URL de memoria.
 */
export async function GET() {
  try {
    return NextResponse.json({ data: await menusPublicados() });
  } catch (error) {
    console.error('Error al listar menús:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
