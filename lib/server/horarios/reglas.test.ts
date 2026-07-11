import { describe, it, expect } from 'vitest';
import { esRolTrabajador, validarCelda, normalizarCelda, normalizarSemana } from './reglas';

describe('esRolTrabajador', () => {
  it('CAJERO cuenta como trabajador', () => {
    expect(esRolTrabajador('CAJERO')).toBe(true);
  });
  it('ADMIN cuenta como trabajador', () => {
    expect(esRolTrabajador('ADMIN')).toBe(true);
  });
  it('CLIENTE no cuenta como trabajador', () => {
    expect(esRolTrabajador('CLIENTE')).toBe(false);
  });
});

describe('validarCelda', () => {
  it('día libre sin horas es válido', () => {
    expect(validarCelda({ es_libre: true, hora_entrada: null, hora_salida: null })).toEqual([]);
  });

  it('día no libre sin horas es inválido', () => {
    const errores = validarCelda({ es_libre: false, hora_entrada: null, hora_salida: null });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('día no libre con solo hora de entrada es inválido', () => {
    const errores = validarCelda({ es_libre: false, hora_entrada: '08:00', hora_salida: null });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('hora_salida <= hora_entrada es inválido', () => {
    const errores = validarCelda({ es_libre: false, hora_entrada: '16:00', hora_salida: '08:00' });
    expect(errores).toContain('La hora de salida debe ser posterior a la hora de entrada');
  });

  it('hora_salida == hora_entrada es inválido', () => {
    const errores = validarCelda({ es_libre: false, hora_entrada: '08:00', hora_salida: '08:00' });
    expect(errores.length).toBeGreaterThan(0);
  });

  it('día no libre con horas válidas y ordenadas es válido', () => {
    expect(validarCelda({ es_libre: false, hora_entrada: '08:00', hora_salida: '16:00' })).toEqual([]);
  });
});

describe('normalizarCelda', () => {
  it('deja horas en null cuando es_libre=true aunque vengan cargadas', () => {
    const resultado = normalizarCelda({ es_libre: true, hora_entrada: '08:00', hora_salida: '16:00' });
    expect(resultado.hora_entrada).toBeNull();
    expect(resultado.hora_salida).toBeNull();
  });

  it('no toca las horas cuando es_libre=false', () => {
    const resultado = normalizarCelda({ es_libre: false, hora_entrada: '08:00', hora_salida: '16:00' });
    expect(resultado.hora_entrada).toBe('08:00');
    expect(resultado.hora_salida).toBe('16:00');
  });
});

describe('normalizarSemana', () => {
  it('rellena los 7 días aunque solo haya registros para 3', () => {
    const registros = [
      { dia_semana: 1, es_libre: false, hora_entrada: '08:00', hora_salida: '16:00' },
      { dia_semana: 3, es_libre: true, hora_entrada: null, hora_salida: null },
      { dia_semana: 7, es_libre: false, hora_entrada: '09:00', hora_salida: '13:00' },
    ];
    const semana = normalizarSemana(registros);

    expect(Object.keys(semana)).toHaveLength(7);
    expect(semana[1]).toEqual({ es_libre: false, hora_entrada: '08:00', hora_salida: '16:00' });
    expect(semana[2]).toEqual({ es_libre: false, hora_entrada: null, hora_salida: null });
    expect(semana[3]).toEqual({ es_libre: true, hora_entrada: null, hora_salida: null });
    expect(semana[7]).toEqual({ es_libre: false, hora_entrada: '09:00', hora_salida: '13:00' });
  });

  it('devuelve todos los días con default cuando no hay registros', () => {
    const semana = normalizarSemana([]);
    for (const dia of [1, 2, 3, 4, 5, 6, 7] as const) {
      expect(semana[dia]).toEqual({ es_libre: false, hora_entrada: null, hora_salida: null });
    }
  });
});
