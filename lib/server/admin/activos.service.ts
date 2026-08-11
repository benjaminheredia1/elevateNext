import prisma from '@/lib/prisma';
import { resolverSucursal } from '@/lib/server/sucursales/sucursal.service';
import { NotFoundError } from '@/lib/server/errors';
import type { Prisma } from '@prisma/client';
import type { ActivoFijoInput, ActivoFijoUpdateInput, CategoriaActivo } from '@/lib/server/dto/activos-fijos.dto';
import { CATEGORIAS_ACTIVO } from '@/lib/server/dto/activos-fijos.dto';

function toNumber(v: Prisma.Decimal): number {
  return Number(v.toFixed(2));
}

const DIAS_POR_ANIO = 365.25;

/**
 * Valor en libros por depreciacion lineal desde la fecha de compra. El admin ya
 * no carga el valor actual a mano: se deriva del original y del % anual, para
 * que el KPI no se quede congelado en el numero del dia del alta.
 * Sin % de depreciacion se respeta el valor guardado (activos que no deprecian
 * o registros viejos cargados manualmente).
 */
export function valorEnLibros(valorOriginal: number, depreciacionPct: number | null, fechaCompra: Date, guardado: number) {
  if (depreciacionPct == null || depreciacionPct <= 0) return guardado;
  const anios = (Date.now() - fechaCompra.getTime()) / (DIAS_POR_ANIO * 24 * 60 * 60 * 1000);
  if (anios <= 0) return valorOriginal;
  const restante = valorOriginal * (1 - (depreciacionPct / 100) * anios);
  return Number(Math.max(0, restante).toFixed(2));
}

function decorate<T extends { valor_original: Prisma.Decimal; valor_actual: Prisma.Decimal; depreciacion_pct: Prisma.Decimal | null; fecha_compra: Date }>(row: T) {
  const valor_original = toNumber(row.valor_original);
  const depreciacion_pct = row.depreciacion_pct != null ? toNumber(row.depreciacion_pct) : null;
  return {
    ...row,
    valor_original,
    valor_actual: valorEnLibros(valor_original, depreciacion_pct, row.fecha_compra, toNumber(row.valor_actual)),
    depreciacion_pct,
  };
}

export async function listarActivosFijos(incluirInactivos = false, sucursal?: number) {
  const rows = await prisma.activoFijo.findMany({
    where: {
      ...(incluirInactivos ? {} : { activo: true }),
      // El activo está instalado en un local concreto: el horno de una sucursal
      // no es patrimonio de la otra. Sin sucursal, el total del negocio.
      ...(sucursal ? { sucursal_id: sucursal } : {}),
    },
    orderBy: [{ activo: 'desc' }, { categoria: 'asc' }, { nombre: 'asc' }],
  });
  const items = rows.map(decorate);

  const resumen: Record<string, { valor_original: number; valor_actual: number; cantidad: number }> = {};
  for (const cat of CATEGORIAS_ACTIVO) {
    resumen[cat] = { valor_original: 0, valor_actual: 0, cantidad: 0 };
  }
  let total_original = 0;
  let total_actual = 0;
  for (const item of items.filter(i => i.activo)) {
    const cat = item.categoria as CategoriaActivo;
    if (!resumen[cat]) resumen[cat] = { valor_original: 0, valor_actual: 0, cantidad: 0 };
    resumen[cat].valor_original += item.valor_original;
    resumen[cat].valor_actual += item.valor_actual;
    resumen[cat].cantidad += 1;
    total_original += item.valor_original;
    total_actual += item.valor_actual;
  }

  return {
    items,
    resumen,
    totales: {
      total_original: Number(total_original.toFixed(2)),
      total_actual: Number(total_actual.toFixed(2)),
      activos: items.filter(i => i.activo).length,
    },
  };
}

export async function crearActivoFijo(input: ActivoFijoInput, usuarioId: number) {
  const row = await prisma.activoFijo.create({
    data: {
      // El activo está instalado en un local concreto.
      sucursal_id: await resolverSucursal(input.sucursal_id),
      nombre: input.nombre,
      categoria: input.categoria,
      fecha_compra: input.fecha_compra,
      valor_original: input.valor_original,
      // Al alta el valor en libros es el de compra; la depreciacion se aplica
      // al leer, no se congela aqui.
      valor_actual: input.valor_actual ?? input.valor_original,
      depreciacion_pct: input.depreciacion_pct ?? null,
      vida_util_anios: input.vida_util_anios ?? null,
      metodo_pago: input.metodo_pago,
      notas: input.notas ?? null,
      activo: true,
      creado_por_id: usuarioId,
    },
  });
  return decorate(row);
}

export async function actualizarActivoFijo(input: ActivoFijoUpdateInput) {
  await ensureActivo(input.id);
  const row = await prisma.activoFijo.update({
    where: { id: input.id },
    data: {
      nombre: input.nombre,
      categoria: input.categoria,
      fecha_compra: input.fecha_compra,
      valor_original: input.valor_original,
      valor_actual: input.valor_actual ?? input.valor_original,
      depreciacion_pct: input.depreciacion_pct ?? null,
      vida_util_anios: input.vida_util_anios ?? null,
      metodo_pago: input.metodo_pago,
      notas: input.notas ?? null,
    },
  });
  return decorate(row);
}

export async function eliminarActivoFijo(id: number) {
  await ensureActivo(id);
  const row = await prisma.activoFijo.update({ where: { id }, data: { activo: false } });
  return decorate(row);
}

async function ensureActivo(id: number) {
  const exists = await prisma.activoFijo.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new NotFoundError('Activo fijo no encontrado');
}
