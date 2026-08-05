/**
 * combos.service.ts
 *
 * Un combo es una promoción de tipo COMBO: un paquete de productos que se cobra
 * como una sola línea, a precio fijo en Bs o con un % sobre lo que suman sus
 * productos EN ESA SUCURSAL (los precios son por local, así que el mismo combo
 * puede costar distinto en Fitbull y en Sur).
 *
 * Se ofrece solo dentro de su ventana de vigencia (fechas + días + franja
 * horaria) y solo si el local puede armarlo con el stock que tiene. Fuera de
 * eso no aparece, y si alguien lo manda igual, la venta lo rechaza.
 */
import prisma from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '@/lib/server/errors';
import { promocionVigente, describirVigencia } from '@/lib/server/promociones/vigencia';
import { calcularRinde } from '@/lib/server/inventario/disponibilidad';
import { aplicarOverrides } from '@/lib/server/productos/overrides';

type Db = Prisma.TransactionClient | typeof prisma;

/** Todo lo que hace falta para valorizar y validar un combo en una sucursal. */
export const includeCombo = (sucursalId: number) => ({
  reglasHorarias_id: true,
  sucursales: { where: { sucursal_id: sucursalId } },
  items: {
    include: {
      producto: {
        include: {
          sucursales: { where: { sucursal_id: sucursalId } },
          recetaProducto_id: {
            where: { sucursal_id: sucursalId },
            include: {
              insumo: {
                select: {
                  stock_actual: true,
                  activo: true,
                  stocks: { where: { sucursal_id: sucursalId }, select: { stock_actual: true, activo: true } },
                },
              },
            },
          },
          insumo_reventa: {
            select: {
              stock_actual: true,
              activo: true,
              stocks: { where: { sucursal_id: sucursalId }, select: { stock_actual: true, activo: true } },
            },
          },
        },
      },
    },
  },
}) satisfies Prisma.PromocionesDescuentosInclude;

export interface ComboResuelto {
  id: number;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  /** Suma de los precios de sus productos en esta sucursal. */
  precio_lista: number;
  /** Lo que se cobra: precio fijo del local, o el % aplicado sobre la lista. */
  precio: number;
  ahorro: number;
  vigente: boolean;
  vigencia: string;
  /** Cuántos combos puede armar el local con su stock. null = sin rastreo. */
  rinde: number | null;
  agotado: boolean;
  items: { producto_id: number; nombre: string; cantidad: number; precio_unitario: number }[];
}

type ComboConTodo = Prisma.PromocionesDescuentosGetPayload<{ include: ReturnType<typeof includeCombo> }>;

/**
 * Valoriza un combo en una sucursal y decide si puede venderse ahí y ahora.
 *
 * El precio de lista sale de los precios del local, no del catálogo: si Sur
 * vende más caro el bowl, su combo al 20% también sale más caro.
 */
export function resolverCombo(combo: ComboConTodo, sucursalId: number, ahora: Date = new Date()): ComboResuelto {
  const enSucursal = combo.sucursales[0];

  const items = combo.items.map(item => {
    const producto = aplicarOverrides(item.producto, item.producto.sucursales[0]);
    return {
      producto_id: item.producto_id,
      nombre: producto.nombre,
      cantidad: item.cantidad,
      precio_unitario: Number(producto.precio),
    };
  });

  const precioLista = items.reduce((suma, i) => suma + i.precio_unitario * i.cantidad, 0);

  // El monto del local pisa al de la promoción: un combo puede costar Bs 45 en
  // un local y Bs 50 en otro sin duplicar la promoción.
  const montoBase = enSucursal?.monto ?? combo.monto;
  const monto = Number(montoBase);
  const precio = combo.modo_precio === 'PRECIO_FIJO'
    ? monto
    : combo.modo_precio === 'MONTO_DESCUENTO'
      ? Math.max(0, precioLista - monto)
      : Math.max(0, precioLista - (precioLista * monto) / 100);

  // Cuántos combos se pueden armar: manda el producto que menos rinde. Un combo
  // que no se puede preparar no debería ofrecerse.
  let rinde: number | null = null;
  for (const item of combo.items) {
    const { rinde: rindeProducto, stockTracked } = calcularRinde(item.producto);
    if (!stockTracked || rindeProducto == null) continue;
    const posibles = Math.floor(rindeProducto / (item.cantidad || 1));
    rinde = rinde == null ? posibles : Math.min(rinde, posibles);
  }

  const vigente = combo.activo
    && (enSucursal?.disponible ?? false)
    && promocionVigente(combo.reglasHorarias_id, ahora);

  return {
    id: combo.id,
    nombre: combo.nombre,
    descripcion: combo.descripcion,
    imagen_url: combo.imagen_url,
    precio_lista: Math.round(precioLista * 100) / 100,
    precio: Math.round(Math.max(0, precio) * 100) / 100,
    ahorro: Math.round(Math.max(0, precioLista - precio) * 100) / 100,
    vigente,
    vigencia: combo.reglasHorarias_id.map(describirVigencia).join(' | '),
    rinde,
    agotado: rinde != null && rinde <= 0,
    items,
  };
}

/**
 * Combos que la sucursal puede vender AHORA: habilitados ahí, dentro de su
 * ventana y con stock para armarlos.
 */
export async function combosVigentes(
  sucursalId: number,
  ahora: Date = new Date(),
  db: Db = prisma,
): Promise<ComboResuelto[]> {
  const combos = await db.promocionesDescuentos.findMany({
    where: {
      tipo: 'COMBO',
      activo: true,
      sucursales: { some: { sucursal_id: sucursalId, disponible: true } },
    },
    include: includeCombo(sucursalId),
    orderBy: { nombre: 'asc' },
  });

  // Se filtra por lo que es regla del combo (activo, habilitado en el local y
  // dentro de su franja), NO por stock: igual que con los productos, la caja
  // puede vender lo que está agotado y el stock queda en negativo. Quien lo
  // muestre decide qué hacer con la bandera `agotado`, y la tienda web bloquea
  // aparte, en la ruta de pedidos.
  return combos
    .map(c => resolverCombo(c, sucursalId, ahora))
    .filter(c => c.vigente);
}

/** Todos los combos de una sucursal, vigentes o no (pantalla de admin). */
export async function combosDeSucursal(sucursalId: number, db: Db = prisma): Promise<ComboResuelto[]> {
  const combos = await db.promocionesDescuentos.findMany({
    where: { tipo: 'COMBO' },
    include: includeCombo(sucursalId),
    orderBy: { nombre: 'asc' },
  });
  return combos.map(c => resolverCombo(c, sucursalId));
}

/**
 * Promociones de una sucursal, de los dos tipos, con todo lo que la pantalla
 * necesita para listarlas Y para editarlas (vigencias y sucursales crudas).
 *
 * Las promociones sin filas de sucursal son anteriores a multi-sucursal y valen
 * en todos los locales: se listan en cualquiera, marcadas como tales.
 */
export async function promocionesDeSucursal(sucursalId: number, ahora: Date = new Date(), db: Db = prisma) {
  const filas = await db.promocionesDescuentos.findMany({
    where: { OR: [{ sucursales: { some: { sucursal_id: sucursalId } } }, { sucursales: { none: {} } }] },
    include: {
      ...includeCombo(sucursalId),
      // Para editar hacen falta TODAS sus sucursales, no solo la consultada.
      sucursales: true,
      promocionProducto_id: {
        include: { producto: { select: { id: true, nombre: true } } },
      },
    },
    orderBy: { nombre: 'asc' },
  });

  return filas.map(fila => {
    const esCombo = fila.tipo === 'COMBO';
    // `resolverCombo` espera la habilitación de esta sucursal; acá vienen todas.
    const propia = fila.sucursales.filter(s => s.sucursal_id === sucursalId);
    const resuelto = esCombo
      ? resolverCombo({ ...fila, sucursales: propia }, sucursalId, ahora)
      : null;

    const enTodas = fila.sucursales.length === 0;
    const habilitada = enTodas || propia.some(s => s.disponible);

    return {
      id: fila.id,
      tipo: fila.tipo,
      nombre: fila.nombre,
      descripcion: fila.descripcion,
      modo_precio: fila.modo_precio,
      monto: Number(fila.monto),
      activo: fila.activo,
      /** true = promoción vieja, sin sucursales: vale en todos los locales. */
      en_todas_las_sucursales: enTodas,
      vigente: fila.activo && habilitada && promocionVigente(fila.reglasHorarias_id, ahora),
      vigencia: fila.reglasHorarias_id.map(describirVigencia).join(' | '),
      // Solo para combos: precio armado y stock.
      precio_lista: resuelto?.precio_lista ?? null,
      precio: resuelto?.precio ?? null,
      ahorro: resuelto?.ahorro ?? null,
      rinde: resuelto?.rinde ?? null,
      agotado: resuelto?.agotado ?? false,
      // Productos: los items del combo, o los productos que abarata el descuento.
      items: esCombo
        ? fila.items.map(i => ({ producto_id: i.producto_id, nombre: i.producto.nombre, cantidad: i.cantidad }))
        : fila.promocionProducto_id.map(pp => ({ producto_id: pp.producto_id, nombre: pp.producto.nombre, cantidad: 1 })),
      // Crudo para precargar el formulario de edición.
      sucursales: fila.sucursales.map(s => ({
        sucursal_id: s.sucursal_id,
        monto: s.monto == null ? null : Number(s.monto),
        disponible: s.disponible,
      })),
      vigencias: fila.reglasHorarias_id.map(r => ({
        fecha_inicio: r.fecha_inicio,
        fecha_fin: r.fecha_fin,
        hora_inicio: r.hora_inicio,
        hora_fin: r.hora_fin,
        dias_semana: r.dias_semana,
      })),
    };
  });
}

export type PromocionResuelta = Awaited<ReturnType<typeof promocionesDeSucursal>>[number];

/**
 * Valida el combo para una venta y devuelve las líneas en que se descompone.
 *
 * El combo se guarda como una línea por producto, con el precio del combo
 * PRORRATEADO entre ellas: así el descuento de insumos, el food cost y la
 * analítica por producto siguen funcionando sin saber que existen los combos,
 * y `combo_id` permite agrupar para medirlos.
 *
 * La validación se repite acá aunque la interfaz ya haya filtrado: el precio y
 * la vigencia nunca se toman de lo que manda el cliente.
 */
export async function lineasDeCombo(
  comboId: number,
  cantidad: number,
  sucursalId: number,
  ahora: Date = new Date(),
  db: Db = prisma,
): Promise<{ combo: ComboResuelto; lineas: { producto_id: number; cantidad: number; precio_unitario: number; combo_id: number }[] }> {
  if (!(cantidad > 0)) throw new ValidationError('La cantidad del combo debe ser mayor a cero');

  const fila = await db.promocionesDescuentos.findFirst({
    where: { id: comboId, tipo: 'COMBO' },
    include: includeCombo(sucursalId),
  });
  if (!fila) throw new NotFoundError('El combo no existe');

  const combo = resolverCombo(fila, sucursalId, ahora);
  if (!combo.vigente) {
    throw new ValidationError(
      `El combo "${combo.nombre}" no está disponible en este horario${combo.vigencia ? ` (${combo.vigencia})` : ''}.`,
    );
  }
  if (combo.items.length === 0) throw new ValidationError(`El combo "${combo.nombre}" no tiene productos`);
  // No se valida el stock: en el mostrador el cajero tiene la mercadería
  // delante y debe poder cobrar aunque el inventario esté sin cargar, igual que
  // con los productos sueltos. El stock queda negativo y se corrige al reponer.
  // Esto lo usa solo la venta de caja; los pedidos de la web bloquean por stock
  // en /api/pedidos, que es donde corresponde ese criterio.

  // Prorrateo por peso del producto en el precio de lista, para que la suma de
  // las líneas dé exactamente el precio del combo. El redondeo se corrige en la
  // última línea: sin eso, el total cobrado no cuadra con el detalle.
  const total = Math.round(combo.precio * cantidad * 100) / 100;
  let asignado = 0;
  const lineas = combo.items.map((item, i) => {
    const unidades = item.cantidad * cantidad;
    const proporcion = combo.precio_lista > 0
      ? (item.precio_unitario * item.cantidad) / combo.precio_lista
      : 1 / combo.items.length;

    const esUltima = i === combo.items.length - 1;
    const montoLinea = esUltima
      ? Math.round((total - asignado) * 100) / 100
      : Math.round(total * proporcion * 100) / 100;
    asignado += montoLinea;

    return {
      producto_id: item.producto_id,
      cantidad: unidades,
      precio_unitario: unidades > 0 ? Math.round((montoLinea / unidades) * 100) / 100 : 0,
      combo_id: combo.id,
    };
  });

  return { combo, lineas };
}
