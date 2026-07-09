import { describe, it, expect } from 'vitest';
import { faltantesPublicacion, assertPublicable, type ProductoPublicable } from './publicacion';

const productoCompleto: ProductoPublicable = {
  nombre: 'Bowl de pollo',
  descripcion: 'Bowl con pollo, arroz y vegetales',
  precio: 45,
  imagen_url: null,
  tipo: 'ELABORADO',
  insumo_reventa_id: null,
  marcas: [1],
  recetaProducto_id: [{ cantidad_utilizada: 1, insumo_id: 1 }],
};

describe('faltantesPublicacion', () => {
  it('no exige imagen_url', () => {
    const faltantes = faltantesPublicacion(productoCompleto);
    expect(faltantes).not.toContain('imagen');
  });

  it('sigue exigiendo nombre', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, nombre: '  ' });
    expect(faltantes).toContain('nombre');
  });

  it('sigue exigiendo descripcion', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, descripcion: '' });
    expect(faltantes).toContain('descripcion');
  });

  it('sigue exigiendo precio de venta positivo', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, precio: 0 });
    expect(faltantes).toContain('precio de venta');
  });

  it('sigue exigiendo al menos un menu', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, marcas: [] });
    expect(faltantes).toContain('menu donde aparecera');
  });

  it('sigue exigiendo receta valida para productos ELABORADO', () => {
    const faltantes = faltantesPublicacion({ ...productoCompleto, recetaProducto_id: [] });
    expect(faltantes).toContain('receta con insumos y cantidades validas');
  });

  it('sigue exigiendo insumo de reventa para productos REVENTA', () => {
    const faltantes = faltantesPublicacion({
      ...productoCompleto,
      tipo: 'REVENTA',
      insumo_reventa_id: null,
      tiene_nuevo_insumo_reventa: false,
    });
    expect(faltantes).toContain('insumo de reventa');
  });
});

describe('assertPublicable', () => {
  it('no lanza error para un producto completo sin imagen_url', () => {
    expect(() => assertPublicable(productoCompleto)).not.toThrow();
  });

  it('lanza error si falta el nombre', () => {
    expect(() => assertPublicable({ ...productoCompleto, nombre: '' })).toThrow();
  });
});
