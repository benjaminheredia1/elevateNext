import { describe, it, expect } from 'vitest';
import { sucursalDeLasAcciones, destinoDeLaBaja } from './ambito-productos';

describe('alcance de las acciones del catálogo', () => {
  it('desde el Centro no se opera sobre ninguna sucursal, aunque haya uno guardado', () => {
    // El bug real: el store recuerda el último local elegido, así que entrar
    // desde el Centro mandaba ese sucursal_id en cada acción.
    expect(sucursalDeLasAcciones('centro', '7')).toBe('');
  });

  it('desde una sucursal se opera sobre la elegida', () => {
    expect(sucursalDeLasAcciones('sucursal', '7')).toBe('7');
  });

  it('la baja del Centro es del Centro: deja de abastecer, no le saca la carta a nadie', () => {
    expect(destinoDeLaBaja('centro', '7')).toBe('centro');
  });

  it('la baja de una sucursal es solo de ese local', () => {
    expect(destinoDeLaBaja('sucursal', '7')).toBe('sucursal');
  });

  it('sin sucursal elegida (dueño en consolidado) la baja es del catálogo', () => {
    // Esta es la que apaga el insumo espejo en TODOS los locales, y por eso no
    // puede ser nunca la del Centro.
    expect(destinoDeLaBaja('sucursal', '')).toBe('catalogo');
  });
});
