import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { crearEnvio, recibirTraslado, anularTraslado, valorEnTransito, listarTraslados } from './traslados.service';
import { altaInsumoEnCentro } from './insumos-centro.service';

/**
 * Traslados Centro → sucursal (Fase 3).
 *
 * La invariante que se verifica en todo el archivo es la ecuación del negocio:
 *
 *   valor total = inventario del centro + en tránsito + inventario de la sucursal
 *
 * Un traslado mueve plata de columna, nunca la cambia de monto. La única
 * excepción legítima es el faltante en la recepción, que sale del inventario
 * como merma y por eso baja el total en exactamente ese valor.
 */
describe('traslados.service', () => {
  let centroId: number;
  let sucursalId: number;
  let insumoId: number;
  let adminId: number;

  const valorCentro = async () => {
    const filas = await prisma.stockCentro.findMany({ where: { centro_id: centroId, insumo_id: insumoId } });
    return filas.reduce((acc, f) => acc + f.stock_actual * f.costo_promedio, 0);
  };

  const valorSucursal = async () => {
    const fila = await prisma.stockSucursal.findUnique({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    return fila ? fila.stock_actual * fila.costo_promedio : 0;
  };

  const valorTotal = async () =>
    (await valorCentro()) + (await valorSucursal()) + (await valorEnTransito({ centroId }));

  beforeAll(async () => {
    const admin = await prisma.usuario.findFirstOrThrow({ where: { rol: 'DUENO' } });
    adminId = admin.id;

    const sucursal = await prisma.sucursal.findFirstOrThrow({ orderBy: { id: 'asc' } });
    sucursalId = sucursal.id;

    const centro = await prisma.centroProduccion.create({ data: { nombre: `Centro traslados test ${Date.now()}` } });
    centroId = centro.id;

    // 100 unidades a Bs 3 = Bs 300 en el Centro.
    const alta = await prisma.$transaction((tx) => altaInsumoEnCentro(tx, centroId, {
      nombre: `Empanada traslado test ${Date.now()}`, unidad_medida: 'UNIDAD',
      stock_inicial: 100, costo_unitario: 3, stock_minimo: 0, punto_critico: 0,
    }, adminId, 'DUENO'));
    insumoId = alta.insumo.id;
  });

  afterAll(async () => {
    if (centroId == null || insumoId == null) return;
    await prisma.trasladoDetalle.deleteMany({ where: { traslado: { centro_id: centroId } } });
    await prisma.traslado.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.stockCentro.deleteMany({ where: { centro_id: centroId } });
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.delete({ where: { id: insumoId } });
    await prisma.centroProduccion.delete({ where: { id: centroId } });
  });

  it('despachar descuenta del centro y deja el valor en tránsito, sin cambiar el total', async () => {
    const totalAntes = await valorTotal();
    expect(totalAntes).toBeCloseTo(300, 6);

    const { traslado, valor_despachado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: insumoId, cantidad: 40 }], 'Envío de prueba', adminId, 'DUENO'));

    expect(traslado.estado).toBe('EN_TRANSITO');
    expect(traslado.numero).toBe(1);
    expect(valor_despachado).toBeCloseTo(120, 6); // 40 × 3

    expect(await valorCentro()).toBeCloseTo(180, 6);      // quedan 60 × 3
    expect(await valorEnTransito({ centroId })).toBeCloseTo(120, 6);
    expect(await valorSucursal()).toBeCloseTo(0, 6);      // todavía no llegó

    // La plata no se movió del negocio, solo de columna.
    expect(await valorTotal()).toBeCloseTo(totalAntes, 6);
  });

  it('recibir completo acredita a la sucursal con el costo congelado y vacía el tránsito', async () => {
    const totalAntes = await valorTotal();
    const [enTransito] = await listarTraslados({ centroId, estado: 'EN_TRANSITO' });

    const { valor_recibido, valor_faltante } = await prisma.$transaction((tx) =>
      recibirTraslado(tx, enTransito.id, [], adminId, 'DUENO'));

    expect(valor_recibido).toBeCloseTo(120, 6);
    expect(valor_faltante).toBe(0);

    expect(await valorEnTransito({ centroId })).toBe(0);
    expect(await valorSucursal()).toBeCloseTo(120, 6);
    expect(await valorTotal()).toBeCloseTo(totalAntes, 6);

    const stockSuc = await prisma.stockSucursal.findUniqueOrThrow({
      where: { insumo_id_sucursal_id: { insumo_id: insumoId, sucursal_id: sucursalId } },
    });
    expect(stockSuc.stock_actual).toBe(40);
    expect(stockSuc.costo_promedio).toBeCloseTo(3, 6);
  });

  it('un traslado ya recibido no se puede recibir ni anular de nuevo', async () => {
    const [recibido] = await listarTraslados({ centroId, estado: 'RECIBIDO' });

    await expect(
      prisma.$transaction((tx) => recibirTraslado(tx, recibido.id, [], adminId, 'DUENO')),
    ).rejects.toThrow(/ya está recibido/);

    await expect(
      prisma.$transaction((tx) => anularTraslado(tx, recibido.id, 'me equivoqué', adminId, 'DUENO')),
    ).rejects.toThrow(/no se anula/);
  });

  it('un faltante en la recepción baja el total exactamente en el valor faltante', async () => {
    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: insumoId, cantidad: 10 }], undefined, adminId, 'DUENO'));

    const totalAntes = await valorTotal();

    // Salieron 10, llegaron 7: faltan 3 × Bs 3 = Bs 9.
    const { valor_recibido, valor_faltante } = await prisma.$transaction((tx) =>
      recibirTraslado(tx, traslado.id, [{ insumo_id: insumoId, cantidad_recibida: 7 }], adminId, 'DUENO'));

    expect(valor_recibido).toBeCloseTo(21, 6);
    expect(valor_faltante).toBeCloseTo(9, 6);
    expect(await valorTotal()).toBeCloseTo(totalAntes - 9, 6);

    // Y el faltante queda asentado en el kardex del local, no desaparece.
    const merma = await prisma.movimientoInterno.findFirst({
      where: { insumo_id: insumoId, sucursal_id: sucursalId, tipo_movimiento: 'MERMA' },
      orderBy: { id: 'desc' },
    });
    expect(merma?.cantidad).toBeCloseTo(-3, 6);
  });

  it('no se puede declarar más de lo que salió', async () => {
    const { traslado } = await prisma.$transaction((tx) =>
      crearEnvio(tx, centroId, sucursalId, [{ insumo_id: insumoId, cantidad: 5 }], undefined, adminId, 'DUENO'));

    await expect(
      prisma.$transaction((tx) =>
        recibirTraslado(tx, traslado.id, [{ insumo_id: insumoId, cantidad_recibida: 8 }], adminId, 'DUENO')),
    ).rejects.toThrow(/salieron 5/);

    // Y el traslado sigue en tránsito, no quedó a medias.
    const sinTocar = await prisma.traslado.findUniqueOrThrow({ where: { id: traslado.id } });
    expect(sinTocar.estado).toBe('EN_TRANSITO');
  });

  it('anular devuelve la mercadería al centro con el mismo costo', async () => {
    const [enTransito] = await listarTraslados({ centroId, estado: 'EN_TRANSITO' });
    const totalAntes = await valorTotal();
    const centroAntes = await valorCentro();

    await prisma.$transaction((tx) => anularTraslado(tx, enTransito.id, 'El repartidor no salió', adminId, 'DUENO'));

    expect(await valorCentro()).toBeCloseTo(centroAntes + 15, 6); // 5 × 3
    expect(await valorEnTransito({ centroId })).toBe(0);
    expect(await valorTotal()).toBeCloseTo(totalAntes, 6);
  });

  it('no se puede enviar más de lo que hay en el centro', async () => {
    await expect(
      prisma.$transaction((tx) =>
        crearEnvio(tx, centroId, sucursalId, [{ insumo_id: insumoId, cantidad: 9999 }], undefined, adminId, 'DUENO')),
    ).rejects.toThrow(/No se puede enviar/);
  });

  it('el correlativo del centro avanza sin repetirse', async () => {
    const traslados = await listarTraslados({ centroId });
    const numeros = traslados.map(t => t.numero);
    expect(new Set(numeros).size).toBe(numeros.length);
  });
});
