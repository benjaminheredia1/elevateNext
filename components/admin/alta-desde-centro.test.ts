import { describe, it, expect } from 'vitest';
import { extrasDelCentro } from './alta-desde-centro';

describe('extrasDelCentro', () => {
  const receta = [{ insumo_id: 7, cantidad_utilizada: 0.25 }];

  it('un producto de REVENTA creado en el Centro manda centro_id', () => {
    // El bug que dejó al sistema sin poder crear reventa: el wizard ataba
    // `centro_id` a que el producto fuera ELABORADO, el servidor lo rechazaba
    // con 422, y la sucursal ya no tiene alta. No se podía crear en ningún lado.
    const extras = extrasDelCentro(3, 'REVENTA', []);
    expect(extras.centro_id).toBe(3);
  });

  it('un REVENTA no lleva receta de producción: el Centro lo compra', () => {
    const extras = extrasDelCentro(3, 'REVENTA', receta);
    expect(extras.receta_centro).toBeUndefined();
  });

  it('un ELABORADO manda centro_id y su receta de producción', () => {
    const extras = extrasDelCentro(3, 'ELABORADO', receta);
    expect(extras.centro_id).toBe(3);
    expect(extras.receta_centro).toEqual([{ insumo_id: 7, cantidad_utilizada: 0.25 }]);
  });

  it('un TERCIADO tambien nace en el Centro, sin receta', () => {
    const extras = extrasDelCentro(3, 'TERCIADO', []);
    expect(extras.centro_id).toBe(3);
    expect(extras.receta_centro).toBeUndefined();
  });

  it('sin Centro no agrega nada: el alta desde otro lado queda igual', () => {
    expect(extrasDelCentro(undefined, 'ELABORADO', receta)).toEqual({});
  });

  it('descarta el estado de edición de la receta y manda solo lo persistible', () => {
    const conBasura = [{ insumo_id: 7, cantidad_utilizada: 2, ui_txt: '2 kg', ui_unidad: 'KG' }];
    const extras = extrasDelCentro(3, 'ELABORADO', conBasura);
    expect(extras.receta_centro).toEqual([{ insumo_id: 7, cantidad_utilizada: 2 }]);
  });
});
