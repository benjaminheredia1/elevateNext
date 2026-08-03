import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAuth, requireRole } from '@/lib/server/auth/session';
import { handleApiError } from '@/lib/server/errors';
import { ProductoConFichaSchema } from '@/lib/server/dto/inventario.dto';
import { alcanceSucursal, resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';
import { costoFichaTecnica } from '@/lib/server/inventario/inventario.service';
import { logAudit } from '@/lib/server/audit/audit.service';
import { assertPublicable } from '@/lib/server/productos/publicacion';
import { resolverProducto } from '@/lib/server/productos/overrides';

// ─── GET: listar productos con estado, costo y food cost ────────────
export async function GET(req: NextRequest) {
  try {
    const session = await requireAuth(req);
    requireRole(session, ['DUENO', 'ADMIN']);

    // El costo, el food cost y el rinde son de un local concreto: la receta y el
    // stock varían entre sucursales. Sin filtro se usa la principal.
    const sucursalPedida = alcanceSucursal(session, parseSucursal(new URL(req.url).searchParams));
    const sucursalId = await resolverSucursal(sucursalPedida);

    // Con una sucursal elegida se listan SOLO sus productos habilitados: un local
    // nuevo arranca con el menú vacío y se llena creando productos o copiándolos
    // de otra sucursal. Sin sucursal (dueño en consolidado) se ve todo el catálogo.
    const productos = await prisma.producto.findMany({
      ...(sucursalPedida
        ? { where: { sucursales: { some: { sucursal_id: sucursalId } } } }
        : {}),
      include: {
        categoria_id:         { include: { categoria: true } },
        marcas:               { include: { marca: true } },
        recetaProducto_id: {
          where: { sucursal_id: sucursalId },
          include: { insumo: { include: { stocks: { where: { sucursal_id: sucursalId } } } } },
        },
        sucursales: { where: { sucursal_id: sucursalId } },
      },
      orderBy: { nombre: 'asc' },
    });

    // Ámbito de lo que se está viendo: la sucursal elegida, o el catálogo si el
    // dueño está en consolidado. Define de dónde salen nombre, estado y demás.
    const ambito = sucursalPedida ? sucursalId : null;

    // Enriquecer con costo y food cost
    const enriquecidos = await Promise.all(
      productos.map(async (p) => {
        const costo    = await costoFichaTecnica(p.id, undefined, sucursalId);
        const enSucursal = ambito != null ? p.sucursales[0] : null;
        // La ficha que se lista es la del local: su nombre, su precio y su
        // estado, con lo que no haya sobrescrito heredado del catálogo.
        const resuelto = resolverProducto(p, ambito);
        const precioNum = Number(resuelto.precio);
        const foodCost = precioNum > 0 ? Math.round((costo / precioNum) * 10000) / 100 : 0;
        return {
          ...resuelto,
          precio: precioNum,
          sucursal_id: sucursalId,
          // Estado del producto EN ESTE LOCAL: una baja acá no dice nada de las
          // otras sucursales, así que va aparte de `estado_publicacion`.
          sucursal_estado: enSucursal
            ? {
                disponible: enSucursal.disponible,
                motivo_baja: enSucursal.motivo_baja,
                fecha_baja: enSucursal.fecha_baja,
              }
            : null,
          costo_calculado: Math.round(costo * 100) / 100,
          food_cost_pct: foodCost,
        };
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

    // Un producto con el mismo nombre casi siempre es el de otra sucursal que se
    // está recreando a mano. Duplicarlo parte las ventas en dos en la analítica
    // y obliga a mantener foto y descripción por duplicado, así que se avisa y
    // se ofrece habilitar el que ya existe. No se bloquea: puede haber dos platos
    // legítimamente parecidos, y para eso está `permitir_duplicado`.
    if (!parsed.permitir_duplicado) {
      const existente = await prisma.producto.findFirst({
        where: { nombre: { equals: parsed.nombre.trim(), mode: 'insensitive' }, estado_publicacion: { not: 'BAJA' } },
        select: {
          id: true,
          nombre: true,
          sucursales: { select: { sucursal: { select: { id: true, nombre: true } } } },
        },
      });
      if (existente) {
        return NextResponse.json({
          error: `Ya existe un producto llamado "${existente.nombre}".`,
          code: 'PRODUCTO_DUPLICADO',
          producto: {
            id: existente.id,
            nombre: existente.nombre,
            sucursales: existente.sucursales.map(s => s.sucursal),
          },
        }, { status: 409 });
      }
    }

    const producto = await prisma.$transaction(async (tx) => {
      // Sucursal cuya ficha técnica, precio y stock inicial se están dando de alta.
      const sucursalId = await resolverSucursal(parsed.sucursal_id, tx);

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
        // El stock inicial pertenece a la sucursal del alta.
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
        // El stock inicial queda auditado como movimiento de inventario
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

      // 4. Receta / ficha técnica — pertenece a una sucursal concreta
      if (parsed.receta.length > 0) {
        await tx.recetasProducto.createMany({
          data: parsed.receta.map((item) => ({
            producto_id:        prod.id,
            sucursal_id:        sucursalId,
            insumo_id:          item.insumo_id,
            cantidad_utilizada: item.cantidad_utilizada,
          })),
          skipDuplicates: true,
        });
      }

      // 5. Habilitación en la sucursal, con su precio y disponibilidad. Sin esta
      //    fila el producto existe en el catálogo pero no lo vende nadie.
      await tx.productoSucursal.create({
        data: {
          producto_id: prod.id,
          sucursal_id: sucursalId,
          precio:      parsed.precio,
          disponible:  parsed.disponible,
        },
      });

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
