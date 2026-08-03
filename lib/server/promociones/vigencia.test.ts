/**
 * Ventana de vigencia: fechas + días + franja horaria, en hora de Bolivia.
 *
 * Lo que se cuida: que "todo agosto de 7:00 a 12:00" sea UNA regla y que se
 * apague a las 12:01, y que la hora se lea en hora de Bolivia y no en la del
 * servidor —en producción corre en UTC, donde las 12:00 locales son las 16:00—.
 */
import { describe, it, expect } from 'vitest';
import { reglaVigente, dentroDeFranja, diaIsoSemana, describirVigencia } from './vigencia';

/** Instante a partir de una hora local de Bolivia (UTC-4). */
const enBolivia = (iso: string) => new Date(`${iso}-04:00`);

const TODO_AGOSTO = {
  fecha_inicio: enBolivia('2026-08-01T00:00:00'),
  fecha_fin: enBolivia('2026-08-31T23:59:59'),
  hora_inicio: '07:00',
  hora_fin: '12:00',
};

describe('franja horaria', () => {
  it('vale dentro de la franja y no fuera', () => {
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-08-15T07:00:00'))).toBe(true);
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-08-15T11:59:00'))).toBe(true);
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-08-15T12:00:00'))).toBe(true);
    // El caso del enunciado: pasada la hora, el combo deja de venderse.
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-08-15T12:01:00'))).toBe(false);
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-08-15T06:59:00'))).toBe(false);
  });

  it('se evalúa en hora de Bolivia, no en UTC', () => {
    // 15:00 UTC = 11:00 en Bolivia → dentro. Comparando en UTC daría fuera.
    expect(reglaVigente(TODO_AGOSTO, new Date('2026-08-15T15:00:00Z'))).toBe(true);
    // 17:00 UTC = 13:00 en Bolivia → fuera.
    expect(reglaVigente(TODO_AGOSTO, new Date('2026-08-15T17:00:00Z'))).toBe(false);
  });

  it('fuera del rango de fechas no vale, aunque la hora coincida', () => {
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-09-01T09:00:00'))).toBe(false);
    expect(reglaVigente(TODO_AGOSTO, enBolivia('2026-07-31T09:00:00'))).toBe(false);
  });

  it('sin franja declarada vale todo el día', () => {
    const todoElDia = { ...TODO_AGOSTO, hora_inicio: null, hora_fin: null };
    expect(reglaVigente(todoElDia, enBolivia('2026-08-15T03:00:00'))).toBe(true);
    expect(reglaVigente(todoElDia, enBolivia('2026-08-15T23:30:00'))).toBe(true);
  });

  it('una franja que cruza medianoche se entiende como tal', () => {
    // 22:00 → 02:00 del día siguiente. Sin este manejo nunca se activaría.
    expect(dentroDeFranja(enBolivia('2026-08-15T23:00:00'), '22:00', '02:00')).toBe(true);
    expect(dentroDeFranja(enBolivia('2026-08-15T01:00:00'), '22:00', '02:00')).toBe(true);
    expect(dentroDeFranja(enBolivia('2026-08-15T12:00:00'), '22:00', '02:00')).toBe(false);
  });
});

describe('días de la semana', () => {
  it('respeta los días elegidos', () => {
    // 2026-08-15 es sábado (6).
    expect(diaIsoSemana(enBolivia('2026-08-15T09:00:00'))).toBe(6);

    const soloHabiles = { ...TODO_AGOSTO, dias_semana: [1, 2, 3, 4, 5] };
    expect(reglaVigente(soloHabiles, enBolivia('2026-08-15T09:00:00'))).toBe(false);
    // 2026-08-17 es lunes.
    expect(reglaVigente(soloHabiles, enBolivia('2026-08-17T09:00:00'))).toBe(true);
  });

  it('sin días declarados vale todos', () => {
    expect(reglaVigente({ ...TODO_AGOSTO, dias_semana: [] }, enBolivia('2026-08-15T09:00:00'))).toBe(true);
  });
});

describe('descripción legible', () => {
  it('resume fechas, franja y días', () => {
    const texto = describirVigencia({ ...TODO_AGOSTO, dias_semana: [1, 2, 3, 4, 5] });
    expect(texto).toContain('07:00 a 12:00');
    expect(texto).toContain('lun');
  });
});
