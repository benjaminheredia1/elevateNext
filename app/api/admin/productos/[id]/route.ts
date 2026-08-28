import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError, ConflictError, NotFoundError, ValidationError } from '@/lib/server/errors';
import { aplicarOverrides, vigentesEnSucursal, resolverProducto, type CampoHeredable } from '@/lib/server/productos/overrides';
import { ProductoConFichaSchema } from '@/lib/server/dto/inventario.dto';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { logAudit } from '@/lib/server/audit/audit.service';
import { assertPublicable } from '@/lib/server/productos/publicacion';
import { resolverSucursal, alcanceSucursal } from '@/lib/server/sucursales/sucursal.service';
import { bajaInsumoExclusivoDeReventa, reactivarInsumoDeReventaSiCascada } from '@/lib/server/insumos/insumos.service';

type Ctx = { params: Promise<{ id: string }> };

/** Igualdad de conjuntos de ids, sin importar el orden ni los repetidos. */
function mismosIds(a: number[], b: number[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  return setA.size === setB.size && [...setA].every(id => setB.has(id));
}

/**
 * Valor a guardar en el override de la sucursal.
 *
 * Manda la decisión explícita del usuario: si el campo está en `heredar`, se
 * guarda null y el local sigue al catálogo; si no está, queda propio aunque hoy
 * coincida con el catálogo —que es lo que permite "congelar" un valor—.
 *
 * Sin `heredar` (clientes viejos, integraciones) se cae a la heurística
 * anterior: coincidir con el catálogo significa heredar.
 */
function hacerOverride(heredar: readonly CampoHeredable[] | undefined) {
  return function override<T>(campo: CampoHeredable, valor: T, delCatalogo: T): T | null {
    if (heredar) return heredar.includes(campo) ? null : valor;
    return valor === delCatalogo ? null : valor;
  };
}

/**
 * Detalle del producto tal como lo ve una sucursal (o el catálogo si no se
 * indica ninguna). Es lo que precarga el wizard, así que edita lo que ve.
 */
async function enrich(id: number, sucursalId: number | null) {
  const prod = await prisma.producto.findUnique({
    where: { id },
    include: {
      categoria_id: { include: { categoria: true } },
      marcas: { include: { marca: true } },
      recetaProducto_id: {
        ...(sucursalId != null ? { where: { sucursal_id: sucursalId } } : {}),
        include: { insumo: true },
      },
      ...(sucursalId != null ? { sucursales: { where: { sucursal_id: sucursalId } } } : {}),
    },
  });
  if (!prod) return null;

  // `heredado` viaja al wizard para que pueda decir, campo por campo, si el
  // valor es propio del local o viene del catálogo.
  const resuelto = resolverProducto(prod, sucursalId);

  const costo = await costoFichaTecnica(prod.id, undefined, sucursalId ?? undefined);
  const precioNum = Number(resuelto.precio);
  const foodCost = precioNum > 0 ? Math.round((costo / precioNum) * 10000) / 100 : 0;
  return {
    ...resuelto,
    costo_calculado: Math.round(costo * 100) / 100,
    food_cost_pct: foodCost,
  };
}

type HabilitacionConOverrides = Parameters<typeof aplicarOverrides>[1];

// ─── GET: detalle de un producto (para precargar el wizard en edición) ───
export async function GET(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    // El detalle es el de la sucursal en la que se está trabajando: un ADMIN
    // queda encerrado en la suya aunque pida otra por query string.
    const pedida = req.nextUrl.searchParams.get('sucursal');
    const alcance = alcanceSucursal(session, pedida ? Number(pedida) : undefined);
    const sucursalId = alcance != null ? await resolverSucursal(alcance) : null;

    const data = await enrich(Number(id), sucursalId);
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

    // Ámbito efectivo de la edición, para devolver la ficha que el usuario ve.
    let ambito: number | null = null;

    await prisma.$transaction(async (tx) => {
      // Sucursal cuya ficha se está editando. Si el pedido no la trae, la
      // edición es del catálogo: solo la hace el dueño en vista consolidada.
      const editaSucursal = parsed.sucursal_id != null;
      const sucursalId = await resolverSucursal(parsed.sucursal_id, tx);

      const catalogo = await tx.producto.findUnique({ where: { id: productoId } });
      if (!catalogo) throw new NotFoundError('Producto no encontrado');

      // Qué campos deja heredados esta edición. Solo aplica editando un local.
      const override = hacerOverride(editaSucursal ? parsed.heredar : undefined);

      // El tipo y su insumo espejo son la identidad del producto en el
      // inventario: si un local dijera REVENTA y otro ELABORADO, el descuento
      // de stock haría dos cosas distintas con la misma venta.
      if (editaSucursal && parsed.tipo !== catalogo.tipo) {
        throw new ValidationError(
          'El tipo (elaborado/reventa) es del catálogo y se cambia desde la vista consolidada del dueño: afecta a todas las sucursales.',
        );
      }

      // Reventa: actualizar el insumo vinculado o crear uno nuevo con los datos enviados
      let insumoReventaId = parsed.insumo_reventa_id ?? null;
      if (parsed.tipo !== 'ELABORADO' && parsed.nuevo_insumo_reventa) {
        const n = parsed.nuevo_insumo_reventa;
        const insumoData = {
          // El insumo espejo hereda siempre el nombre del producto (1:1). Con
          // un nombre propio de sucursal manda el del catálogo: el insumo es
          // uno solo para todo el negocio.
          nombre:         editaSucursal ? catalogo.nombre : parsed.nombre,
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
            data: { es_mixto: false, stock_actual: n.stock, ...insumoData },
          });
          insumoReventaId = insumo.id;
          await tx.stockSucursal.create({
            data: {
              insumo_id:      insumo.id,
              sucursal_id:    sucursalId,
              stock_actual:   n.stock,
              costo_promedio: n.costo_unitario,
              stock_minimo:   n.punto_reorden,
              punto_critico:  n.nivel_critico,
            },
          });
          if (n.stock > 0) {
            await tx.movimientoInterno.create({
              data: {
                insumo_id:       insumo.id,
                sucursal_id:     sucursalId,
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

      if (editaSucursal) {
        // El catálogo no se toca: solo se actualiza el insumo espejo, que es
        // del negocio. Todo lo demás va como override de esta sucursal.
        await tx.producto.update({
          where: { id: productoId },
          data: { insumo_reventa_id: insumoReventaId },
        });
      } else {
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
      }

      // Categorías y marcas: editando el catálogo se reemplazan las globales
      // (`sucursal_id = null`); editando una sucursal, las de ese local. Si la
      // selección quedó igual a la del catálogo no se guarda override, así el
      // local sigue heredando futuros cambios en vez de congelar una copia.
      const ambitoPuente = editaSucursal ? sucursalId : null;
      const catCatalogo = await tx.categoriasProducto.findMany({
        where: { producto_id: productoId, sucursal_id: null },
        select: { categoria_id: true },
      });
      const marcasCatalogo = await tx.productoMarca.findMany({
        where: { producto_id: productoId, sucursal_id: null },
        select: { marca_id: true },
      });

      // Igual que los demás campos: manda `heredar` si vino, y si no, la
      // heurística de "coincide con el catálogo = hereda".
      const catIgualAlCatalogo = editaSucursal && (
        parsed.heredar
          ? parsed.heredar.includes('categorias')
          : mismosIds(parsed.categorias, catCatalogo.map(c => c.categoria_id))
      );
      await tx.categoriasProducto.deleteMany({ where: { producto_id: productoId, sucursal_id: ambitoPuente } });
      if (parsed.categorias.length > 0 && !catIgualAlCatalogo) {
        await tx.categoriasProducto.createMany({
          data: parsed.categorias.map((categoria_id) => ({ producto_id: productoId, categoria_id, sucursal_id: ambitoPuente })),
          skipDuplicates: true,
        });
      }

      const marcasIgualAlCatalogo = editaSucursal && (
        parsed.heredar
          ? parsed.heredar.includes('marcas')
          : mismosIds(parsed.marcas, marcasCatalogo.map(m => m.marca_id))
      );
      await tx.productoMarca.deleteMany({ where: { producto_id: productoId, sucursal_id: ambitoPuente } });
      if (parsed.marcas.length > 0 && !marcasIgualAlCatalogo) {
        await tx.productoMarca.createMany({
          data: parsed.marcas.map((marca_id) => ({ producto_id: productoId, marca_id, sucursal_id: ambitoPuente })),
          skipDuplicates: true,
        });
      }

      // La receta se reemplaza SOLO en la sucursal que se está editando: las
      // fichas técnicas de los demás locales no se tocan.
      await tx.recetasProducto.deleteMany({ where: { producto_id: productoId, sucursal_id: sucursalId } });
      if (parsed.receta.length > 0) {
        await tx.recetasProducto.createMany({
          data: parsed.receta.map((item) => ({
            producto_id: productoId,
            sucursal_id: sucursalId,
            insumo_id: item.insumo_id,
            cantidad_utilizada: item.cantidad_utilizada,
          })),
          skipDuplicates: true,
        });
      }

      // Ficha del producto en la sucursal editada. Cada campo se guarda como
      // override solo si difiere del catálogo: si coincide queda en null y el
      // local sigue heredando, que es lo que hace que traer un producto de otra
      // sucursal y no tocarlo mantenga un único dato compartido.
      const overrides = editaSucursal
        ? {
            nombre:             override('nombre', parsed.nombre, catalogo.nombre),
            descripcion:        override('descripcion', parsed.descripcion, catalogo.descripcion),
            imagen_url:         override('imagen_url', parsed.imagen_url ?? null, catalogo.imagen_url),
            calorias:           override('calorias', parsed.calorias ?? null, catalogo.calorias),
            proteina:           override('proteina', parsed.proteina ?? null, catalogo.proteina),
            estado_publicacion: override('estado_publicacion', parsed.estado_publicacion, catalogo.estado_publicacion),
          }
        : {};

      await tx.productoSucursal.upsert({
        where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id: sucursalId } },
        create: { producto_id: productoId, sucursal_id: sucursalId, precio: parsed.precio, disponible: parsed.disponible, ...overrides },
        update: { precio: parsed.precio, disponible: parsed.disponible, ...overrides },
      });

      // Si estaba en revisión y la nueva ficha ya no referencia insumos dados de
      // baja, la revisión queda resuelta automáticamente al guardar. Editando
      // una sucursal se mira la baja EN ESE LOCAL y se resuelve solo su
      // revisión: el mismo insumo puede seguir de baja en otra.
      const idsReferenciados = [
        ...parsed.receta.map((item) => item.insumo_id),
        ...(insumoReventaId ? [insumoReventaId] : []),
      ];
      const inactivosRestantes = idsReferenciados.length === 0
        ? 0
        : editaSucursal
          ? await tx.stockSucursal.count({
              where: { insumo_id: { in: idsReferenciados }, sucursal_id: sucursalId, activo: false },
            })
          : await tx.insumo.count({ where: { id: { in: idsReferenciados }, activo: false } });

      if (inactivosRestantes === 0) {
        if (editaSucursal) {
          await tx.productoSucursal.updateMany({
            where: { producto_id: productoId, sucursal_id: sucursalId, en_revision: true },
            data: { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
          });
        }
        // El agregado del catálogo se apaga solo si ya ningún local está en
        // revisión, para no tapar el aviso de otra sucursal.
        const otraEnRevision = await tx.productoSucursal.count({
          where: { producto_id: productoId, en_revision: true },
        });
        if (otraEnRevision === 0) {
          await tx.producto.updateMany({
            where: { id: productoId, en_revision: true },
            data: { en_revision: false, revision_desde: null, motivo_revision: null, insumo_causa_revision_id: null },
          });
        }
      }

      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
        entidad: 'Producto', entidadId: productoId,
        detalle: editaSucursal
          ? `Producto "${parsed.nombre}" editado en la sucursal #${sucursalId} (el catálogo y las demás sucursales no se tocan)`
          : `Producto "${parsed.nombre}" editado en el catálogo`,
      }, tx);

      ambito = editaSucursal ? sucursalId : null;
    });

    return NextResponse.json({ data: await enrich(productoId, ambito) });
  } catch (error) {
    return handleApiError(error);
  }
}

// ─── PATCH: cambiar estado de publicación (publicar/despublicar/archivar/dar de baja) ───
const PatchSchema = z.object({
  estado_publicacion: z.enum(['BORRADOR', 'PUBLICADO', 'ARCHIVADO', 'BAJA']),
  motivo: z.string().optional(),
  /**
   * Publicar/archivar EN ESA SUCURSAL. Sin este dato el cambio es del catálogo
   * y alcanza a todos los locales: es la vista consolidada del dueño.
   */
  sucursal_id: z.number().int().positive().optional(),
});

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);
    const { id } = await params;
    const productoId = Number(id);
    const { estado_publicacion, motivo, sucursal_id } = PatchSchema.parse(await req.json());

    const actual = await prisma.producto.findUnique({
      where: { id: productoId },
      include: {
        marcas: true,
        recetaProducto_id: true,
        ...(sucursal_id ? { sucursales: { where: { sucursal_id } } } : {}),
      },
    });
    if (!actual) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    // ── Publicar/archivar en una sola sucursal ──
    if (sucursal_id != null) {
      const permitida = alcanceSucursal(session, sucursal_id);
      if (permitida !== sucursal_id) {
        throw new ValidationError('Solo podés cambiar el estado en tu propia sucursal');
      }
      if (estado_publicacion === 'BAJA') {
        // La baja local lleva motivo y se restaura: vive en su propio endpoint.
        throw new ValidationError('La baja en una sucursal se hace desde /api/admin/productos/[id]/sucursales');
      }

      const enSucursal = (actual as typeof actual & { sucursales?: HabilitacionConOverrides[] }).sucursales?.[0];
      if (!enSucursal) throw new NotFoundError('El producto no está habilitado en esa sucursal');

      if (estado_publicacion === 'PUBLICADO') {
        // Se valida la ficha del local (su nombre, su precio, su receta), no la
        // del catálogo: es lo que se va a publicar en ese menú.
        assertPublicable({
          ...aplicarOverrides(actual, enSucursal),
          marcas: vigentesEnSucursal(actual.marcas, sucursal_id),
          recetaProducto_id: actual.recetaProducto_id.filter(r => r.sucursal_id === sucursal_id),
        });
      }

      const data = await prisma.productoSucursal.update({
        where: { producto_id_sucursal_id: { producto_id: productoId, sucursal_id } },
        data: { estado_publicacion, disponible: estado_publicacion === 'PUBLICADO' },
      });

      await logAudit({
        usuarioId: session.id, rol: session.rol, accion: 'MODIFICO',
        entidad: 'Producto', entidadId: productoId,
        detalle: `Producto "${actual.nombre}" → ${estado_publicacion} en la sucursal #${sucursal_id} (las demás no se tocan)`,
      });

      return NextResponse.json({ data, insumo_reventa: { dado_de_baja: false, reactivado: false } });
    }

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
      // Vale igual para un terciado: su insumo espejo también es de uso
      // exclusivo del producto y no tiene sentido sin él.
      if (actual.tipo !== 'ELABORADO') {
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
