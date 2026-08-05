/**
 * Combos: valorización, ventana horaria y descomposición al vender.
 *
 * El escenario del pedido: un combo de agosto, de 7:00 a 12:00, con 20% de
 * descuento. Dentro de la franja se ofrece y se cobra; a las 12:01 no.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import prisma from '@/lib/prisma';
import { combosVigentes, lineasDeCombo, combosDeSucursal } from './combos.service';
import { habilitarProductoEnSucursal } from '@/lib/server/productos/catalogo-sucursal.service';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';

const MARCADOR = `combo-${Date.now()}`;
const enBolivia = (iso: string) => new Date(`${iso}-04:00`);

const DENTRO = enBolivia('2026-08-15T09:00:00');
const FUERA  = enBolivia('2026-08-15T12:01:00');

let sucursal: number;
let otraSucursal: number;
let bowlId: number;
let jugoId: number;
let comboId: number;

beforeAll(async () => {
  sucursal = await sucursalPorDefectoId();
  otraSucursal = (await prisma.sucursal.create({ data: { nombre: `${MARCADOR} otra`, activa: true } })).id;

  const crearProducto = async (nombre: string, precio: number) => {
    const p = await prisma.producto.create({
      data: { nombre, descripcion: 'fixture', precio, tipo: 'ELABORADO', estado_publicacion: 'PUBLICADO' },
    });
    await habilitarProductoEnSucursal(p.id, sucursal, { precio });
    return p.id;
  };

  bowlId = await crearProducto(`${MARCADOR} bowl`, 30);
  jugoId = await crearProducto(`${MARCADOR} jugo`, 10);

  comboId = (await prisma.promocionesDescuentos.create({
    data: {
      nombre: `${MARCADOR} desayuno`,
      valor: '20%',
      tipo: 'COMBO',
      modo_precio: 'PORCENTAJE',
      monto: 20,
      activo: true,
      items: { create: [{ producto_id: bowlId, cantidad: 1 }, { producto_id: jugoId, cantidad: 1 }] },
      sucursales: { create: [{ sucursal_id: sucursal, disponible: true }] },
      reglasHorarias_id: {
        create: [{
          fecha_inicio: enBolivia('2026-08-01T00:00:00'),
          fecha_fin: enBolivia('2026-08-31T23:59:59'),
          hora_inicio: '07:00',
          hora_fin: '12:00',
          dias_semana: [],
        }],
      },
    },
  })).id;
});

afterAll(async () => {
  await prisma.transaccionesDetalles.deleteMany({ where: { combo_id: comboId } });
  await prisma.promocionesDescuentos.deleteMany({ where: { id: comboId } });
  await prisma.productoSucursal.deleteMany({ where: { producto_id: { in: [bowlId, jugoId] } } });
  await prisma.producto.deleteMany({ where: { id: { in: [bowlId, jugoId] } } });
  await prisma.sucursal.deleteMany({ where: { id: otraSucursal } });
});

describe('valorización', () => {
  it('cobra el % sobre la suma de sus productos en esta sucursal', async () => {
    const [combo] = await combosDeSucursal(sucursal);
    // 30 + 10 = 40 → 20% menos = 32
    expect(combo.precio_lista).toBe(40);
    expect(combo.precio).toBe(32);
    expect(combo.ahorro).toBe(8);
  });

  it('con precio fijo cobra exactamente ese monto', async () => {
    await prisma.promocionesDescuentos.update({
      where: { id: comboId },
      data: { modo_precio: 'PRECIO_FIJO', monto: 35 },
    });
    const [combo] = await combosDeSucursal(sucursal);
    expect(combo.precio).toBe(35);
    expect(combo.ahorro).toBe(5);

    await prisma.promocionesDescuentos.update({
      where: { id: comboId },
      data: { modo_precio: 'PORCENTAJE', monto: 20 },
    });
  });

  it('el precio del local pisa al de la promoción', async () => {
    await prisma.promocionSucursal.update({
      where: { promocion_id_sucursal_id: { promocion_id: comboId, sucursal_id: sucursal } },
      data: { monto: 10 },
    });
    const [combo] = await combosDeSucursal(sucursal);
    expect(combo.precio).toBe(36); // 40 - 10%

    await prisma.promocionSucursal.update({
      where: { promocion_id_sucursal_id: { promocion_id: comboId, sucursal_id: sucursal } },
      data: { monto: null },
    });
  });
});

describe('ventana horaria', () => {
  it('se ofrece dentro de la franja', async () => {
    const vigentes = await combosVigentes(sucursal, DENTRO);
    expect(vigentes.map(c => c.id)).toContain(comboId);
  });

  it('no se ofrece pasada la hora', async () => {
    const vigentes = await combosVigentes(sucursal, FUERA);
    expect(vigentes.map(c => c.id)).not.toContain(comboId);
  });

  it('no se ofrece en una sucursal donde no está habilitado', async () => {
    const vigentes = await combosVigentes(otraSucursal, DENTRO);
    expect(vigentes.map(c => c.id)).not.toContain(comboId);
  });
});

describe('venta', () => {
  it('se descompone en una línea por producto, sumando el precio del combo', async () => {
    const { combo, lineas } = await lineasDeCombo(comboId, 2, sucursal, DENTRO);

    expect(combo.precio).toBe(32);
    expect(lineas).toHaveLength(2);
    // Todas las líneas quedan marcadas con el combo, para poder agruparlas.
    expect(lineas.every(l => l.combo_id === comboId)).toBe(true);

    // Lo cobrado debe ser exactamente 2 combos, sin centavos perdidos en el
    // prorrateo: es la parte que descuadra el arqueo si se hace mal.
    const total = lineas.reduce((s, l) => s + l.precio_unitario * l.cantidad, 0);
    expect(Number(total.toFixed(2))).toBe(64);

    // Y las cantidades son las del combo × la cantidad pedida, que es lo que
    // después descuenta insumos.
    expect(lineas.find(l => l.producto_id === bowlId)!.cantidad).toBe(2);
    expect(lineas.find(l => l.producto_id === jugoId)!.cantidad).toBe(2);
  });

  it('rechaza el cobro fuera del horario aunque lo manden igual', async () => {
    await expect(lineasDeCombo(comboId, 1, sucursal, FUERA)).rejects.toThrow(/horario/i);
  });

  it('rechaza el cobro en una sucursal que no lo tiene habilitado', async () => {
    await expect(lineasDeCombo(comboId, 1, otraSucursal, DENTRO)).rejects.toThrow(/no está disponible/i);
  });

  it('rechaza un combo desactivado', async () => {
    await prisma.promocionesDescuentos.update({ where: { id: comboId }, data: { activo: false } });
    await expect(lineasDeCombo(comboId, 1, sucursal, DENTRO)).rejects.toThrow(/no está disponible/i);
    await prisma.promocionesDescuentos.update({ where: { id: comboId }, data: { activo: true } });
  });
});

/**
 * Sin stock el combo se sigue vendiendo, igual que los productos sueltos: en el
 * mostrador el cajero tiene la mercadería delante aunque el inventario esté sin
 * cargar. Antes el combo desaparecía de la caja y el cobro se rechazaba, que es
 * un criterio de la tienda web (ahí sí bloquea /api/pedidos).
 */
describe('stock agotado', () => {
  let insumoId: number;

  beforeAll(async () => {
    // El bowl pasa a tener receta, con un insumo sin existencias en este local.
    const insumo = await prisma.insumo.create({
      data: { nombre: `${MARCADOR} insumo`, unidad_medida: 'UNIDAD', stock_actual: 0, stock_minimo: 0, costo_promedio: 1 },
    });
    insumoId = insumo.id;
    await prisma.stockSucursal.create({
      data: { insumo_id: insumoId, sucursal_id: sucursal, stock_actual: 0 },
    });
    await prisma.recetasProducto.create({
      data: { producto_id: bowlId, insumo_id: insumoId, sucursal_id: sucursal, cantidad_utilizada: 1 },
    });
  });

  afterAll(async () => {
    await prisma.recetasProducto.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.stockSucursal.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.movimientoInterno.deleteMany({ where: { insumo_id: insumoId } });
    await prisma.insumo.deleteMany({ where: { id: insumoId } });
  });

  it('sigue apareciendo en la caja, marcado como agotado', async () => {
    const vigentes = await combosVigentes(sucursal, DENTRO);
    const combo = vigentes.find(c => c.id === comboId);

    expect(combo).toBeDefined();
    expect(combo!.rinde).toBe(0);
    expect(combo!.agotado).toBe(true);
  });

  it('se puede cobrar aunque no haya stock para armarlo', async () => {
    const { lineas } = await lineasDeCombo(comboId, 2, sucursal, DENTRO);
    expect(lineas).toHaveLength(2);
  });

  it('pero sigue bloqueado fuera de su franja horaria', async () => {
    await expect(lineasDeCombo(comboId, 1, sucursal, FUERA)).rejects.toThrow(/horario/i);
  });
});
