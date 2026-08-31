/**
 * stock-centro.service.ts
 *
 * Punto único de escritura del stock del Centro de Producción. Mismo rol que
 * stock-sucursal.service.ts, pero sin tocar el agregado de Insumo.stock_actual:
 * ese campo hoy es "cuánto hay repartido en las sucursales" y lo leen
 * dashboards y alertas existentes — mezclar ahí el stock del Centro los
 * rompería. El inventario del Centro se consulta aparte, con
 * inventarioDeCentro.
 */
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/server/errors';

type Db = Prisma.TransactionClient | typeof prisma;

export interface StockDeCentro {
  insumo_id: number;
  centro_id: number;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
  punto_critico: number;
}

/**
 * Fila de stock del insumo en el Centro. Si el Centro todavía no maneja ese
 * insumo, la crea en cero heredando los niveles de alerta del catálogo.
 */
export async function obtenerOCrearStock(
  insumoId: number,
  centroId: number,
  db: Db = prisma,
): Promise<StockDeCentro> {
  const existente = await db.stockCentro.findUnique({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
  });
  if (existente) return existente;

  const insumo = await db.insumo.findUnique({
    where: { id: insumoId },
    select: { costo_promedio: true, stock_minimo: true, punto_critico: true },
  });
  if (!insumo) throw new NotFoundError('Insumo no encontrado');

  return db.stockCentro.create({
    data: {
      insumo_id: insumoId,
      centro_id: centroId,
      stock_actual: 0,
      costo_promedio: insumo.costo_promedio,
      stock_minimo: insumo.stock_minimo,
      punto_critico: insumo.punto_critico,
    },
  });
}

/** Suma (o resta, con delta negativo) stock del Centro. */
export async function ajustarStock(
  db: Db,
  insumoId: number,
  centroId: number,
  delta: number,
): Promise<StockDeCentro> {
  await obtenerOCrearStock(insumoId, centroId, db);

  return db.stockCentro.update({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    data: { stock_actual: { increment: delta } },
  });
}

/** Fija el stock del Centro a un valor exacto (conteo físico). */
export async function fijarStock(
  db: Db,
  insumoId: number,
  centroId: number,
  nuevoStock: number,
): Promise<{ anterior: number; delta: number }> {
  const actual = await obtenerOCrearStock(insumoId, centroId, db);
  const delta = nuevoStock - actual.stock_actual;
  if (delta !== 0) await ajustarStock(db, insumoId, centroId, delta);
  return { anterior: actual.stock_actual, delta };
}

/**
 * Costo promedio ponderado de una compra. Mismo criterio que
 * stock-sucursal.service.ts: el stock negativo no participa en la
 * ponderación (estilo Odoo AVCO).
 */
export async function registrarCompra(
  db: Db,
  insumoId: number,
  centroId: number,
  cantidad: number,
  costoUnitario: number,
): Promise<number> {
  if (cantidad <= 0) throw new ValidationError('La cantidad de la compra debe ser mayor a cero');

  const actual = await obtenerOCrearStock(insumoId, centroId, db);
  const stockPrevio = Math.max(actual.stock_actual, 0);
  const valorPrevio = stockPrevio * actual.costo_promedio;
  const valorNuevo = cantidad * costoUnitario;
  const stockFinal = stockPrevio + cantidad;
  const nuevoPromedio = stockFinal > 0
    ? Number(((valorPrevio + valorNuevo) / stockFinal).toFixed(6))
    : costoUnitario;

  await ajustarStock(db, insumoId, centroId, cantidad);
  await db.stockCentro.update({
    where: { centro_id_insumo_id: { centro_id: centroId, insumo_id: insumoId } },
    data: { costo_promedio: nuevoPromedio },
  });

  return nuevoPromedio;
}

export interface ItemInventarioCentro {
  insumo_id: number;
  centro_id: number;
  nombre: string;
  unidad_medida: string;
  categoria_insumo: string | null;
  proveedor: string | null;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
  punto_critico: number;
  activo: boolean;
  nivel: 'ok' | 'bajo' | 'critico' | 'baja';
  // Desde acá, lo que pide el panel compartido (`Insumo` de
  // components/admin/inventario/comunes.tsx) y no es propio del Centro.
  id: number;
  es_mixto: boolean;
  equivalencia_unidad: string | null;
  equivalencia_cantidad: number | null;
  uso_diario_promedio: number | null;
  fecha_baja: string | null;
  motivo_baja: string | null;
  /**
   * Si esta fila es un producto terminado (algún producto la apunta como su
   * insumo espejo) o insumo bruto. El Centro maneja las dos cosas en la misma
   * tabla, pero no son lo mismo para quien opera: el bruto se compra y se
   * consume produciendo; el terminado se produce o se compra, y se despacha.
   */
  es_producto: boolean;
  /** El producto del que esta fila es el espejo, si lo es. */
  producto_id: number | null;
  /**
   * Cómo abastece el Centro ese producto: ELABORADO lo produce, cualquier otra
   * cosa la compra. Null en el insumo bruto, que no es producto de nadie.
   */
  producto_tipo: string | null;
}

/**
 * Inventario del Centro, con los datos del catálogo ya resueltos. Se rige por
 * la propia fila de StockCentro, no por Insumo.activo: ese campo es el
 * agregado del negocio que apaga sincronizarAgregados cuando TODAS las
 * sucursales dan de baja el insumo, y no dice nada sobre si el Centro sigue
 * teniéndolo en stock. Filtrar por ahí haría desaparecer del inventario del
 * Centro insumos con stock, costo y niveles de alerta todavía cargados.
 * Por eso se listan también las filas dadas de baja localmente (apagadas,
 * con nivel 'baja') — a diferencia de inventarioDeSucursal, que no expone
 * ese estado — para poder reactivarlas sin perder el historial.
 */
export async function inventarioDeCentro(centroId: number, db: Db = prisma): Promise<ItemInventarioCentro[]> {
  const filas = await db.stockCentro.findMany({
    where: { centro_id: centroId },
    include: {
      insumo: {
        select: {
          id: true, nombre: true, unidad_medida: true, categoria_insumo: true, proveedor: true,
          es_mixto: true, equivalencia_unidad: true, equivalencia_cantidad: true,
          // Con que exista UN producto que lo apunte alcanza para saber que es
          // un terminado; no hace falta traerlos todos. Se trae también su tipo
          // porque de eso depende cómo lo abastece el Centro: produciéndolo o
          // comprándolo.
          productos_reventa: { select: { id: true, tipo: true }, take: 1 },
        },
      },
    },
    orderBy: { insumo: { nombre: 'asc' } },
  });

  return filas.map(fila => ({
    // El panel compartido identifica la fila por `id`; `insumo_id` se mantiene
    // porque la pantalla del Centro y sus hooks ya lo consumen. Son el mismo
    // número: en el Centro la fila de inventario ES el insumo.
    id: fila.insumo_id,
    insumo_id: fila.insumo_id,
    centro_id: fila.centro_id,
    nombre: fila.insumo.nombre,
    unidad_medida: fila.insumo.unidad_medida,
    categoria_insumo: fila.insumo.categoria_insumo,
    proveedor: fila.insumo.proveedor,
    stock_actual: fila.stock_actual,
    costo_promedio: fila.costo_promedio,
    stock_minimo: fila.stock_minimo,
    punto_critico: fila.punto_critico,
    activo: fila.activo,
    es_mixto: fila.insumo.es_mixto,
    es_producto: fila.insumo.productos_reventa.length > 0,
    producto_id: fila.insumo.productos_reventa[0]?.id ?? null,
    producto_tipo: fila.insumo.productos_reventa[0]?.tipo ?? null,
    equivalencia_unidad: fila.insumo.equivalencia_unidad,
    equivalencia_cantidad: fila.insumo.equivalencia_cantidad,
    // Tres campos que el panel espera y el Centro no tiene con qué llenar.
    // `uso_diario_promedio` mide el consumo de las sucursales: usarlo acá
    // proyectaría la duración del stock del Centro con el ritmo de otro, así
    // que va en null y el ámbito del Centro directamente no muestra cobertura
    // (para eso tiene el rinde, en unidades producibles). `fecha_baja` y
    // `motivo_baja` viven en el insumo del negocio; StockCentro solo guarda
    // `activo`, sin cuándo ni por qué.
    uso_diario_promedio: null,
    fecha_baja: null,
    motivo_baja: null,
    nivel: !fila.activo ? 'baja'
      : fila.stock_actual <= fila.punto_critico ? 'critico'
      : fila.stock_actual <= fila.stock_minimo ? 'bajo'
      : 'ok',
  }));
}
