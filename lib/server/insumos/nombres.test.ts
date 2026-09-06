import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { normalizarNombre, buscarInsumoHomonimo, asegurarNombreDeInsumoLibre } from './nombres';
import { ConflictError } from '@/lib/server/errors';

/**
 * Los cuatro "C4" y los cuatro "B4" del catálogo salieron de acá: dar de alta
 * un insumo que ya existía, con una tilde o un espacio de diferencia, creaba un
 * segundo renglón indistinguible en la pantalla de inventario.
 *
 * Este chequeo mira insumos contra insumos. Que un producto se llame igual es
 * otro asunto y lo resuelve el aviso de producto duplicado.
 */
describe('normalizarNombre', () => {
  it('iguala mayúsculas, tildes y espacios de más', () => {
    expect(normalizarNombre('Sándwich pollo')).toBe(normalizarNombre('Sandwich pollo'));
    expect(normalizarNombre('Brownie ')).toBe(normalizarNombre('Brownie'));
    expect(normalizarNombre('  INFUSIÓN   Elevate ')).toBe('infusion elevate');
  });

  it('no iguala nombres que de verdad son distintos', () => {
    expect(normalizarNombre('Steak Quesadilla')).not.toBe(normalizarNombre('Chicken Quesadilla'));
    // Un typo sí queda distinto: no se puede adivinar la intención.
    expect(normalizarNombre('Steak Quesadila')).not.toBe(normalizarNombre('Steak Quesadilla'));
  });
});

describe('buscarInsumoHomonimo / asegurarNombreDeInsumoLibre', () => {
  const ts = Date.now();
  const NOMBRE = `Cuñape homónimo ${ts}`;
  let insumoId: number;
  const creados: number[] = [];

  beforeAll(async () => {
    const insumo = await prisma.insumo.create({
      data: { nombre: NOMBRE, stock_actual: 0, stock_minimo: 0, unidad_medida: 'UNIDAD', costo_promedio: 3 },
    });
    insumoId = insumo.id;
    creados.push(insumo.id);
  });

  afterAll(async () => {
    await prisma.insumo.deleteMany({ where: { id: { in: creados } } });
  });

  it('encuentra el homónimo con tildes, mayúsculas y espacios distintos', async () => {
    const hallado = await buscarInsumoHomonimo(`  CUNAPE   HOMONIMO ${ts} `);
    expect(hallado?.id).toBe(insumoId);
  });

  it('no encuentra nada con un nombre distinto', async () => {
    expect(await buscarInsumoHomonimo(`Cuñape distinto ${ts}`)).toBeNull();
  });

  it('ignora los insumos dados de baja: ese renglón ya no se opera', async () => {
    const debaja = await prisma.insumo.create({
      data: {
        nombre: `Insumo de baja ${ts}`, stock_actual: 0, stock_minimo: 0,
        unidad_medida: 'UNIDAD', costo_promedio: 1, activo: false,
      },
    });
    creados.push(debaja.id);
    expect(await buscarInsumoHomonimo(`Insumo de baja ${ts}`)).toBeNull();
  });

  it('deja excluir un insumo, para poder renombrarlo sin chocar consigo mismo', async () => {
    expect(await buscarInsumoHomonimo(NOMBRE, prisma, insumoId)).toBeNull();
  });

  it('asegurarNombreDeInsumoLibre lanza ConflictError nombrando el renglón existente', async () => {
    await expect(asegurarNombreDeInsumoLibre(NOMBRE)).rejects.toThrow(ConflictError);
    await expect(asegurarNombreDeInsumoLibre(NOMBRE)).rejects.toThrow(new RegExp(`insumo #${insumoId}`));
  });

  it('no lanza si el nombre está libre', async () => {
    await expect(asegurarNombreDeInsumoLibre(`Nombre libre ${ts}`)).resolves.toBeUndefined();
  });
});
