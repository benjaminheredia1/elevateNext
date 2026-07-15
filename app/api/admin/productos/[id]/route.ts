import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ConflictError } from '@/lib/server/errors';
import { ProductoConFichaSchema } from '@/lib/server/dto/inventario.dto';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { logAudit } from '@/lib/server/audit/audit.service';
import { assertPublicable } from '@/lib/server/productos/publicacion';
import { bajaInsumoExclusivoDeReventa, reactivarInsumoDeReventaSiCascada } from '@/lib/server/insumos/insumos.service';

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
  const precioNum = Number(prod.precio);
  const foodCost = precioNum > 0 ? Math.round((costo / precioNum) * 10000) / 100 : 0;
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
        tiene_nuevo_insumo_reventa: !!parsed.nuevo_insumo_reventa,
        marcas: parsed.marcas,
        recetaProducto_id: parsed.receta,
      });
    }

    await prisma.$transaction(async (tx) => {
      // Reventa: actualizar el insumo vinculado o crear uno nuevo con los datos enviados
      let insumoReventaId = parsed.insumo_reventa_id ?? null;
      if (parsed.tipo === 'REVENTA' && parsed.nuevo_insumo_reventa) {
        const n = parsed.nuevo_insumo_reventa;
        const insumoData = {
          unidad_medida:  n.unidad_medida,
          stock_minimo:   n.punto_reorden,
          punto_critico:  n.nivel_critico,
          costo_promedio: n.costo_unitario,
          proveedor:      n.proveedor ?? null,
        };
        if (insumoReventaId) {
          // El stock NO se toca aquí: editar el producto no es un movimiento de
          // inventario. Correcciones de stock → módulo de inventario (AJUSTE),
          // que sí deja MovimientoInterno y no pisa ventas concurrentes.
          await tx.insumo.update({ where: { id: insumoReventaId }, data: insumoData });
        } else {
          const insumo = await tx.insumo.create({
            data: { nombre: parsed.nombre, es_mixto: false, stock_actual: n.stock, ...insumoData },
          });
          insumoReventaId = insumo.id;
          if (n.stock > 0) {
            await tx.movimientoInterno.create({
              data: {
                insumo_id:       insumo.id,
                tipo_movimiento: 'INGRESO',
                cantidad:        n.stock,
                descripcion:     `Stock inicial de "${parsed.nombre}" (alta de insumo de reventa)`,
                costo_unitario:  n.costo_unitario,
                responsable:     String(session.id),
              },
            });
          }
        }
      }

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
          insumo_reventa_id: insumoReventaId,
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

      // Si estaba en revisión y la nueva ficha ya no referencia insumos dados de
      // baja, la revisión queda resuelta automáticamente al guardar.
      const idsReferenciados = [
        ...parsed.receta.map((item) => item.insumo_id),
        ...(insumoReventaId ? [insumoReventaId] : []),
      ];
      const inactivosRestantes = idsReferenciados.length > 0
        ? await tx.insumo.count({ where: { id: { in: idsReferenciados }, activo: false } })
        : 0;
      if (inactivosRestantes === 0) {
        await tx.producto.updateMany({
          where: { id: productoId, en_revision: true },
          data: { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
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

// ─── PATCH: cambiar estado de publicación (publicar/despublicar/archivar/dar de baja) ───
const PatchSchema = z.object({
  estado_publicacion: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO', 'BAJA']),
  motivo: z.string().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const productoId = Number(id);
    const { estado_publicacion, motivo } = PatchSchema.parse(await req.json());

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
    if (estado_publicacion === 'BAJA' && !motivo) {
      return NextResponse.json({ error: 'El motivo de la baja es obligatorio' }, { status: 400 });
    }

    const { prod, insumoBajado, insumoReactivado } = await prisma.$transaction(async (tx) => {
      const prod = await tx.producto.update({
        where: { id: productoId },
        data: {
          estado_publicacion,
          disponible: estado_publicacion === 'PUBLICADO',
          motivo_baja: estado_publicacion === 'BAJA' ? motivo : null,
          fecha_baja: estado_publicacion === 'BAJA' ? new Date() : null,
          // Dar de baja el producto es una de las salidas del flujo de revisión
          ...(estado_publicacion === 'BAJA'
            ? { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null }
            : {}),
        },
      });

      // Baja/restauración espejada del insumo de reventa de uso exclusivo
      let insumoBajado = false;
      let insumoReactivado = false;
      if (actual.tipo === 'REVENTA') {
        if (estado_publicacion === 'BAJA' && actual.estado_publicacion !== 'BAJA') {
          insumoBajado = await bajaInsumoExclusivoDeReventa(tx, actual, motivo!);
        } else if (actual.estado_publicacion === 'BAJA' && estado_publicacion !== 'BAJA') {
          insumoReactivado = await reactivarInsumoDeReventaSiCascada(tx, actual.insumo_reventa_id);
        }
      }

      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
        entidad: 'Producto', entidadId: productoId,
        detalle: estado_publicacion === 'BAJA'
          ? `Producto "${prod.nombre}" dado de baja. Motivo: ${motivo}${insumoBajado ? ' (insumo de reventa dado de baja en cascada)' : ''}`
          : `Producto "${prod.nombre}" → ${estado_publicacion}${insumoReactivado ? ' (insumo de reventa reactivado)' : ''}`,
      }, tx);

      return { prod, insumoBajado, insumoReactivado };
    });

    return NextResponse.json({ data: prod, insumo_reventa: { dado_de_baja: insumoBajado, reactivado: insumoReactivado } });
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

    const tieneVentas = await prisma.transaccionesDetalles.count({ where: { producto_id: productoId } });
    if (tieneVentas > 0) {
      throw new ConflictError('No se puede eliminar: el producto tiene pedidos asociados. Usa "Dar de baja" en su lugar.');
    }

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
