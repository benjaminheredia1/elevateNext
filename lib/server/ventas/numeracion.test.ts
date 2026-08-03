/**
 * Correlativo de pedido por sucursal.
 *
 * El `id` de la transacción es un contador compartido: una sucursal nueva
 * mostraba "#2101" en su primera venta porque las otras ya llevaban 2100. Cada
 * local lleva ahora su propia numeración, que es la que se le dice al cliente.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { siguienteNumeroSucursal } from './numeracion';

const MARCADOR = `numeracion-${Date.now()}`;

let sucursalA: number;
let sucursalB: number;

/** Crea una venta tomando el número como lo hace el flujo real. */
async function vender(sucursalId: number, total = 10) {
  return prisma.$transaction(async (tx) => tx.transaccion.create({
    data: {
      canal: 'SALON',
      sucursal_id: sucursalId,
      total,
      estado: 'PAGADO',
      payment_status: 'PAGADO',
      cliente_nombre: MARCADOR,
      numero_sucursal: await siguienteNumeroSucursal(tx, sucursalId),
    },
  }));
}

beforeAll(async () => {
  sucursalA = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} A`, activa: true } })).id;
  sucursalB = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} B`, activa: true } })).id;
});

afterAll(async () => {
  await prisma.transaccion.deleteMany({ where: { sucursal_id: { in: [sucursalA, sucursalB] } } });
  await prisma.sucursal.deleteMany({ where: { id: { in: [sucursalA, sucursalB] } } });
});

describe('numeración por sucursal', () => {
  it('cada sucursal arranca en 1 sin importar el id global', async () => {
    const primeraA = await vender(sucursalA);
    const primeraB = await vender(sucursalB);

    expect(primeraA.numero_sucursal).toBe(1);
    expect(primeraB.numero_sucursal).toBe(1);
    // Los ids globales sí son distintos y correlativos entre sí.
    expect(primeraA.id).not.toBe(primeraB.id);
  });

  it('avanza de a uno dentro de cada local, sin mezclarse', async () => {
    await vender(sucursalA);
    const terceraA = await vender(sucursalA);
    const segundaB = await vender(sucursalB);

    expect(terceraA.numero_sucursal).toBe(3);
    // B siguió su propia cuenta aunque A vendió más veces en el medio.
    expect(segundaB.numero_sucursal).toBe(2);
  });

  it('dos ventas simultáneas no se quedan con el mismo número', async () => {
    // El lock por sucursal las serializa; sin él, ambas leerían el mismo máximo
    // y una moriría contra el índice único (o peor, quedarían duplicadas).
    const antes = await prisma.transaccion.count({ where: { sucursal_id: sucursalB } });
    const enParalelo = await Promise.all([vender(sucursalB), vender(sucursalB), vender(sucursalB)]);

    const numeros = enParalelo.map(v => v.numero_sucursal).sort((a, b) => a! - b!);
    expect(new Set(numeros).size).toBe(3);
    expect(numeros).toEqual([antes + 1, antes + 2, antes + 3]);
  });

  it('el índice único impide repetir el número a mano', async () => {
    const existente = await prisma.transaccion.findFirstOrThrow({ where: { sucursal_id: sucursalA } });
    await expect(
      prisma.transaccion.create({
        data: {
          canal: 'SALON', sucursal_id: sucursalA, total: 5,
          estado: 'PAGADO', payment_status: 'PAGADO',
          numero_sucursal: existente.numero_sucursal,
        },
      }),
    ).rejects.toThrow();
  });
});
