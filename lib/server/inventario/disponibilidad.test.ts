import { describe, it, expect } from 'vitest';
import { calcularRinde } from './disponibilidad';

describe('calcularRinde', () => {
  it('REVENTA con insumo activo: rinde = stock entero', () => {
    const info = calcularRinde({ insumo_reventa: { stock_actual: 12.7, activo: true } });
    expect(info).toEqual({ rinde: 12, stockTracked: true, agotado: false });
  });

  it('REVENTA con insumo INACTIVO cuenta como agotado aunque tenga stock', () => {
    const info = calcularRinde({ insumo_reventa: { stock_actual: 25, activo: false } });
    expect(info.stockTracked).toBe(true);
    expect(info.rinde).toBe(0);
    expect(info.agotado).toBe(true);
  });

  it('ELABORADO con un insumo de receta INACTIVO cuenta como agotado', () => {
    const info = calcularRinde({
      recetaProducto_id: [
        { cantidad_utilizada: 1, insumo: { stock_actual: 100, activo: true } },
        { cantidad_utilizada: 2, insumo: { stock_actual: 50, activo: false } },
      ],
    });
    expect(info.rinde).toBe(0);
    expect(info.agotado).toBe(true);
  });

  it('sin campo activo (select legado) se asume insumo activo', () => {
    const info = calcularRinde({ insumo_reventa: { stock_actual: 8 } });
    expect(info).toEqual({ rinde: 8, stockTracked: true, agotado: false });
  });

  it('sin receta ni insumo de reventa: no se rastrea stock', () => {
    const info = calcularRinde({});
    expect(info).toEqual({ rinde: null, stockTracked: false, agotado: false });
  });
});
