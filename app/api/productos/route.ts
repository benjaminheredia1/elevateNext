import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const productos = await prisma.producto.findMany({
      where: { estado_publicacion: 'PUBLICADO', disponible: true },
      include: {
        categoria_id: { include: { categoria: true } },
        recetaProducto_id: { include: { insumo: true } },
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
      let precioFinal = p.precio;
      let descuentoActivo = false;
      let descuentoMonto = 0;

      for (const pp of p.promocionProducto_id) {
        const promo = pp.promocionDescuentos;
        // Check if any rule is active
        const isActiva = promo.reglasHorarias_id.some(r => now >= r.fecha_inicio && now <= r.fecha_fin);
        
        if (isActiva) {
          descuentoActivo = true;
          let nuevoPrecio = p.precio;
          if (promo.valor.includes('%')) {
            const pct = parseFloat(promo.valor.replace('%', ''));
            nuevoPrecio = p.precio - (p.precio * pct / 100);
          } else {
            nuevoPrecio = p.precio - parseFloat(promo.valor);
          }
          if (nuevoPrecio < precioFinal) {
            precioFinal = Math.max(0, nuevoPrecio);
            descuentoMonto = p.precio - precioFinal;
          }
        }
      }

      return {
        ...p,
        precio_original: p.precio,
        precio: precioFinal,
        descuentoAplicado: descuentoMonto > 0 ? descuentoMonto : undefined
      };
    });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: 'Error al obtener productos' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nombre, descripcion, precio, imagen_url, disponible } = body;
    const producto = await prisma.producto.create({
      data: { nombre, descripcion, precio: Number(precio), imagen_url, disponible: disponible ?? true },
    });
    return NextResponse.json({ data: producto }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Error al crear producto' }, { status: 500 });
  }
}
