import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calcularRinde } from '@/lib/server/inventario/disponibilidad';
import { calcularPrecioFinal } from '@/lib/server/productos/precio';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { resolverProducto } from '@/lib/server/productos/overrides';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const marca = searchParams.get('marca');
    // Menú de la sucursal pedida; si no se indica, el de la principal.
    const sucursalId = await resolverSucursal(searchParams.get('sucursal'));

    // El estado de publicación puede estar sobrescrito por la sucursal, así que
    // el filtro fino se hace después de resolver overrides. Acá solo se pide lo
    // que el local tiene habilitado y a la venta.
    const whereClause: any = {
      sucursales: { some: { sucursal_id: sucursalId, disponible: true } },
    };

    const productos = await prisma.producto.findMany({
      where: whereClause,
      include: {
        categoria_id: { include: { categoria: true } },
        marcas: { include: { marca: true } },
        sucursales: { where: { sucursal_id: sucursalId } },
        // Receta y stock del local: el rinde y el "agotado" son de esta sucursal.
        recetaProducto_id: {
          where: { sucursal_id: sucursalId },
          include: { insumo: { include: { stocks: { where: { sucursal_id: sucursalId } } } } },
        },
        insumo_reventa: {
          select: {
            stock_actual: true,
            activo: true,
            stocks: { where: { sucursal_id: sucursalId }, select: { stock_actual: true, activo: true } },
          },
        },
        promocionProducto_id: {
          include: {
            promocionDescuentos: {
              include: { reglasHorarias_id: true }
            }
          }
        }
      },
      orderBy: { nombre: 'asc' },
    });

    const now = new Date();

    const data = productos.flatMap(p => {
      // La ficha que ve el cliente es la de esta sucursal: lo que el local haya
      // sobrescrito manda, y lo que no, se hereda del catálogo compartido.
      const base = resolverProducto(p, sucursalId);

      // Publicado en ESTE local: el catálogo puede decir otra cosa.
      if (base.estado_publicacion !== 'PUBLICADO' || !base.disponible) return [];

      const categorias = base.categoria_id;
      const marcasVigentes = base.marcas;
      if (marca && !marcasVigentes.some(m => m.marca.key === marca)) return [];

      // Lógica de precio compartida con POST /api/pedidos (server-side pricing)
      const { precioFinal, descuento: descuentoMonto } = calcularPrecioFinal(base, now, sucursalId);

      const { rinde, agotado } = calcularRinde(p);

      // La receta, los insumos (costos, stock, proveedor) y la configuración de
      // promociones solo se cargan para calcular precio/rinde en el servidor:
      // NUNCA salen al público (la tienda ya recibe el precio final calculado).
      // `heredado` es detalle de administración: al público no le importa de
      // dónde sale cada campo.
      const { recetaProducto_id: _receta, insumo_reventa: _reventa, promocionProducto_id: _promos, sucursales: _sucursales, heredado: _heredado, ...publico } = base;

      return [{
        ...publico,
        categoria_id: categorias,
        marcas: marcasVigentes,
        sucursal_id: sucursalId,
        precio_original: base.precio,
        precio: precioFinal,
        descuentoAplicado: descuentoMonto > 0 ? descuentoMonto : undefined,
        rinde,
        agotado,
      }];
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/productos error:', error);
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
  }
}
