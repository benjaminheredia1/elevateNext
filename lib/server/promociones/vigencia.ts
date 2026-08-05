/**
 * vigencia.ts
 *
 * Cuándo está activa una promoción. Una regla tiene tres capas que se cumplen
 * TODAS a la vez:
 *
 *   1. Rango de fechas   — "todo agosto"
 *   2. Días de la semana — "solo lunes a viernes" (vacío = todos)
 *   3. Franja horaria    — "de 7:00 a 12:00" (sin franja = todo el día)
 *
 * Antes solo existía la capa 1, así que una promo diaria de un mes necesitaba
 * 31 filas. Con esto es una sola.
 *
 * Todo se evalúa en HORA DE BOLIVIA, nunca en la del servidor: en producción el
 * proceso corre en UTC y comparar horas crudas apagaría una promo de 7:00–12:00
 * cuatro horas antes de tiempo.
 */

const TZ = 'America/La_Paz';

export interface ReglaVigencia {
  fecha_inicio: Date;
  fecha_fin: Date;
  /** "HH:MM" en hora de Bolivia. null = todo el día. */
  hora_inicio?: string | null;
  hora_fin?: string | null;
  /** 1=lunes … 7=domingo (ISO 8601). Vacío = todos los días. */
  dias_semana?: number[];
}

/** Minutos desde medianoche de un "HH:MM". null si no es válido. */
function aMinutos(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const horas = Number(m[1]);
  const minutos = Number(m[2]);
  if (horas > 23 || minutos > 59) return null;
  return horas * 60 + minutos;
}

/** Hora local de Bolivia de un instante, en minutos desde medianoche. */
export function minutosDelDia(instante: Date): number {
  const partes = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(instante);
  const hora = Number(partes.find(p => p.type === 'hour')?.value ?? '0');
  const minuto = Number(partes.find(p => p.type === 'minute')?.value ?? '0');
  // 24:00 aparece en algunos entornos para la medianoche.
  return (hora % 24) * 60 + minuto;
}

/** Día ISO (1=lunes … 7=domingo) de un instante, en hora de Bolivia. */
export function diaIsoSemana(instante: Date): number {
  const nombre = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(instante);
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return dias[nombre] ?? 1;
}

/**
 * ¿La franja horaria incluye este instante?
 *
 * Una franja donde el fin es MENOR que el inicio (22:00 → 02:00) se entiende
 * como que cruza la medianoche: vale desde las 22:00 hasta las 02:00 del día
 * siguiente. Sin esto, una regla así no se activaría nunca.
 */
export function dentroDeFranja(instante: Date, hora_inicio?: string | null, hora_fin?: string | null): boolean {
  const desde = aMinutos(hora_inicio);
  const hasta = aMinutos(hora_fin);
  // Sin franja declarada (o mal escrita), la regla vale todo el día.
  if (desde == null || hasta == null) return true;

  const ahora = minutosDelDia(instante);
  if (desde <= hasta) return ahora >= desde && ahora <= hasta;
  return ahora >= desde || ahora <= hasta;
}

/** ¿La regla está vigente en este instante? */
export function reglaVigente(regla: ReglaVigencia, ahora: Date = new Date()): boolean {
  if (ahora < regla.fecha_inicio || ahora > regla.fecha_fin) return false;

  const dias = regla.dias_semana ?? [];
  if (dias.length > 0 && !dias.includes(diaIsoSemana(ahora))) return false;

  return dentroDeFranja(ahora, regla.hora_inicio, regla.hora_fin);
}

/** ¿Alguna de las reglas de la promoción está vigente ahora? */
export function promocionVigente(reglas: ReglaVigencia[], ahora: Date = new Date()): boolean {
  return reglas.some(r => reglaVigente(r, ahora));
}

/**
 * Texto corto de la vigencia, para mostrar en pantalla y en el ticket.
 * Ej: "1 ago – 31 ago · 07:00 a 12:00 · lun a vie".
 */
export function describirVigencia(regla: ReglaVigencia): string {
  const fecha = (d: Date) =>
    new Intl.DateTimeFormat('es-BO', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);

  const partes = [`${fecha(regla.fecha_inicio)} – ${fecha(regla.fecha_fin)}`];
  if (regla.hora_inicio && regla.hora_fin) partes.push(`${regla.hora_inicio} a ${regla.hora_fin}`);

  const dias = regla.dias_semana ?? [];
  if (dias.length > 0 && dias.length < 7) {
    const nombres = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
    partes.push([...dias].sort((a, b) => a - b).map(d => nombres[d - 1]).join(', '));
  }
  return partes.join(' · ');
}
