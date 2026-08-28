import { describe, it, expect } from 'vitest';
import { etiquetaTipo } from './etiqueta-tipo';

describe('etiquetaTipo', () => {
  it('en la sucursal todo se rotula terciado', () => {
    // Al mostrador le llega hecho: si el Centro lo horneó o lo compró no cambia
    // nada de lo que hace con el producto.
    expect(etiquetaTipo('ELABORADO', 'sucursal')).toBe('Terciado');
    expect(etiquetaTipo('REVENTA', 'sucursal')).toBe('Terciado');
    expect(etiquetaTipo('TERCIADO', 'sucursal')).toBe('Terciado');
  });

  it('en el Centro se distingue, porque ahí sí decide', () => {
    // De esa diferencia depende que el producto tenga receta y consuma bruto.
    expect(etiquetaTipo('ELABORADO', 'centro')).toBe('Elaborado');
    expect(etiquetaTipo('REVENTA', 'centro')).toBe('Reventa');
  });

  it('un tipo desconocido no rompe la pantalla', () => {
    // El rótulo nunca es motivo para que una tabla deje de dibujarse.
    expect(etiquetaTipo('LO_QUE_SEA', 'centro')).toBe('Terciado');
  });
});
