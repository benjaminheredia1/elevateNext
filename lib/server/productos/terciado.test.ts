import { describe, it, expect } from 'vitest';
import { faltantesPublicacion } from './publicacion';
import { ProductoConFichaSchema } from '@/lib/server/dto/inventario.dto';

/**
 * TERCIADO (Fase 4).
 *
 * El valor nuevo del enum no agrega lógica de venta: se comporta igual que
 * REVENTA en todo lo que decide stock, disponibilidad y publicación. Estos
 * tests fijan esa equivalencia, que es justamente lo que se rompería si alguien
 * agrega más adelante una rama `tipo === 'REVENTA'` olvidándose del terciado.
 */
describe('producto TERCIADO', () => {
  const base = {
    nombre: 'Empanada terciada',
    descripcion: 'x',
    precio: 12,
    marcas: [1],
    categorias: [],
  };

  it('no acepta receta de venta: su inventario es el insumo vinculado', () => {
    const res = ProductoConFichaSchema.safeParse({
      ...base,
      tipo: 'TERCIADO',
      receta: [{ insumo_id: 1, cantidad_utilizada: 2 }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(res.error.issues)).toMatch(/no lleva receta de venta/);
    }
  });

  it('sin receta es válido', () => {
    const res = ProductoConFichaSchema.safeParse({ ...base, tipo: 'TERCIADO', insumo_reventa_id: 7 });
    expect(res.success).toBe(true);
  });

  it('para publicarse necesita insumo vinculado, no receta', () => {
    const sinInsumo = faltantesPublicacion({
      nombre: 'Empanada terciada', descripcion: 'x', precio: 12, imagen_url: null,
      tipo: 'TERCIADO', insumo_reventa_id: null, marcas: [1], recetaProducto_id: [],
    });
    expect(sinInsumo).toContain('insumo de inventario');

    const conInsumo = faltantesPublicacion({
      nombre: 'Empanada terciada', descripcion: 'x', precio: 12, imagen_url: null,
      tipo: 'TERCIADO', insumo_reventa_id: 7, marcas: [1], recetaProducto_id: [],
    });
    expect(conInsumo).toHaveLength(0);
  });

  it('un ELABORADO sigue exigiendo receta: el cambio no aflojó esa regla', () => {
    const faltantes = faltantesPublicacion({
      nombre: 'Plato', descripcion: 'x', precio: 20, imagen_url: null,
      tipo: 'ELABORADO', insumo_reventa_id: null, marcas: [1], recetaProducto_id: [],
    });
    expect(faltantes).toContain('receta con insumos y cantidades validas');
  });
});
