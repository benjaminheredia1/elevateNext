/**
 * Fechas de negocio ancladas a la zona horaria de la sucursal (Bolivia,
 * UTC-4 fijo, sin horario de verano), independientes de la zona del servidor.
 * En producción los servidores corren en UTC: usar new Date('YYYY-MM-DD') o
 * setHours(0,0,0,0) directo produce ventanas de día corridas (los reportes de
 * "hoy" muestran el día equivocado según dónde corra el proceso).
 */
const TZ = 'America/La_Paz';
const OFFSET = '-04:00';

/** 'YYYY-MM-DD' de hoy en hora de Bolivia. */
export function hoyISO(): string {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}

/**
 * Ventana [00:00:00.000, 23:59:59.999] del día de negocio indicado
 * ('YYYY-MM-DD'; por defecto hoy en Bolivia). Entradas mal formadas caen a hoy.
 */
export function rangoDiaNegocio(fechaISO?: string | null): { desde: Date; hasta: Date } {
  const base = fechaISO && /^\d{4}-\d{2}-\d{2}$/.test(fechaISO) ? fechaISO : hoyISO();
  return {
    desde: new Date(`${base}T00:00:00.000${OFFSET}`),
    hasta: new Date(`${base}T23:59:59.999${OFFSET}`),
  };
}

/** Inicio del mes en curso (día 1, 00:00) en hora de Bolivia. */
export function inicioMesNegocio(): Date {
  const [anio, mes] = hoyISO().split('-');
  return new Date(`${anio}-${mes}-01T00:00:00.000${OFFSET}`);
}

/** Etiqueta de hora ('H:00') de un instante, en hora de Bolivia. */
export function horaNegocio(instante: Date): string {
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: 'numeric', hour12: false }).format(instante);
  return `${Number(hora)}:00`;
}
