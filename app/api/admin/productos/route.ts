import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ProductoConFichaSchema } from '@/lib/server/dto/inventario.dto';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { logAudit } from '@/lib/server/audit/audit.service';
import { assertPublicable } from '@/lib/server/productos/publicacion';

// ─── GET: listar productos con estado, costo y food cost ────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const productos = await prisma.producto.findMany({
      include: {
        categoria_id:         { include: { categoria: true } },
        marcas:               { include: { marca: true } },
        recetaProducto_id:    { include: { insumo: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    // Enriquecer con costo y food cost
    const enriquecidos = await Promise.all(
      productos.map(async (p) => {
        const costo    = await costoFichaTecnica(p.id);
        const precioNum = Number(p.precio);
        const foodCost = precioNum > 0 ? Math.round((costo / precioNum) * 10000) / 100 : 0;
        return { ...p, costo_calculado: Math.round(costo * 100) / 100, food_cost_pct: foodCost };
      }),
    );

    return NextResponse.json({ data: enriquecidos });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── POST: crear producto con marcas, categorías y receta ───────────
export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    const body   = await req.json();
    const parsed = ProductoConFichaSchema.parse(body);
    if (parsed.estado_publicacion === 'PUBLICADO') {
      assertPublicable({
        nombre: parsed.nombre,
        descripcion: parsed.descripcion,
        precio: parsed.precio,
        imagen_url: parsed.imagen_url ?? null,
        tipo: parsed.tipo,
        insumo_reventa_id: parsed.insumo_reventa_id ?? null,
        tiene_nuevo_insumo_reventa: !!parsed.nuevo_insumo_reventa,
        marcas: parsed.marcas,
        recetaProducto_id: parsed.receta,
      });
    }

    const producto = await prisma.$transaction(async (tx) => {
      // 0. Reventa: crear el insumo de inventario automáticamente (si se enviaron sus datos)
      let insumoReventaId = parsed.insumo_reventa_id ?? null;
      if (parsed.tipo === 'REVENTA' && parsed.nuevo_insumo_reventa && !insumoReventaId) {
        const n = parsed.nuevo_insumo_reventa;
        const insumo = await tx.insumo.create({
          data: {
            nombre:         parsed.nombre,
            unidad_medida:  n.unidad_medida,
            stock_actual:   n.stock,
            stock_minimo:   n.punto_reorden,
            punto_critico:  n.nivel_critico,
            costo_promedio: n.costo_unitario,
            proveedor:      n.proveedor ?? null,
            es_mixto:       false,
          },
        });
        insumoReventaId = insumo.id;
      }

      // 1. Crear el producto base
      const prod = await tx.producto.create({
        data: {
          nombre:             parsed.nombre,
          descripcion:        parsed.descripcion,
          precio:             parsed.precio,
          imagen_url:         parsed.imagen_url ?? null,
          disponible:         parsed.disponible,
          tipo:               parsed.tipo,
          estado_publicacion: parsed.estado_publicacion,
          calorias:           parsed.calorias ?? null,
          proteina:           parsed.proteina ?? null,
          insumo_reventa_id:  insumoReventaId,
        },
      });

      // 2. Categorías
      if (parsed.categorias.length > 0) {
        await tx.categoriasProducto.createMany({
          data: parsed.categorias.map((cat_id) => ({ producto_id: prod.id, categoria_id: cat_id })),
          skipDuplicates: true,
        });
      }

      // 3. Marcas
      if (parsed.marcas.length > 0) {
        await tx.productoMarca.createMany({
          data: parsed.marcas.map((marca_id) => ({ producto_id: prod.id, marca_id })),
          skipDuplicates: true,
        });
      }

      // 4. Receta / ficha técnica
      if (parsed.receta.length > 0) {
        await tx.recetasProducto.createMany({
          data: parsed.receta.map((item) => ({
            producto_id:        prod.id,
            insumo_id:          item.insumo_id,
            cantidad_utilizada: item.cantidad_utilizada,
          })),
          skipDuplicates: true,
        });
      }

      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'CREO',
        entidad: 'Producto', entidadId: prod.id,
        detalle: `Producto "${prod.nombre}" creado con ${parsed.receta.length} insumos en receta`,
      }, tx);

      return prod;
    });

    // Calcular costo tras la creación
    const costo    = await costoFichaTecnica(producto.id);
    const precioNum = Number(producto.precio);
    const foodCost = precioNum > 0 ? Math.round((costo / precioNum) * 10000) / 100 : 0;

    return NextResponse.json(
      { data: { ...producto, costo_calculado: Math.round(costo * 100) / 100, food_cost_pct: foodCost } },
      { status: 201 },
    );
  } catch (error) {
    return handleApiError(error);
  }
}
