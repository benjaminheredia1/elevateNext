import { rangoDiaNegocio, inicioMesNegocio, hoyISO } from '@/lib/server/fechas';

export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

/**
 * Rangos de reportes anclados al día de negocio (Bolivia, UTC-4), sin importar
 * la zona del servidor. Ver lib/server/fechas.ts.
 */
export function parseRango(searchParams: URLSearchParams): RangoFechas {
  const rango = searchParams.get('rango') ?? 'mes';
  const hoy = rangoDiaNegocio();

  if (rango === 'hoy') {
    return hoy;
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
