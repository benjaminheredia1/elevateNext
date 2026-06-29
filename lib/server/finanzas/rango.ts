export interface RangoFechas {
  desde: Date;
  hasta: Date;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function parseRango(searchParams: URLSearchParams): RangoFechas {
  const rango = searchParams.get('rango') ?? 'mes';
  const now = new Date();

  if (rango === 'hoy') {
    return { desde: startOfDay(now), hasta: endOfDay(now) };
  }

  if (rango === '7d') {
    const desde = startOfDay(now);
    desde.setDate(desde.getDate() - 6);
    return { desde, hasta: endOfDay(now) };
  }

  if (rango === 'custom') {
    const desdeParam = searchParams.get('desde');
    const hastaParam = searchParams.get('hasta');
    return {
      desde: desdeParam ? startOfDay(new Date(desdeParam)) : startOfDay(now),
      hasta: hastaParam ? endOfDay(new Date(hastaParam)) : endOfDay(now),
    };
  }

  return {
    desde: new Date(now.getFullYear(), now.getMonth(), 1),
    hasta: endOfDay(now),
  };
}

export function parseSucursal(searchParams: URLSearchParams): number | undefined {
  const value = searchParams.get('sucursal');
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
