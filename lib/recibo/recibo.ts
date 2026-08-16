/**
 * Generador del recibo impreso.
 *
 * Adaptado del ticket de Lucy Commerce (Courier monoespaciada, separadores
 * punteados, columna de importes a la derecha) al negocio de Elevate: las tres
 * numeraciones del proyecto, el sello de fiado y cortesía, el desglose del pago
 * mixto y el encabezado del local.
 *
 * NO ES UNA FACTURA. No lleva CUF ni NIT: es el comprobante interno del local,
 * y el pie lo dice explícitamente para que nadie lo confunda con crédito fiscal.
 *
 * La función es PURA: mismos datos → mismo string. Toda la parte sucia (hablarle
 * a la impresora) vive en `imprimir.ts`, para poder testear esta en Node.
 */

import type { DatosRecibo, LineaRecibo } from './tipos';

/**
 * Papel de la térmica del mostrador (KP-IM609): rollo de 80 mm con una banda
 * imprimible de 72 mm. El ancho se declara en milímetros y no en píxeles porque
 * el que manda es el papel: en px el driver escala y el ticket sale diminuto.
 */
export const ANCHO_PAPEL_MM = 72;

/** Escapa HTML. Única defensa contra un nombre de producto con `<`. */
const esc = (valor: unknown): string =>
  String(valor ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  );

/** "1.234,50" — la columna ya dice "Bs" en el total, no lo repite por línea. */
export function monto(valor: number): string {
  return new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(valor) || 0);
}

/**
 * dd/mm/aaaa hh:mm en hora de Bolivia.
 *
 * La zona va explícita: producción corre en UTC y un ticket impreso a las 19:42
 * que dice 23:42 no sirve para reclamar nada ni para cuadrar el turno.
 */
export function fechaHora(valor: string | Date): string {
  return new Date(valor).toLocaleString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit', month: '2-digit', year: 'numeric',
    // 24 h: es-BO formatea "07:42 p. m." por defecto y en un ticket la hora se
    // lee de reojo, sin espacio para el a. m. / p. m.
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

function soloFecha(valor: string | Date): string {
  return new Date(valor).toLocaleDateString('es-BO', {
    timeZone: 'America/La_Paz',
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

const ETIQUETA_METODO: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  QR: 'QR',
  TARJETA: 'Tarjeta',
  BANCO: 'Transferencia',
  MIXTO: 'Efectivo + QR',
};

export function etiquetaMetodo(metodo: string): string {
  return ETIQUETA_METODO[metodo] ?? metodo;
}

function filaItem(linea: LineaRecibo): string {
  // El nombre se recorta con elipsis en vez de envolver: en 72 mm, un nombre
  // largo que salta de línea empuja el importe y descuadra la columna.
  const detalle = linea.detalle ? `<div class="det">${esc(linea.detalle)}</div>` : '';
  return '<tr>'
    + `<td class="cant">${esc(linea.cantidad)}&times;</td>`
    + `<td class="desc"><div class="nom">${esc(linea.nombre)}</div>${detalle}</td>`
    + `<td class="imp">${monto(linea.importe)}</td>`
    + '</tr>';
}

function bloqueTotales(datos: DatosRecibo): string {
  const filas = [
    `<div class="fila"><span>Subtotal</span><span>${monto(datos.subtotal)}</span></div>`,
  ];
  if (datos.descuento && datos.descuento.monto > 0) {
    filas.push(
      `<div class="fila"><span>${esc(datos.descuento.etiqueta)}</span><span>-${monto(datos.descuento.monto)}</span></div>`,
    );
  }
  // El envío hoy es siempre 0 (es plata del repartidor, no de la venta): sin
  // este guardia el ticket cargaría una línea que nunca dice nada.
  if (datos.envio && datos.envio > 0) {
    filas.push(`<div class="fila"><span>Env&iacute;o</span><span>${monto(datos.envio)}</span></div>`);
  }
  filas.push(`<div class="fila total"><span>TOTAL</span><span>Bs ${monto(datos.total)}</span></div>`);
  return `<div class="totales">${filas.join('')}</div>`;
}

/**
 * Bloque de pago o sello. Son excluyentes a propósito: en un fiado o una
 * cortesía no entró dinero a caja, así que imprimir un método de pago sería
 * decir que se cobró algo que no se cobró.
 */
function bloquePago(datos: DatosRecibo): string {
  if (datos.marca) {
    const detalle: string[] = [];
    if (datos.marca.tipo === 'FIADO') {
      if (datos.marca.saldo != null) detalle.push(`Saldo: Bs ${monto(datos.marca.saldo)}`);
      if (datos.marca.vencimiento) detalle.push(`Vence: ${soloFecha(datos.marca.vencimiento)}`);
    } else if (datos.marca.tipo === 'COD') {
      detalle.push(`Cobrar al entregar: Bs ${monto(datos.marca.saldo ?? datos.total)}`);
    } else {
      detalle.push('No corresponde cobro');
    }
    const titulo = datos.marca.tipo === 'FIADO'
      ? 'FIADO &mdash; PENDIENTE DE PAGO'
      : datos.marca.tipo === 'COD'
        ? 'PAGO CONTRA ENTREGA'
        : 'CORTES&Iacute;A &mdash; SIN CARGO';
    // Recuadro punteado y no un fondo relleno: la térmica solo quema negro, un
    // bloque sólido sale manchado y castiga el cabezal.
    return `<div class="sello"><div class="sello-tit">${titulo}</div>`
      + detalle.map(d => `<div>${esc(d)}</div>`).join('')
      + '</div>';
  }

  if (!datos.pago) return '';
  const partes = (datos.pago.partes ?? [])
    .map(p => `<div class="fila sub"><span>${esc(etiquetaMetodo(p.metodo))}</span><span>${monto(p.monto)}</span></div>`)
    .join('');
  return '<div class="pago">'
    + `<div class="fila"><span>Pago</span><span>${esc(etiquetaMetodo(datos.pago.metodo))}</span></div>`
    + partes
    + '</div>';
}

/**
 * Arma el HTML del recibo listo para mandar a la impresora.
 *
 * El layout es el de una térmica de 80 mm con 72 mm imprimibles:
 *   - `@page { size: 72mm auto; margin: 0 }` → manda el papel, no la hoja A4
 *   - Courier New                            → alinea la columna de importes
 *   - `hr` punteado                          → el separador clásico del ticket
 *   - 10 mm en blanco al final               → el cortador queda por encima del
 *     cabezal; sin ese margen el corte se come la última línea
 */
export function construirReciboHtml(datos: DatosRecibo): string {
  const local = datos.local;
  const encabezado = [
    local.nombre ? `<div class="local">${esc(local.nombre.toUpperCase())}</div>` : '',
    local.direccion ? `<div class="local-sub">${esc(local.direccion)}</div>` : '',
    local.telefono ? `<div class="local-sub">${esc(local.telefono)}</div>` : '',
  ].join('');

  const meta = [
    datos.cajero ? `<div>Atendi&oacute;: ${esc(datos.cajero)}</div>` : '',
    datos.turno
      ? `<div>Turno #${esc(datos.turno.id)}${datos.turno.venta != null ? ` &middot; Venta #${esc(datos.turno.venta)} del turno` : ''}</div>`
      : '',
    datos.cliente ? `<div>Cliente: ${esc(datos.cliente)}</div>` : '',
  ].join('');

  return '<!doctype html><html lang="es"><head><meta charset="utf-8">'
    + `<title>Recibo ${esc(datos.numero)}</title><style>
  @page { size: ${ANCHO_PAPEL_MM}mm auto; margin: 0; }
  * { font-family: 'Courier New', Courier, monospace; box-sizing: border-box; }
  body {
    width: ${ANCHO_PAPEL_MM}mm;
    margin: 0;
    padding: 3mm 2mm 10mm;
    color: #000;
    background: #fff;
    font-size: 3.2mm;
    line-height: 1.35;
  }
  .local { font-size: 4mm; font-weight: bold; text-align: center; }
  .local-sub { font-size: 2.8mm; text-align: center; }
  .num { font-size: 5.5mm; font-weight: bold; text-align: center; margin-top: 1mm; }
  .fecha { font-size: 3mm; text-align: center; margin-bottom: 1.5mm; }
  .meta { font-size: 3mm; }
  hr { border: none; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  td { vertical-align: top; padding: 0.4mm 0; }
  .cant { width: 9mm; font-weight: bold; }
  .imp { width: 18mm; text-align: right; white-space: nowrap; }
  .nom { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .det { font-size: 2.7mm; padding-left: 2mm; }
  .totales .fila, .pago .fila { display: flex; justify-content: space-between; gap: 2mm; }
  .totales .total { font-size: 4mm; font-weight: bold; margin-top: 1mm; }
  .pago .sub { padding-left: 3mm; font-size: 3mm; }
  .sello { border: 1px dashed #000; padding: 1.5mm; text-align: center; font-size: 3mm; }
  .sello-tit { font-weight: bold; font-size: 3.4mm; }
  .pie { text-align: center; font-size: 2.7mm; margin-top: 2mm; }
  .ref { text-align: right; font-size: 2.5mm; margin-top: 1mm; }
</style></head><body>
  ${encabezado}
  <div class="num">VENTA #${esc(datos.numero)}</div>
  <div class="fecha">${esc(fechaHora(datos.fecha))}</div>
  ${meta ? `<div class="meta">${meta}</div>` : ''}
  <hr/>
  <table>${datos.lineas.map(filaItem).join('')}</table>
  <hr/>
  ${bloqueTotales(datos)}
  <hr/>
  ${bloquePago(datos)}
  <div class="pie">Este documento no es una factura.<br/>Recibo interno del local.</div>
  <div class="pie">&iexcl;Gracias por su compra!</div>
  <div class="ref">Ref. ${esc(datos.referencia)}</div>
</body></html>`;
}
