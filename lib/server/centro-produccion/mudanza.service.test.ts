import { describe, it, expect } from 'vitest';
import prisma from '@/lib/prisma';
import { consolidarCosto, esInsumoEspejo, listarInsumosBrutos } from './mudanza.service';

describe('consolidarCosto', () => {
  it('pondera por cantidad, no por cantidad de lotes', () => {
    // 10 kg a 30 + 2 kg a 50 = 400 / 12 = 33,33 (no 40)
    expect(consolidarCosto([{ cantidad: 10, costo: 30 }, { cantidad: 2, costo: 50 }])).toBeCloseTo(33.3333, 4);
  });

  it('devuelve 0 sin lotes', () => {
    expect(consolidarCosto([])).toBe(0);
  });

  it('ignora los lotes sin cantidad para no dividir por cero', () => {
    expect(consolidarCosto([{ cantidad: 0, costo: 99 }, { cantidad: 5, costo: 10 }])).toBe(10);
  });

  it('con stock negativo no inventa un costo absurdo', () => {
    // Un local en -3 y otro en +13 dan 10 unidades netas al costo de quien las tiene
    expect(consolidarCosto([{ cantidad: -3, costo: 20 }, { cantidad: 13, costo: 20 }])).toBe(20);
  });

  it('si las cantidades se cancelan devuelve 0 en vez de dividir por cero', () => {
    // Caso raro pero posible con un local en negativo: sin cantidad neta no hay
    // costo que promediar, y devolver Infinity o NaN envenenaría el valorizado.
    expect(consolidarCosto([{ cantidad: -5, costo: 20 }, { cantidad: 5, costo: 30 }])).toBe(0);
  });
});

describe('bruto vs. espejo', () => {
  it('listarInsumosBrutos excluye los espejos', async () => {
    const sufijo = Date.now();
    const bruto = await prisma.insumo.create({
      data: { nombre: `Bruto ${sufijo}`, unidad_medida: 'GR', stock_actual: 0, stock_minimo: 0 },
    });
    const espejo = await prisma.insumo.create({
      data: { nombre: `Espejo ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 0, stock_minimo: 0 },
    });
    const producto = await prisma.producto.create({
      data: { nombre: `Prod ${sufijo}`, descripcion: 'x', precio: 1, tipo: 'REVENTA', insumo_reventa_id: espejo.id },
    });

    const brutos = await listarInsumosBrutos();
    const ids = brutos.map(b => b.id);
    expect(ids).toContain(bruto.id);
    expect(ids).not.toContain(espejo.id);
    expect(await esInsumoEspejo(espejo.id)).toBe(true);
    expect(await esInsumoEspejo(bruto.id)).toBe(false);

    await prisma.producto.delete({ where: { id: producto.id } });
    await prisma.insumo.deleteMany({ where: { id: { in: [bruto.id, espejo.id] } } });
  });

  it('un insumo deja de ser espejo si el producto que lo apuntaba se borra', async () => {
    // La condición se deriva de la relación y no de una columna, justamente
    // para que no pueda quedar desincronizada con la realidad.
    const sufijo = Date.now();
    const insumo = await prisma.insumo.create({
      data: { nombre: `Ex espejo ${sufijo}`, unidad_medida: 'UNIDAD', stock_actual: 0, stock_minimo: 0 },
    });
    const producto = await prisma.producto.create({
      data: { nombre: `Prod ex ${sufijo}`, descripcion: 'x', precio: 1, tipo: 'REVENTA', insumo_reventa_id: insumo.id },
    });

    expect(await esInsumoEspejo(insumo.id)).toBe(true);

    await prisma.producto.delete({ where: { id: producto.id } });
    expect(await esInsumoEspejo(insumo.id)).toBe(false);

    await prisma.insumo.delete({ where: { id: insumo.id } });
  });
});
