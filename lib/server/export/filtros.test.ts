/**
 * Los Excel tienen que obedecer el filtro de período de la pantalla.
 *
 * Se siembran datos de HOY y de hace 60 días, y se comprueba que cada rango
 * —hoy, 7d, mes, todo y a medida— baje exactamente lo que corresponde. Es la
 * garantía de que quien elige "Hoy" y descarga no se lleva el mes entero
 * creyendo que es el día.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { login } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { sucursalPorDefectoId } from '@/lib/server/sucursales/sucursal.service';
import { hoyISO } from '@/lib/server/fechas';

import { GET as flujo } from '@/app/api/admin/flujo-caja/export/route';
import { GET as movimientos } from '@/app/api/admin/contabilidad/estado-resultados/export/route';
import { GET as ventas } from '@/app/api/admin/ventas/export/route';

const MARCA = `filtro-${Date.now()}`;
const CONCEPTO_HOY = `${MARCA}-HOY`;
const CONCEPTO_VIEJO = `${MARCA}-VIEJO`;

let token: string;
let sucursalId: number;
let cuentaId: number;
let usuarioId: number;
let ventaHoyId: number;
let ventaViejaId: number;

/** 60 días atrás: fuera de "hoy", de "7d" y también del mes en curso. */
const HACE_60_DIAS = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

function req(url: string) {
  return new NextRequest(`http://localhost${url}`, {
    headers: { authorization: `Bearer ${token}` },
  });
}

/** Textos de todas las celdas del xlsx, para buscar los conceptos sembrados. */
async function textos(res: Response): Promise<string> {
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const compartidas = zip['xl/sharedStrings.xml'] ? strFromU8(zip['xl/sharedStrings.xml']) : '';
  return compartidas + strFromU8(zip['xl/worksheets/sheet1.xml']);
}

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
  sucursalId = await sucursalPorDefectoId();
  usuarioId = (await prisma.usuario.findFirstOrThrow({ where: { email: 'benjaherediaruiz@gmail.com' } })).id;
  cuentaId = (await prisma.cuentaFinanciera.findFirstOrThrow({ where: { sucursal_id: sucursalId, tipo: 'EFECTIVO' } })).id;

  for (const [concepto, fecha] of [[CONCEPTO_HOY, new Date()], [CONCEPTO_VIEJO, HACE_60_DIAS]] as const) {
    await prisma.movimientoCaja.create({
      data: {
        sucursal_id: sucursalId, cuenta_id: cuentaId, tipo: 'INGRESO_EXTRA',
        metodo_pago: 'EFECTIVO', monto: 33, concepto, categoria: 'Prueba filtro',
        creado_por_id: usuarioId, created_at: fecha,
      },
    });
  }

  ventaHoyId = (await prisma.transaccion.create({
    data: {
      sucursal_id: sucursalId, total: 77, estado: 'PAGADO', payment_status: 'PAGADO',
      metodo_pago: 'EFECTIVO', cajero_id: usuarioId, cliente_nombre: CONCEPTO_HOY,
    },
  })).id;
  ventaViejaId = (await prisma.transaccion.create({
    data: {
      sucursal_id: sucursalId, total: 88, estado: 'PAGADO', payment_status: 'PAGADO',
      metodo_pago: 'EFECTIVO', cajero_id: usuarioId, cliente_nombre: CONCEPTO_VIEJO,
      created_at: HACE_60_DIAS,
    },
  })).id;
});

afterAll(async () => {
  await prisma.movimientoCaja.deleteMany({ where: { concepto: { startsWith: MARCA } } });
  await prisma.transaccion.deleteMany({ where: { id: { in: [ventaHoyId, ventaViejaId] } } });
});

describe('los Excel obedecen el filtro de período', () => {
  const CASOS = [
    { reporte: 'flujo', handler: flujo, ruta: '/api/admin/flujo-caja/export' },
    { reporte: 'contabilidad', handler: movimientos, ruta: '/api/admin/contabilidad/estado-resultados/export' },
  ];

  for (const { reporte, handler, ruta } of CASOS) {
    it(`${reporte}: "hoy" trae solo lo de hoy`, async () => {
      const contenido = await textos(await handler(req(`${ruta}?rango=hoy`)));
      expect(contenido).toContain(CONCEPTO_HOY);
      expect(contenido).not.toContain(CONCEPTO_VIEJO);
    });

    it(`${reporte}: "7d" deja fuera lo de hace 60 días`, async () => {
      const contenido = await textos(await handler(req(`${ruta}?rango=7d`)));
      expect(contenido).toContain(CONCEPTO_HOY);
      expect(contenido).not.toContain(CONCEPTO_VIEJO);
    });

    it(`${reporte}: "mes" deja fuera lo de hace 60 días`, async () => {
      const contenido = await textos(await handler(req(`${ruta}?rango=mes`)));
      expect(contenido).toContain(CONCEPTO_HOY);
      expect(contenido).not.toContain(CONCEPTO_VIEJO);
    });

    it(`${reporte}: "todo" trae también lo viejo`, async () => {
      const contenido = await textos(await handler(req(`${ruta}?rango=todo`)));
      expect(contenido).toContain(CONCEPTO_HOY);
      expect(contenido).toContain(CONCEPTO_VIEJO);
    });

    it(`${reporte}: rango a medida respeta desde y hasta`, async () => {
      const hoy = hoyISO();
      const soloHoy = await textos(await handler(req(`${ruta}?rango=custom&desde=${hoy}&hasta=${hoy}`)));
      expect(soloHoy).toContain(CONCEPTO_HOY);
      expect(soloHoy).not.toContain(CONCEPTO_VIEJO);

      // Una ventana que termina antes de hoy no puede traer lo de hoy.
      // La fecha se toma en horario de Bolivia (UTC-4), que es el dia de negocio
      // al que pertenece el movimiento: con la fecha UTC, un registro creado a
      // las 22:00 locales cae en el dia siguiente y la ventana no lo alcanza.
      const viejoISO = new Date(HACE_60_DIAS.getTime() - 4 * 60 * 60 * 1000)
        .toISOString().slice(0, 10);
      const soloViejo = await textos(await handler(req(`${ruta}?rango=custom&desde=${viejoISO}&hasta=${viejoISO}`)));
      expect(soloViejo).toContain(CONCEPTO_VIEJO);
      expect(soloViejo).not.toContain(CONCEPTO_HOY);
    });
  }

  it('ventas: sin rango baja el historial completo, como la pantalla', async () => {
    const contenido = await textos(await ventas(req('/api/admin/ventas/export')));
    expect(contenido).toContain(CONCEPTO_HOY);
    expect(contenido).toContain(CONCEPTO_VIEJO);
  });

  it('ventas: con rango=hoy trae solo la venta de hoy', async () => {
    const contenido = await textos(await ventas(req('/api/admin/ventas/export?rango=hoy')));
    expect(contenido).toContain(CONCEPTO_HOY);
    expect(contenido).not.toContain(CONCEPTO_VIEJO);
  });
});
