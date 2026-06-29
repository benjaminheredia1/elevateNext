import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ProductoConFichaSchema } from '@/lib/server/dto/inventario.dto';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { logAudit } from '@/lib/server/audit/audit.service';
import { assertPublicable } from '@/lib/server/productos/publicacion';

type Ctx = { params: Promise<{ id: string }> };

async function enrich(id: number) {
  const prod = await prisma.producto.findUnique({
    where: { id },
    include: {
      categoria_id: { include: { categoria: true } },
      marcas: { include: { marca: true } },
      recetaProducto_id: { include: { insumo: true } },
    },
  });
  if (!prod) return null;
  const costo = await costoFichaTecnica(prod.id);
  const foodCost = prod.precio > 0 ? Math.round((costo / prod.precio) * 10000) / 100 : 0;
  return { ...prod, costo_calculado: Math.round(costo * 100) / 100, food_cost_pct: foodCost };
}

// ─── GET: detalle de un producto (para precargar el wizard en edición) ───
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const data = await enrich(Number(id));
    if (!data) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });
    return NextResponse.json({ data });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── PUT: editar producto completo (reemplazo de categorías/marcas/receta) ───
export async function PUT(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const productoId = Number(id);
    const parsed = ProductoConFichaSchema.parse(await req.json());
    if (parsed.estado_publicacion === 'PUBLICADO') {
      assertPublicable({
        nombre: parsed.nombre,
        descripcion: parsed.descripcion,
        precio: parsed.precio,
        imagen_url: parsed.imagen_url ?? null,
        tipo: parsed.tipo,
        insumo_reventa_id: parsed.insumo_reventa_id ?? null,
        marcas: parsed.marcas,
        recetaProducto_id: parsed.receta,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.producto.update({
        where: { id: productoId },
        data: {
          nombre: parsed.nombre,
          descripcion: parsed.descripcion,
          precio: parsed.precio,
          imagen_url: parsed.imagen_url ?? null,
          disponible: parsed.disponible,
          tipo: parsed.tipo,
          estado_publicacion: parsed.estado_publicacion,
          calorias: parsed.calorias ?? null,
          proteina: parsed.proteina ?? null,
          insumo_reventa_id: parsed.insumo_reventa_id ?? null,
        },
      });

      // Reemplazo de relaciones
      await tx.categoriasProducto.deleteMany({ where: { producto_id: productoId } });
      if (parsed.categorias.length > 0) {
        await tx.categoriasProducto.createMany({
          data: parsed.categorias.map((categoria_id) => ({ producto_id: productoId, categoria_id })),
          skipDuplicates: true,
        });
      }

      await tx.productoMarca.deleteMany({ where: { producto_id: productoId } });
      if (parsed.marcas.length > 0) {
        await tx.productoMarca.createMany({
          data: parsed.marcas.map((marca_id) => ({ producto_id: productoId, marca_id })),
          skipDuplicates: true,
        });
      }

      await tx.recetasProducto.deleteMany({ where: { producto_id: productoId } });
      if (parsed.receta.length > 0) {
        await tx.recetasProducto.createMany({
          data: parsed.receta.map((item) => ({
            producto_id: productoId,
            insumo_id: item.insumo_id,
            cantidad_utilizada: item.cantidad_utilizada,
          })),
          skipDuplicates: true,
        });
      }

      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
        entidad: 'Producto', entidadId: productoId,
        detalle: `Producto "${parsed.nombre}" editado`,
      }, tx);
    });

    return NextResponse.json({ data: await enrich(productoId) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── PATCH: cambiar estado de publicación (publicar/despublicar/archivar) ───
const PatchSchema = z.object({ estado_publicacion: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO']) });

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const productoId = Number(id);
    const { estado_publicacion } = PatchSchema.parse(await req.json());

    const actual = await prisma.producto.findUnique({
      where: { id: productoId },
      include: {
        marcas: true,
        recetaProducto_id: true,
      },
    });
    if (!actual) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    if (estado_publicacion === 'PUBLICADO') {
      assertPublicable(actual);
    }

    const prod = await prisma.producto.update({
      where: { id: productoId },
      data: { estado_publicacion, disponible: estado_publicacion === 'PUBLICADO' },
    });

    await logAudit({
      usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
      entidad: 'Producto', entidadId: productoId,
      detalle: `Producto "${prod.nombre}" → ${estado_publicacion}`,
    });

    return NextResponse.json({ data: prod });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── DELETE: eliminar producto (limpia relaciones de catálogo) ───
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const productoId = Number(id);

    const prod = await prisma.producto.findUnique({ where: { id: productoId } });
    if (!prod) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.categoriasProducto.deleteMany({ where: { producto_id: productoId } });
      await tx.productoMarca.deleteMany({ where: { producto_id: productoId } });
      await tx.recetasProducto.deleteMany({ where: { producto_id: productoId } });
      await tx.promocionProducto.deleteMany({ where: { producto_id: productoId } });
      await tx.producto.delete({ where: { id: productoId } });
      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'ELIMINO',
        entidad: 'Producto', entidadId: productoId,
        detalle: `Producto "${prod.nombre}" eliminado`,
      }, tx);
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
