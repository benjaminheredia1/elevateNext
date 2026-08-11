/**
 * Generación de los Excel que se descargan desde el panel.
 *
 * Todos los reportes tienen la misma forma —una hoja, una fila de encabezados y
 * filas planas— así que se arman con un solo helper: si mañana hay que cambiar
 * el formato de fecha o el ancho de una columna, se cambia acá y vale para los
 * ocho reportes.
 *
 * Se usa `write-excel-file` y no `xlsx` (SheetJS): la versión de SheetJS que
 * queda en npm está congelada en 0.18.5 con una vulnerabilidad conocida, y las
 * nuevas viven en un CDN propio que complica el build en Vercel.
 */
import writeXlsxFile, { type Cell, type Column } from 'write-excel-file/node';
import { NextResponse } from 'next/server';

/** Cómo se muestra cada columna. El ancho va en caracteres, como en Excel. */
export interface ColumnaExcel<T> {
  header: string;
  /** Valor de la celda. Devolver `null` deja la celda vacía. */
  valor: (fila: T) => string | number | null;
  ancho?: number;
  /** Las columnas de dinero y cantidades se alinean a la derecha. */
  tipo?: 'texto' | 'numero';
}

/** Ancho por defecto, el mismo que traen los archivos de referencia. */
const ANCHO_POR_DEFECTO = 16;

/**
 * Fecha en formato boliviano (dd/mm/aaaa) como TEXTO, no como fecha de Excel.
 *
 * Es a propósito: una fecha real se reinterpreta según la configuración regional
 * de quien abre el archivo, y un 03/08 se lee como 8 de marzo en una máquina en
 * inglés. Al ser texto, el reporte dice lo mismo en cualquier computadora.
 */
export function fechaExcel(valor: Date | string | null | undefined): string {
  if (!valor) return '';
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  // El negocio es de Bolivia (UTC-4) y el servidor corre en UTC: sin este ajuste
  // una venta de las 20:30 aparecería con la fecha del día siguiente.
  const enBolivia = new Date(d.getTime() - 4 * 60 * 60 * 1000);
  const dia = String(enBolivia.getUTCDate()).padStart(2, '0');
  const mes = String(enBolivia.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${enBolivia.getUTCFullYear()}`;
}

/** Redondeo a centavos para que el Excel no muestre 12.750000000000002. */
export function montoExcel(valor: unknown): number {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
}

/** Arma el .xlsx de una hoja y devuelve su contenido listo para responder. */
export async function construirExcel<T>(
  nombreHoja: string,
  columnas: ColumnaExcel<T>[],
  filas: T[],
): Promise<Buffer> {
  const columns: Column<T>[] = columnas.map(col => ({
    width: col.ancho ?? ANCHO_POR_DEFECTO,
    // Encabezado en negrita: es la fila que se lee primero.
    header: { value: col.header, fontWeight: 'bold' as const },
    cell: (fila: T): Cell => {
      const v = col.valor(fila);
      if (v === null || v === undefined) return { value: undefined };
      // Las de texto van como String a propósito: si no, Excel se come el cero
      // inicial de un teléfono como 07730281 y lo muestra en notación científica.
      return col.tipo === 'numero'
        ? { value: Number(v), type: Number, align: 'right' as const }
        : { value: String(v), type: String };
    },
  }));

  // Sin datos, la librería devuelve una hoja vacía: ni siquiera los encabezados.
  // Un reporte de un período sin movimientos igual tiene que abrirse y decir de
  // qué es, así que ahí se escribe la fila de títulos a mano.
  if (filas.length === 0) {
    return writeXlsxFile(
      [columnas.map(col => ({ value: col.header, fontWeight: 'bold' as const, type: String }))],
      {
        sheet: nombreHoja,
        columns: columnas.map(col => ({ width: col.ancho ?? ANCHO_POR_DEFECTO })),
      },
    ).toBuffer();
  }

  return writeXlsxFile(filas, {
    columns,
    sheet: nombreHoja,
    // La fila de encabezados queda fija: en un reporte de 200 movimientos, sin
    // esto se pierde de vista qué columna es cuál al bajar.
    stickyRowsCount: 1,
  }).toBuffer();
}

/**
 * Nombre del archivo: `elevate-<reporte>-<aaaa-mm-dd>.xlsx`, con la fecha del
 * día de negocio para que dos descargas del mismo reporte no se pisen.
 */
export function nombreArchivo(reporte: string, fecha = new Date()): string {
  const enBolivia = new Date(fecha.getTime() - 4 * 60 * 60 * 1000);
  return `elevate-${reporte}-${enBolivia.toISOString().slice(0, 10)}.xlsx`;
}

/** Respuesta de descarga con los headers que el navegador necesita. */
export function respuestaExcel(contenido: Buffer, reporte: string): NextResponse {
  return new NextResponse(new Uint8Array(contenido), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombreArchivo(reporte)}"`,
      // Un reporte es una foto del momento: servirlo cacheado mostraría números
      // viejos sin que nadie se entere.
      'Cache-Control': 'no-store',
    },
  });
}

/** Atajo: arma la hoja y devuelve la respuesta de descarga en un solo paso. */
export async function excelResponse<T>(
  reporte: string,
  nombreHoja: string,
  columnas: ColumnaExcel<T>[],
  filas: T[],
): Promise<NextResponse> {
  return respuestaExcel(await construirExcel(nombreHoja, columnas, filas), reporte);
}
