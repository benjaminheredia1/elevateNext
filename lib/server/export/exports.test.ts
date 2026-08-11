/**
 * Integración de los ocho reportes en Excel.
 *
 * Se comprueba que cada endpoint responda un .xlsx de verdad (no un JSON de
 * error con status 200), con su hoja y sus encabezados exactos: son los que la
 * operación ya conoce de los archivos que venía usando, y si cambian, las
 * planillas que armaron encima dejan de funcionar.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { login } from '@/lib/auth';

import { GET as activos } from '@/app/api/admin/activos-fijos/export/route';
import { GET as inventario } from '@/app/api/admin/inventario/sucursal/export/route';
import { GET as clientes } from '@/app/api/admin/clientes/export/route';
import { GET as balance } from '@/app/api/admin/contabilidad/balance/export/route';
import { GET as movimientos } from '@/app/api/admin/contabilidad/estado-resultados/export/route';
import { GET as flujo } from '@/app/api/admin/flujo-caja/export/route';
import { GET as productos } from '@/app/api/admin/productos/export/route';
import { GET as ventas } from '@/app/api/admin/ventas/export/route';

let token: string;

function req(url: string, tk?: string) {
  return new NextRequest(`http://localhost${url}`, {
    headers: tk ? { authorization: `Bearer ${tk}` } : {},
  });
}

/** Lee la hoja del xlsx y devuelve el nombre y los textos, sin librerías extra. */
async function leerXlsx(res: Response) {
  const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const workbook = strFromU8(zip['xl/workbook.xml']);
  // El orden de los atributos de <sheet> no está garantizado, así que se busca
  // `name=` dentro de la etiqueta en vez de asumir que va primero.
  const etiqueta = /<sheet\s[^>]*>/.exec(workbook)?.[0] ?? '';
  const nombreHoja = /name="([^"]+)"/.exec(etiqueta)?.[1] ?? '';
  const compartidas = zip['xl/sharedStrings.xml'] ? strFromU8(zip['xl/sharedStrings.xml']) : '';
  const hoja = strFromU8(zip['xl/worksheets/sheet1.xml']);
  const textos = [
    ...[...compartidas.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]),
    ...[...hoja.matchAll(/<t[^>]*>([^<]*)<\/t>/g)].map(m => m[1]),
    ...[...hoja.matchAll(/<v>([^<]*)<\/v>/g)].map(m => m[1]),
  ];
  return { nombreHoja, textos };
}

beforeAll(async () => {
  token = (await login('benjaherediaruiz@gmail.com', 'benja122')).access_token;
});

const REPORTES = [
  { nombre: 'activos', handler: activos, url: '/api/admin/activos-fijos/export', hoja: 'Activos Fijos', encabezados: ['Activo', 'Categoría', 'Valor Bs', 'Pago', 'Fecha compra', 'Notas'] },
  { nombre: 'inventario', handler: inventario, url: '/api/admin/inventario/sucursal/export', hoja: 'Inventario', encabezados: ['Insumo', 'Unidad', 'Stock actual', 'Stock mínimo', 'Costo unitario Bs', 'Valor total Bs', 'Estado'] },
  { nombre: 'clientes', handler: clientes, url: '/api/admin/clientes/export', hoja: 'Clientes', encabezados: ['Cliente', 'Teléfono', 'Desde', 'N° Pedidos', 'Total gastado Bs', 'Promedio Bs', 'Último pedido'] },
  { nombre: 'balance', handler: balance, url: '/api/admin/contabilidad/balance/export', hoja: 'Balance General', encabezados: ['Sección', 'Subsección', 'Concepto', 'Monto_Bs'] },
  { nombre: 'contabilidad', handler: movimientos, url: '/api/admin/contabilidad/estado-resultados/export?rango=mes', hoja: 'Movimientos', encabezados: ['Fecha', 'Tipo', 'Concepto', 'Detalle', 'Monto_Bs', 'Metodo'] },
  { nombre: 'flujo', handler: flujo, url: '/api/admin/flujo-caja/export?rango=mes', hoja: 'Flujo de Caja', encabezados: ['Fecha', 'Concepto', 'Categoría', 'Efectivo_Bs', 'QR_Bs', 'Total_Bs', 'Tipo'] },
  { nombre: 'productos', handler: productos, url: '/api/admin/productos/export', hoja: 'Productos', encabezados: ['Producto', 'Categoría', 'Tipo', 'Precio Bs', 'Disponible', 'Publicación', 'Sucursal'] },
  { nombre: 'ventas', handler: ventas, url: '/api/admin/ventas/export?rango=mes', hoja: 'Ventas', encabezados: ['Fecha', 'N°', 'Canal', 'Método', 'Cliente', 'Detalle', 'Total Bs', 'Estado', 'Pago', 'Sucursal'] },
];

describe('descarga de reportes en Excel', () => {
  for (const reporte of REPORTES) {
    it(`${reporte.nombre}: devuelve un xlsx con la hoja "${reporte.hoja}" y sus encabezados`, async () => {
      const res = await reporte.handler(req(reporte.url, token));
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('spreadsheetml.sheet');

      // El nombre del archivo es el que ve el usuario al guardarlo.
      const disposicion = res.headers.get('content-disposition') ?? '';
      expect(disposicion).toContain('attachment');
      expect(disposicion).toMatch(new RegExp(`elevate-[a-z-]*${reporte.nombre.slice(0, 6)}[a-z-]*-\\d{4}-\\d{2}-\\d{2}\\.xlsx`));

      const { nombreHoja, textos } = await leerXlsx(res);
      expect(nombreHoja).toBe(reporte.hoja);
      for (const encabezado of reporte.encabezados) {
        expect(textos).toContain(encabezado);
      }
    });

    it(`${reporte.nombre}: sin sesión devuelve 401 y no filtra datos`, async () => {
      const res = await reporte.handler(req(reporte.url));
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).not.toContain('spreadsheetml');
    });
  }
});
