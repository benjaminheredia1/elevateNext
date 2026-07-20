/**
 * Integración: venta física en caja con pago mixto (QR + efectivo).
 * Crea sus propios fixtures (producto + turno abierto) y verifica que el
 * desglose impacte MovimientoCaja, CuentaFinanciera y los contadores del turno.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';

const NOMBRE_PROD = 'Producto Venta Mixta E2E';
const PRECIO = 20;

let token: string;
let productoId: number;
let sucursalId: number;
let turnoId: number;
let cajeroUserId: number;

// IP distinta por request para no chocar con el rate limit del endpoint (3/10s por IP)
let reqCount = 0;
function req(body: unknown, tk?: string) {
  reqCount += 1;
  return new NextRequest('http://localhost/api/caja/venta', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': `10.99.0.${reqCount}`,
      ...(tk ? { authorization: `Bearer ${tk}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  const cajero = await login('cajero@elevate.com', 'cajero123');
  token = cajero.access_token;

  const user = await prisma.usuario.findUniqueOrThrow({ where: { email: 'cajero@elevate.com' } });
  if (user.sucursal_id == null) throw new Error('El seed debe asignar sucursal al cajero');
  sucursalId = user.sucursal_id;
  cajeroUserId = user.id;

  // Producto propio, idempotente por nombre (sin receta: no toca inventario)
  let prod = await prisma.producto.findFirst({ where: { nombre: NOMBRE_PROD } });
  if (!prod) {
    prod = await prisma.producto.create({
      data: { nombre: NOMBRE_PROD, descripcion: 'Fixture venta mixta', precio: PRECIO, disponible: true },
    });
  }
  productoId = prod.id;

  // Turno limpio: cerrar cualquier abierto de la sucursal y abrir uno propio
  await prisma.cajaTurno.updateMany({
    where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
  const turno = await prisma.cajaTurno.create({
    data: { sucursal_id: sucursalId, cajero_id: user.id, apertura_efectivo: 100, apertura_qr: 0 },
  });
  turnoId = turno.id;
});

afterAll(async () => {
  await prisma.cajaTurno.updateMany({
    where: { id: turnoId, estado: 'ABIERTO' },
    data: { estado: 'CERRADO', fecha_cierre: new Date() },
  });
});

describe('POST /api/caja/venta — pago mixto', () => {
  it('rechaza sin token (401)', async () => {
    const res = await POST(req({ items: [{ producto_id: productoId, cantidad: 1 }], metodo_pago: 'EFECTIVO' }));
    expect(res.status).toBe(401);
  });

  it('MIXTO sin desglose devuelve 422', async () => {
    const res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 1 }],
      metodo_pago: 'MIXTO',
    }, token));
    expect(res.status).toBe(422);
  });

  it('desglose que no suma el total devuelve 422', async () => {
    const res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 2 }], // total 40
      metodo_pago: 'MIXTO',
      pago_mixto: { efectivo: 10, qr: 10 },
    }, token));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('no coincide');
  });

  it('MIXTO no aplica a cortesías (422)', async () => {
    const res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 1 }],
      metodo_pago: 'MIXTO',
      pago_mixto: { efectivo: 10, qr: 10 },
      es_cortesia: true,
    }, token));
    expect(res.status).toBe(422);
  });

  it('venta mixta feliz: 2 movimientos, cuentas y turno cuadrados', async () => {
    const turnoAntes = await prisma.cajaTurno.findUniqueOrThrow({ where: { id: turnoId } });
    const cuentaEfAntes = await prisma.cuentaFinanciera.findUniqueOrThrow({
      where: { sucursal_id_tipo: { sucursal_id: sucursalId, tipo: 'EFECTIVO' } },
    });
    const cuentaQrAntes = await prisma.cuentaFinanciera.findUniqueOrThrow({
      where: { sucursal_id_tipo: { sucursal_id: sucursalId, tipo: 'QR' } },
    });

    const res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 2 }], // total 40
      metodo_pago: 'MIXTO',
      pago_mixto: { efectivo: 15.5, qr: 24.5 },
    }, token));
    expect(res.status).toBe(201);
    const venta = await res.json();
    expect(venta.metodo_pago).toBe('MIXTO');
    expect(Number(venta.total)).toBe(40);

    // Dos movimientos de caja, uno por método, con el desglose exacto
    const movimientos = await prisma.movimientoCaja.findMany({
      where: { transaccion_id: venta.id },
      orderBy: { metodo_pago: 'asc' },
    });
    expect(movimientos).toHaveLength(2);
    const efectivo = movimientos.find(m => m.metodo_pago === 'EFECTIVO');
    const qr = movimientos.find(m => m.metodo_pago === 'QR');
    expect(Number(efectivo?.monto)).toBe(15.5);
    expect(Number(qr?.monto)).toBe(24.5);

    // Contadores del turno (base del cuadre de caja)
    const turnoDespues = await prisma.cajaTurno.findUniqueOrThrow({ where: { id: turnoId } });
    expect(Number(turnoDespues.ventas_efectivo) - Number(turnoAntes.ventas_efectivo)).toBe(15.5);
    expect(Number(turnoDespues.ventas_qr) - Number(turnoAntes.ventas_qr)).toBe(24.5);

    // Saldos de las cuentas financieras
    const cuentaEfDespues = await prisma.cuentaFinanciera.findUniqueOrThrow({ where: { id: cuentaEfAntes.id } });
    const cuentaQrDespues = await prisma.cuentaFinanciera.findUniqueOrThrow({ where: { id: cuentaQrAntes.id } });
    expect(Number(cuentaEfDespues.saldo) - Number(cuentaEfAntes.saldo)).toBe(15.5);
    expect(Number(cuentaQrDespues.saldo) - Number(cuentaQrAntes.saldo)).toBe(24.5);
  });

  it('venta con abono a deuda: FIFO sobre fiados, movimientos e ingreso a caja', async () => {
    // Cliente con dos deudas: 10 (antigua) y 20 (reciente)
    const cliente = await prisma.cliente.upsert({
      where: { telefono: '79999002' },
      update: {},
      create: { nombre: 'Cliente Abono E2E', telefono: '79999002' },
    });
    await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta: { cliente_id: cliente.id } } });
    await prisma.cuentaCorriente.deleteMany({ where: { cliente_id: cliente.id } });
    const deuda1 = await prisma.cuentaCorriente.create({
      data: { tipo: 'POR_COBRAR', contraparte: cliente.nombre, concepto: 'Fiado E2E 1', monto: 10, creado_por_id: cajeroUserId, cliente_id: cliente.id, created_at: new Date('2026-01-01') },
    });
    const deuda2 = await prisma.cuentaCorriente.create({
      data: { tipo: 'POR_COBRAR', contraparte: cliente.nombre, concepto: 'Fiado E2E 2', monto: 20, creado_por_id: cajeroUserId, cliente_id: cliente.id },
    });

    // Abono mayor a la deuda → 422
    let res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
      cliente_id: cliente.id,
      abono_deuda: 99,
    }, token));
    expect(res.status).toBe(422);

    // Abono con pago mixto → 422 (regla del DTO)
    res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 1 }],
      metodo_pago: 'MIXTO',
      pago_mixto: { efectivo: 10, qr: 10 },
      cliente_id: cliente.id,
      abono_deuda: 5,
    }, token));
    expect(res.status).toBe(422);

    // Venta 20 + abono 15: paga completa la deuda antigua (10) y 5 de la reciente
    res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 1 }], // total 20
      metodo_pago: 'EFECTIVO',
      cliente_id: cliente.id,
      abono_deuda: 15,
    }, token));
    expect(res.status).toBe(201);
    const venta = await res.json();
    expect(Number(venta.abono_deuda)).toBe(15);

    const d1 = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: deuda1.id } });
    const d2 = await prisma.cuentaCorriente.findUniqueOrThrow({ where: { id: deuda2.id } });
    expect(d1.estado).toBe('PAGADA');
    expect(Number(d1.monto_pagado)).toBe(10);
    expect(d2.estado).toBe('PARCIAL');
    expect(Number(d2.monto_pagado)).toBe(5);

    // Movimientos de cobro de fiado ligados al turno (suman el abono)
    const cobros = await prisma.movimientoCaja.findMany({
      where: { turno_id: turnoId, tipo: 'INGRESO_EXTRA', categoria: 'Cobro fiado' },
    });
    expect(cobros.reduce((s, m) => s + Number(m.monto), 0)).toBe(15);

    // Auditoría de la venta incluye el abono
    const audit = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'Transaccion', entidad_id: String(venta.id) },
    });
    expect(audit?.detalle).toContain('abono deuda Bs 15.00');

    // El cobro aparece en el Flujo de Caja con categoría y concepto explicativos
    const { flujoCaja } = await import('@/lib/server/finanzas/flujo.service');
    const hoy = new Date();
    const flujo = await flujoCaja({ desde: new Date(hoy.getTime() - 60 * 60 * 1000), hasta: hoy });
    const catCobro = flujo.por_categoria.find(c => c.categoria === 'Cobro fiado');
    expect(catCobro).toBeTruthy();
    const movCobro = flujo.movimientos.find(m => m.categoria === 'Cobro fiado' && m.concepto?.includes('Cliente Abono E2E'));
    expect(movCobro?.concepto).toContain('Fiado E2E');
  });

  it('cobro de deuda sin compra: endpoint de abono directo', async () => {
    const { POST: abonoPost } = await import('@/app/api/caja/clientes/[id]/abono/route');
    const cliente = await prisma.cliente.upsert({
      where: { telefono: '79999005' },
      update: {},
      create: { nombre: 'Cliente Solo Deuda E2E', telefono: '79999005' },
    });
    await prisma.cuentaCorrientePago.deleteMany({ where: { cuenta: { cliente_id: cliente.id } } });
    await prisma.cuentaCorriente.deleteMany({ where: { cliente_id: cliente.id } });
    await prisma.cuentaCorriente.create({
      data: { tipo: 'POR_COBRAR', contraparte: cliente.nombre, concepto: 'Fiado solo deuda E2E', monto: 10, creado_por_id: cajeroUserId, cliente_id: cliente.id },
    });
    const ctxCliente = { params: Promise.resolve({ id: String(cliente.id) }) };

    // Abono mayor al saldo → 422
    let res = await abonoPost(new NextRequest(`http://localhost/api/caja/clientes/${cliente.id}/abono`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ monto: 99, metodo_pago: 'EFECTIVO' }),
    }), ctxCliente);
    expect(res.status).toBe(422);

    // Cobro parcial de 4 → saldo restante 6, movimiento y auditoría
    res = await abonoPost(new NextRequest(`http://localhost/api/caja/clientes/${cliente.id}/abono`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ monto: 4, metodo_pago: 'EFECTIVO' }),
    }), ctxCliente);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.abonado).toBe(4);
    expect(body.saldo_restante).toBe(6);

    const mov = await prisma.movimientoCaja.findFirst({
      where: { turno_id: turnoId, categoria: 'Cobro fiado', concepto: { contains: 'Fiado solo deuda E2E' } },
    });
    expect(Number(mov?.monto)).toBe(4);

    const audit = await prisma.registroAuditoria.findFirst({
      where: { entidad: 'CuentaCorriente', entidad_id: String(cliente.id) },
      orderBy: { created_at: 'desc' },
    });
    expect(audit?.detalle).toContain('Cobro de deuda: Bs 4.00');
    expect(audit?.detalle).toContain('Cliente Solo Deuda E2E');
  });

  it('la caja vende aunque el stock del insumo esté en negativo (no bloquea por stock)', async () => {
    // Fixture idempotente: reventa con insumo en stock negativo
    const NOMBRE = 'Producto Reventa Stock Negativo E2E';
    let insumo = await prisma.insumo.findFirst({ where: { nombre: NOMBRE } });
    if (!insumo) {
      insumo = await prisma.insumo.create({
        data: { nombre: NOMBRE, unidad_medida: 'UNIDAD', stock_actual: -2, stock_minimo: 0 },
      });
    } else {
      await prisma.insumo.update({ where: { id: insumo.id }, data: { stock_actual: -2, activo: true } });
    }
    let prod = await prisma.producto.findFirst({ where: { nombre: NOMBRE } });
    if (!prod) {
      prod = await prisma.producto.create({
        data: { nombre: NOMBRE, descripcion: 'Fixture stock negativo', precio: 10, tipo: 'REVENTA', disponible: true, insumo_reventa_id: insumo.id },
      });
    }

    const res = await POST(req({
      items: [{ producto_id: prod.id, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
    }, token));
    expect(res.status).toBe(201);
    const venta = await res.json();

    // El stock siguió bajando (queda -3) y la venta dejó su MovimientoInterno
    const insumoDespues = await prisma.insumo.findUniqueOrThrow({ where: { id: insumo.id } });
    expect(insumoDespues.stock_actual).toBe(-3);
    const movVenta = await prisma.movimientoInterno.findFirst({
      where: { transaccion_id: venta.id, tipo_movimiento: 'VENTA', insumo_id: insumo.id },
    });
    expect(movVenta).not.toBeNull();
    expect(movVenta?.cantidad).toBe(-1);
  });

  it('venta simple sigue funcionando (regresión): un solo movimiento', async () => {
    const res = await POST(req({
      items: [{ producto_id: productoId, cantidad: 1 }],
      metodo_pago: 'EFECTIVO',
    }, token));
    expect(res.status).toBe(201);
    const venta = await res.json();
    const movimientos = await prisma.movimientoCaja.findMany({ where: { transaccion_id: venta.id } });
    expect(movimientos).toHaveLength(1);
    expect(movimientos[0].metodo_pago).toBe('EFECTIVO');
    expect(Number(movimientos[0].monto)).toBe(PRECIO);
  });

  describe('privilegio elegido por venta (descuento)', () => {
    let privActivoId: number;
    let privInactivoId: number;
    let clientePrivId: number;

    beforeAll(async () => {
      const admin = await prisma.usuario.findUniqueOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } });
      let activo = await prisma.privilegio.findFirst({ where: { nombre: 'Privilegio Venta E2E Activo' } });
      if (!activo) activo = await prisma.privilegio.create({ data: { nombre: 'Privilegio Venta E2E Activo', porcentaje: 10, activo: true, creado_por_id: admin.id } });
      else await prisma.privilegio.update({ where: { id: activo.id }, data: { activo: true, porcentaje: 10 } });
      privActivoId = activo.id;

      let inactivo = await prisma.privilegio.findFirst({ where: { nombre: 'Privilegio Venta E2E Inactivo' } });
      if (!inactivo) inactivo = await prisma.privilegio.create({ data: { nombre: 'Privilegio Venta E2E Inactivo', porcentaje: 50, activo: false, creado_por_id: admin.id } });
      else await prisma.privilegio.update({ where: { id: inactivo.id }, data: { activo: false } });
      privInactivoId = inactivo.id;

      const cliente = await prisma.cliente.upsert({
        where: { telefono: '79999102' },
        update: {},
        create: { nombre: 'Cliente Privilegio Venta E2E', telefono: '79999102' },
      });
      clientePrivId = cliente.id;
    });

    it('sin cliente registrado → 422', async () => {
      const res = await POST(req({
        items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'EFECTIVO',
        privilegio_id: privActivoId,
      }, token));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toContain('cliente registrado');
    });

    it('privilegio inactivo → 422', async () => {
      const res = await POST(req({
        items: [{ producto_id: productoId, cantidad: 1 }],
        metodo_pago: 'EFECTIVO',
        cliente_id: clientePrivId,
        privilegio_id: privInactivoId,
      }, token));
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toContain('activo');
    });

    it('aplica el descuento del privilegio elegido al total (server-side)', async () => {
      const res = await POST(req({
        items: [{ producto_id: productoId, cantidad: 2 }], // subtotal 40
        metodo_pago: 'EFECTIVO',
        cliente_id: clientePrivId,
        privilegio_id: privActivoId, // -10% → 36
      }, token));
      expect(res.status).toBe(201);
      const venta = await res.json();
      expect(Number(venta.total)).toBe(36);
      expect(venta.codigo_descuento).toContain('Privilegio Venta E2E Activo');
      expect(venta.codigo_descuento).toContain('-10%');

      const mov = await prisma.movimientoCaja.findFirst({ where: { transaccion_id: venta.id } });
      expect(Number(mov?.monto)).toBe(36);
    });

    it('el cliente NO recibe descuento automático por asignaciones viejas', async () => {
      // Vínculo legado en ClientePrivilegio: ya no debe aplicar nada por sí solo
      await prisma.clientePrivilegio.createMany({
        data: [{ cliente_id: clientePrivId, privilegio_id: privActivoId }],
        skipDuplicates: true,
      });

      const res = await POST(req({
        items: [{ producto_id: productoId, cantidad: 1 }], // 20
        metodo_pago: 'EFECTIVO',
        cliente_id: clientePrivId,
        // sin privilegio_id
      }, token));
      expect(res.status).toBe(201);
      const venta = await res.json();
      expect(Number(venta.total)).toBe(PRECIO); // sin descuento
      expect(venta.codigo_descuento).toBeNull();
    });
  });

  describe('numeración de pedidos por turno (#1..#n por apertura)', () => {
    const CODIGO_ONLINE = 'NUMTE';
    let turnoNuevoId: number;

    beforeAll(async () => {
      await prisma.transaccion.deleteMany({ where: { codigo: CODIGO_ONLINE } });
      // Turno fresco: la numeración debe arrancar en #1
      await prisma.cajaTurno.updateMany({
        where: { sucursal_id: sucursalId, estado: 'ABIERTO' },
        data: { estado: 'CERRADO', fecha_cierre: new Date() },
      });
      const turno = await prisma.cajaTurno.create({
        data: { sucursal_id: sucursalId, cajero_id: cajeroUserId, apertura_efectivo: 0, apertura_qr: 0 },
      });
      turnoNuevoId = turno.id;
    });

    afterAll(async () => {
      await prisma.transaccion.deleteMany({ where: { codigo: CODIGO_ONLINE } });
      await prisma.cajaTurno.updateMany({
        where: { id: turnoNuevoId, estado: 'ABIERTO' },
        data: { estado: 'CERRADO', fecha_cierre: new Date() },
      });
    });

    it('cada apertura arranca en #1 y numera consecutivo', async () => {
      const res1 = await POST(req({ items: [{ producto_id: productoId, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, token));
      expect(res1.status).toBe(201);
      const v1 = await res1.json();
      expect(v1.turno_id).toBe(turnoNuevoId);
      expect(v1.numero_turno).toBe(1);

      const res2 = await POST(req({ items: [{ producto_id: productoId, cantidad: 1 }], metodo_pago: 'EFECTIVO' }, token));
      expect(res2.status).toBe(201);
      const v2 = await res2.json();
      expect(v2.numero_turno).toBe(2);
    });

    it('un pedido online entra a la numeración cuando el cajero lo opera', async () => {
      // Pedido web ya pagado (QR), listo para recoger: no cobra nada en mostrador
      await prisma.transaccion.create({
        data: {
          codigo: CODIGO_ONLINE, canal: 'PICKUP', tipo_entrega: 'RECOJO',
          metodo_pago: 'QR', payment_status: 'PAGADO', estado: 'LISTO',
          total: 10, cliente_nombre: 'Cliente Online NumTurno E2E',
        },
      });
      const { POST: entregarPost } = await import('@/app/api/caja/entregar/route');
      const res = await entregarPost(new NextRequest('http://localhost/api/caja/entregar', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ codigo: CODIGO_ONLINE }),
      }));
      expect(res.status).toBe(200);
      const body = await res.json();
      // Se cuelga del turno abierto y toma el siguiente número (#3 tras las 2 ventas)
      expect(body.data.turno_id).toBe(turnoNuevoId);
      expect(body.data.numero_turno).toBe(3);
      expect(body.data.estado).toBe('ENTREGADO');
    });

    it('los pedidos viejos sin turno no llevan número (queda null)', async () => {
      const viejo = await prisma.transaccion.findFirst({ where: { turno_id: null } });
      if (viejo) expect(viejo.numero_turno).toBeNull();
    });
  });
});
