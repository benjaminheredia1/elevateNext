import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { calcularRinde } from '@/lib/server/inventario/disponibilidad';
import { calcularPrecioFinal } from '@/lib/server/productos/precio';
import { guard, ADMIN } from '@/lib/server/auth/guard';

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
        insumo_reventa: { select: { stock_actual: true } },
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
    return NextResponse.json({ error: 'Error al obtener productos', details: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await guard(req, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { nombre, descripcion, precio, imagen_url, disponible, estado_publicacion, marcas } = body;
    
    const productoData: any = { 
      nombre, 
      descripcion, 
      precio: Number(precio), 
      imagen_url, 
      disponible: disponible ?? true,
      estado_publicacion: estado_publicacion ?? 'BORRADOR',
    };

    if (marcas && marcas.length > 0) {
      // Find the brands by key
      const dbMarcas = await prisma.marca.findMany({
        where: { key: { in: marcas } }
      });
      if (dbMarcas.length > 0) {
        productoData.marcas = {
          create: dbMarcas.map(m => ({
            marca: { connect: { id: m.id } }
          }))
        };
      }
    }

    const producto = await prisma.producto.create({
      data: productoData,
    });
    return NextResponse.json({ data: producto }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 });
  }
}
