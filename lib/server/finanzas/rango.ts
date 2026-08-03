import prisma from '@/lib/prisma';
import { rangoDiaNegocio, inicioMesNegocio, hoyISO } from '@/lib/server/fechas';

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

/**
 * Arranque del rango "todo": el primer registro real del negocio.
 *
 * No se usa una fecha centinela (1970 o similar) porque el rango no solo filtra:
 * `gastosOperativos` prorratea los gastos fijos por la cantidad de días que
 * abarca, y partir de una fecha inventada inflaría los costos por miles de días
 * en los que el negocio no existía.
 */
export async function inicioDelHistorial(): Promise<Date> {
  const [ventas, movimientos] = await Promise.all([
    prisma.transaccion.aggregate({ _min: { created_at: true } }),
    prisma.movimientoCaja.aggregate({ _min: { created_at: true } }),
  ]);
  const fechas = [ventas._min.created_at, movimientos._min.created_at]
    .filter((f): f is Date => f != null);
  // Sin datos todavía, "todo" equivale al mes en curso: no hay historial que mostrar.
  if (fechas.length === 0) return inicioMesNegocio();
  return new Date(Math.min(...fechas.map(f => f.getTime())));
}

/**
 * Rangos de reportes anclados al día de negocio (Bolivia, UTC-4), sin importar
 * la zona del servidor. Ver lib/server/fechas.ts.
 */
export async function parseRango(searchParams: URLSearchParams): Promise<RangoFechas> {
  const rango = searchParams.get('rango') ?? 'mes';
  const hoy = rangoDiaNegocio();

  if (rango === 'hoy') {
    return hoy;
  }

  // Todo el historial, sin filtro de fechas.
  if (rango === 'todo') {
    return { desde: await inicioDelHistorial(), hasta: hoy.hasta };
  }

  if (rango === '7d') {
    const [anio, mes, dia] = hoyISO().split('-').map(Number);
    const inicio = new Date(Date.UTC(anio, mes - 1, dia - 6));
    const desde = rangoDiaNegocio(inicio.toISOString().slice(0, 10)).desde;
    return { desde, hasta: hoy.hasta };
  }

  if (rango === 'custom') {
    const desdeParam = searchParams.get('desde');
    const hastaParam = searchParams.get('hasta');
    return {
      desde: rangoDiaNegocio(desdeParam).desde,
      hasta: rangoDiaNegocio(hastaParam).hasta,
    };
  }

  return { desde: inicioMesNegocio(), hasta: hoy.hasta };
}

export function parseSucursal(searchParams: URLSearchParams): number | undefined {
  const value = searchParams.get('sucursal');
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
