import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { guard, ADMIN, STAFF } from '@/lib/server/auth/guard';
import { alcanceSucursal, resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { parseSucursal } from '@/lib/server/finanzas/rango';

// Lectura de inventario: también el cajero (vista solo lectura en /caja/insumos)
export async function GET(req: NextRequest) {
  const auth = await guard(req, STAFF);
  if (auth instanceof NextResponse) return auth;

  try {
    // Por defecto solo activos (selector de recetas, etc.). El panel de inventario
    // pide también los dados de baja para poder mostrarlos y reactivarlos.
    const { searchParams } = new URL(req.url);
    const incluirInactivos = searchParams.get('incluir_inactivos') === '1';
    // Con ?sucursal= se devuelven el stock, el costo y los mínimos DE ESE LOCAL,
    // manteniendo la misma forma para no romper a quien ya consume el endpoint.
    // Sin el parámetro se sigue devolviendo el agregado del negocio.
    const sucursal = alcanceSucursal(auth, parseSucursal(searchParams));
    // Insumos que la receta que se está editando ya usa: se incluyen aunque el
    // local no los maneje, para no romper fichas técnicas viejas al mostrarlas.
    const siempre = (searchParams.get('incluir_ids') ?? '')
      .split(',').map(Number).filter(id => Number.isInteger(id) && id > 0);

    const insumos = await prisma.insumo.findMany({
      where: {
        // Con sucursal, "activo" es el de esa fila (más abajo se filtra por
        // ella): un insumo de baja en Sur sigue activo en Fitbull. Sin
        // sucursal se usa el agregado del negocio.
        ...(incluirInactivos || sucursal ? {} : { activo: true }),
        // Con una sucursal elegida se listan SOLO los insumos que ese local
        // maneja —tener fila de stock es lo que define que lo maneja—, igual
        // que el catálogo de productos. Sin sucursal (dueño en consolidado) se
        // ve todo el inventario del negocio.
        ...(sucursal
          ? { OR: [{ stocks: { some: { sucursal_id: sucursal } } }, ...(siempre.length > 0 ? [{ id: { in: siempre } }] : [])] }
          // En consolidado se esconden los insumos que viven SOLO en el Centro
          // de Producción (tienen StockCentro y ninguna fila de sucursal). Si
          // aparecieran, alguien podría armar una ficha técnica con uno de
          // ellos desde el modo consolidado; al vender, el descuento golpearía
          // StockSucursal —que no existe para ese insumo— y dejaría un negativo
          // fantasma en el local.
          //
          // La condición pide las DOS cosas a la vez a propósito: un insumo
          // viejo sin filas en ningún lado (anterior a multi-sucursal) tiene
          // que seguir viéndose.
          : {
              NOT: {
                AND: [
                  { stocks: { none: {} } },
                  { stocksCentro: { some: {} } },
                ],
              },
            }),
      },
      orderBy: { nombre: 'asc' },
      ...(sucursal ? { include: { stocks: { where: { sucursal_id: sucursal } } } } : {}),
    });

    if (!sucursal) return NextResponse.json(insumos);

    return NextResponse.json(insumos.flatMap((insumo) => {
      const { stocks, ...resto } = insumo as typeof insumo & {
        stocks: {
          stock_actual: number; costo_promedio: number; stock_minimo: number; punto_critico: number;
          activo: boolean; fecha_baja: Date | null; motivo_baja: string | null;
        }[];
      };
      const enSucursal = stocks?.[0];
      // La baja es del local: si acá está activo se lista aunque el agregado
      // del negocio diga lo contrario, y viceversa.
      const activoAca = enSucursal ? enSucursal.activo : insumo.activo;
      if (!incluirInactivos && !activoAca) return [];
      return [{
        ...resto,
        // Estado de baja DE ESTE LOCAL, no el del negocio.
        activo:         activoAca,
        fecha_baja:     enSucursal ? enSucursal.fecha_baja : insumo.fecha_baja,
        motivo_baja:    enSucursal ? enSucursal.motivo_baja : insumo.motivo_baja,
        // Sin fila de stock, el local todavía no maneja ese insumo: va en cero,
        // no se hereda el total del negocio.
        stock_actual:   enSucursal?.stock_actual ?? 0,
        costo_promedio: enSucursal?.costo_promedio ?? insumo.costo_promedio,
        stock_minimo:   enSucursal?.stock_minimo ?? insumo.stock_minimo,
        punto_critico:  enSucursal?.punto_critico ?? insumo.punto_critico,
        sucursal_id:    sucursal,
        // false = viene por `incluir_ids` (lo usa una receta) pero el local no
        // lo maneja: se muestra para no romper la ficha, no para operarlo.
        en_sucursal:    !!enSucursal,
      }];
    }));
  } catch {
    return NextResponse.json({ message: 'Error al obtener insumos' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await guard(request, ADMIN);
  if (auth instanceof NextResponse) return auth;

  try {
    const {
      categoria_insumo,
      costo_promedio,
      equivalencia_cantidad,
      equivalencia_unidad,
      nombre,
      proveedor,
      punto_critico,
      stock_actual,
      stock_minimo,
      unidad_medida,
      sucursal_id,
    } = await request.json();
    const tieneEquivalencia = equivalencia_unidad && equivalencia_cantidad;
    // El stock nace en la sucursal indicada; las demás arrancan en cero cuando
    // registren su primer movimiento de este insumo.
    const sucursalId = await resolverSucursal(sucursal_id);
    const stockInicial = Number(stock_actual || 0);

    // Todo en una transacción: un insumo con stock pero sin su fila de sucursal
    // (o sin su movimiento de apertura) deja el kardex descuadrado desde el día uno.
    const insumo = await prisma.$transaction(async (tx) => {
      const creado = await tx.insumo.create({
        data: {
          categoria_insumo: categoria_insumo || null,
          costo_promedio: Number(costo_promedio || 0),
          equivalencia_cantidad: tieneEquivalencia ? Number(equivalencia_cantidad) : null,
          equivalencia_unidad: tieneEquivalencia ? equivalencia_unidad : null,
          nombre,
          proveedor: proveedor || null,
          punto_critico: Number(punto_critico || 0),
          stock_actual: stockInicial,
          stock_minimo: Number(stock_minimo || 0),
          unidad_medida,
        },
      });

      await tx.stockSucursal.create({
        data: {
          insumo_id:      creado.id,
          sucursal_id:    sucursalId,
          stock_actual:   stockInicial,
          costo_promedio: Number(costo_promedio || 0),
          stock_minimo:   Number(stock_minimo || 0),
          punto_critico:  Number(punto_critico || 0),
        },
      });

      // Movimiento de apertura: sin él, la suma de movimientos nunca coincide
      // con el stock y el historial del insumo arranca con un hueco.
      if (stockInicial !== 0) {
        await tx.movimientoInterno.create({
          data: {
            insumo_id:       creado.id,
            sucursal_id:     sucursalId,
            tipo_movimiento: 'INGRESO',
            cantidad:        stockInicial,
            costo_unitario:  Number(costo_promedio || 0),
            descripcion:     'Stock inicial al crear el insumo',
          },
        });
      }

      return creado;
    });

    return NextResponse.json(insumo, { status: 201 });
  } catch {
    return NextResponse.json({ message: 'Error al crear insumo' }, { status: 500 });
  }
}
