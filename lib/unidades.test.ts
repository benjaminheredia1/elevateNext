import { describe, it, expect } from 'vitest';
import { convertir, unidadesEntrada, dimensionDe, redondearCantidad } from './unidades';

describe('conversión de unidades (entrada de datos)', () => {
  it('convierte dentro de la misma dimensión', () => {
    expect(convertir(0.15, 'KG', 'GR')).toBe(150);
    expect(convertir(150, 'GR', 'KG')).toBe(0.15);
    expect(convertir(2, 'LT', 'ML')).toBe(2000);
    expect(convertir(4, 'OZ', 'GR')).toBeCloseTo(113.4, 1);
    expect(convertir(1, 'LB', 'KG')).toBeCloseTo(0.45359, 4);
  });

  it('acepta mayúsculas/minúsculas y espacios', () => {
    expect(convertir(1, 'kg', ' gr ')).toBe(1000);
  });

  it('rechaza conversiones entre dimensiones distintas', () => {
    expect(convertir(1, 'KG', 'ML')).toBeNull();
    expect(convertir(1, 'LT', 'GR')).toBeNull();
    expect(convertir(1, 'UNIDAD', 'GR')).toBeNull();
  });

  it('la misma unidad (aunque sea personalizada) es identidad', () => {
    expect(convertir(3, 'CAJA', 'CAJA')).toBe(3);
    expect(convertir(3, 'GR', 'GR')).toBe(3);
  });

  it('unidadesEntrada ofrece solo unidades compatibles', () => {
    const paraGr = unidadesEntrada('GR').map(o => o.key);
    expect(paraGr).toContain('KG');
    expect(paraGr).toContain('OZ');
    expect(paraGr).not.toContain('ML');

    const paraMl = unidadesEntrada('ML').map(o => o.key);
    expect(paraMl).toContain('LT');
    expect(paraMl).toContain('OZ_FL');
    expect(paraMl).not.toContain('KG');

    // UNIDAD y unidades personalizadas no convierten: solo se ofrecen a sí mismas
    expect(unidadesEntrada('UNIDAD')).toEqual([{ key: 'UNIDAD', label: 'unidad' }]);
    expect(unidadesEntrada('CAJA')).toEqual([{ key: 'CAJA', label: 'caja' }]);
  });

  it('dimensionDe clasifica correctamente', () => {
    expect(dimensionDe('kg')).toBe('PESO');
    expect(dimensionDe('OZ_FL')).toBe('VOLUMEN');
    expect(dimensionDe('UNIDAD')).toBe('CONTEO');
    expect(dimensionDe('BOTELLA')).toBe('OTRA');
  });

  it('ejemplo dinero completo: 150 gr de carne a Bs 40/kg cuestan Bs 6', () => {
    const costoPorGr = 40 / (convertir(1, 'KG', 'GR') ?? 1); // 0.04
    const enBase = redondearCantidad(convertir(150, 'GR', 'GR') ?? 0);
    expect(enBase * costoPorGr).toBeCloseTo(6.0, 2);
  });
});
