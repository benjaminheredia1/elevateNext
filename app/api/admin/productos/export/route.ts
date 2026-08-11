import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { alcanceSucursal, SIN_ALCANCE } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { excelResponse, montoExcel } from '@/lib/server/export/excel';

const TIPO_LABEL: Record<string, string> = { ELABORADO: 'Elaborado', REVENTA: 'Reventa' };

/**
 * Catálogo en Excel. El precio y la disponibilidad salen de la habilitación por
 * sucursal, no del catálogo: el mismo plato puede costar distinto en cada local
 * y es ese precio el que se cobra.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { searchParams } = new URL(req.url);
    const sucursal = alcanceSucursal(session, parseSucursal(searchParams));

    const filas = await prisma.productoSucursal.findMany({
      where: {
        ...(sucursal && sucursal !== SIN_ALCANCE ? { sucursal_id: sucursal } : {}),
        ...(sucursal === SIN_ALCANCE ? { sucursal_id: SIN_ALCANCE } : {}),
      },
      include: {
        producto: {
          select: {
            nombre: true, tipo: true,
            categoria_id: { select: { categoria: { select: { nombre: true } } } },
          },
        },
        sucursal: { select: { nombre: true } },
      },
      orderBy: [{ sucursal_id: 'asc' }, { producto: { nombre: 'asc' } }],
    });

    return await excelResponse('productos', 'Productos', [
      // El nombre puede estar sobrescrito por el local; si no, manda el catálogo.
      { header: 'Producto', ancho: 30, valor: p => p.nombre ?? p.producto.nombre },
      {
        header: 'Categoría', ancho: 18,
        valor: p => p.producto.categoria_id.map(c => c.categoria.nombre).join(', '),
      },
      { header: 'Tipo', ancho: 12, valor: p => TIPO_LABEL[p.producto.tipo] ?? p.producto.tipo },
      { header: 'Precio Bs', ancho: 12, tipo: 'numero', valor: p => montoExcel(p.precio) },
      { header: 'Disponible', ancho: 12, valor: p => (p.disponible ? 'Sí' : 'No') },
      { header: 'Publicación', ancho: 14, valor: p => p.estado_publicacion ?? '' },
      { header: 'Sucursal', ancho: 22, valor: p => p.sucursal.nombre },
    ], filas);
  } catch (e) { return handleApiError(e); }
}
