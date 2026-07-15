import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calcularRinde } from '@/lib/server/inventario/disponibilidad';
import { calcularPrecioFinal } from '@/lib/server/productos/precio';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const marca = searchParams.get('marca');

    const whereClause: any = { estado_publicacion: 'PUBLICADO', disponible: true };
    if (marca) {
      whereClause.marcas = { some: { marca: { key: marca } } };
    }

    const productos = await prisma.producto.findMany({
      where: whereClause,
      include: {
        categoria_id: { include: { categoria: true } },
        recetaProducto_id: { include: { insumo: true } },
        insumo_reventa: { select: { stock_actual: true, activo: true } },
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

    const data = productos.map(p => {
      // Lógica de precio compartida con POST /api/pedidos (server-side pricing)
      const { precioFinal, descuento: descuentoMonto } = calcularPrecioFinal(p, now);

      const { rinde, agotado } = calcularRinde(p);

      return {
        ...p,
        precio_original: p.precio,
        precio: precioFinal,
        descuentoAplicado: descuentoMonto > 0 ? descuentoMonto : undefined,
        rinde,
        agotado,
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    console.error('GET /api/productos error:', error);
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
  }
}
