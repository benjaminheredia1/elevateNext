'use client';

import { useMemo, useState } from 'react';
import { useVentasCaja, type VentaCaja } from '@/hooks/caja';
import EmptyState from '@/components/ui/EmptyState';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';

/**
 * Ventas de la caja.
 *
 * Complementa el libro de movimientos: ahí solo está la plata que entró o
 * salió, así que los fiados y las cortesías no aparecen nunca. Acá se ven
 * todas las ventas del turno, cada una con cómo se cerró y qué se llevó.
 */

type Filtro = 'TODAS' | 'PAGADAS' | 'FIADOS' | 'CORTESIAS' | 'DESCUENTO' | 'EFECTIVO' | 'QR';

const FILTROS: { id: Filtro; label: string }[] = [
  { id: 'TODAS', label: 'Todas' },
  { id: 'PAGADAS', label: 'Pagadas' },
  { id: 'FIADOS', label: 'Fiados' },
  { id: 'CORTESIAS', label: 'Cortesías' },
  { id: 'DESCUENTO', label: 'Con descuento' },
  { id: 'EFECTIVO', label: 'Efectivo' },
  { id: 'QR', label: 'QR' },
];

function cumple(v: VentaCaja, filtro: Filtro): boolean {
  switch (filtro) {
    case 'PAGADAS':   return v.forma === 'PAGADA';
    case 'FIADOS':    return v.forma === 'FIADO';
    case 'CORTESIAS': return v.forma === 'CORTESIA';
    case 'DESCUENTO': return !!v.descuento || v.items.some(i => i.descuento > 0);
    // El método solo dice algo en las que efectivamente se cobraron.
    case 'EFECTIVO':  return v.forma === 'PAGADA' && v.metodo_pago === 'EFECTIVO';
    case 'QR':        return v.forma === 'PAGADA' && v.metodo_pago === 'QR';
    default:          return true;
  }
}

function EstadoPill({ venta }: { venta: VentaCaja }) {
  if (venta.forma === 'CORTESIA') {
    return <span className="admin-badge-soft warn" title="No suma a ingresos">Cortesía</span>;
  }
  if (venta.forma === 'FIADO') {
    return <span className="admin-badge-soft info" title="Entregado, pago pendiente">Fiado</span>;
  }
  return <span className="admin-badge-soft fresh">Pagada</span>;
}

const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

/** Agrupa las líneas de un combo: se vendió como una sola cosa. */
function agrupar(items: VentaCaja['items']) {
  const combos = new Map<number, { nombre: string; total: number; partes: VentaCaja['items'] }>();
  const sueltos: VentaCaja['items'] = [];

  for (const item of items) {
    if (!item.combo) { sueltos.push(item); continue; }
    const previo = combos.get(item.combo.id) ?? { nombre: item.combo.nombre, total: 0, partes: [] };
    previo.total += item.precio_unitario * item.cantidad;
    previo.partes.push(item);
    combos.set(item.combo.id, previo);
  }
  return { combos: [...combos.values()], sueltos };
}

export default function VentasCajaPage() {
  const { data, isLoading, isError } = useVentasCaja();
  const [filtro, setFiltro] = useState<Filtro>('TODAS');
  const [abierta, setAbierta] = useState<number | null>(null);

  const ventas = useMemo(
    () => (data?.ventas ?? []).filter(v => cumple(v, filtro)),
    [data, filtro],
  );

  // Los totales son de lo filtrado: cortesías y fiados aparte, porque no son
  // plata en caja y sumarlos al cobrado daría un número que no existe.
  const resumen = useMemo(() => {
    const cobrado = ventas.filter(v => v.forma === 'PAGADA').reduce((s, v) => s + v.total, 0);
    const fiado = ventas.filter(v => v.forma === 'FIADO').reduce((s, v) => s + v.total, 0);
    const cortesia = ventas.filter(v => v.forma === 'CORTESIA').reduce((s, v) => s + v.total, 0);
    return { cobrado, fiado, cortesia };
  }, [ventas]);

  const contar = (f: Filtro) => (data?.ventas ?? []).filter(v => cumple(v, f)).length;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Ventas</h1>
          <p>
            {data?.ambito === 'DIA'
              ? 'Ventas de hoy en esta sucursal (no hay turno abierto).'
              : 'Todas las ventas del turno activo, cobradas o no.'}
          </p>
        </div>
      </div>

      <div className="admin-cat-filters" style={{ marginBottom: 18 }}>
        {FILTROS.map(f => (
          <button
            key={f.id}
            className={`cat-filter-btn ${filtro === f.id ? 'active' : ''}`}
            onClick={() => setFiltro(f.id)}
            type="button"
          >
            {f.label} ({contar(f.id)})
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="dash-card span-12" style={{ minHeight: 160 }} />
      ) : isError ? (
        <EmptyState title="No se pudieron cargar las ventas" />
      ) : ventas.length === 0 ? (
        <EmptyState
          title="Sin ventas"
          hint={filtro === 'TODAS' ? 'Todavía no se registraron ventas en este turno.' : 'Ninguna venta coincide con el filtro.'}
        />
      ) : (
        <>
          <div className="inv-summary" style={{ marginBottom: 14 }}>
            <div className="inv-stat">
              <div className="inv-stat-label">Cobrado</div>
              <div className="inv-stat-val"><MoneyText value={resumen.cobrado} /></div>
            </div>
            <div className="inv-stat">
              <div className="inv-stat-label">Fiado (por cobrar)</div>
              <div className="inv-stat-val"><MoneyText value={resumen.fiado} /></div>
            </div>
            <div className="inv-stat">
              <div className="inv-stat-label">Cortesías</div>
              <div className="inv-stat-val"><MoneyText value={resumen.cortesia} /></div>
            </div>
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{ width: 28 }}></th>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Método</th>
                  <th className="num">Total</th>
                  <th>Hora</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(venta => {
                  const desplegada = abierta === venta.id;
                  const { combos, sueltos } = agrupar(venta.items);
                  return [
                    <tr
                      key={venta.id}
                      onClick={() => setAbierta(desplegada ? null : venta.id)}
                      style={{ cursor: 'pointer' }}
                      title="Ver el detalle"
                    >
                      <td aria-hidden>{desplegada ? '▾' : '▸'}</td>
                      <td>
                        {/* Manda el correlativo de la sucursal, que es el que
                            conoce el cliente; el global queda de referencia. */}
                        <div className="admin-cell-title">
                          #{venta.numero_sucursal ?? venta.id}
                          <span className="admin-cell-sub"> (global #{venta.id})</span>
                        </div>
                        <div className="admin-cell-sub">
                          {venta.items.length} ítem(s){venta.descuento ? ` · ${venta.descuento}` : ''}
                        </div>
                      </td>
                      <td>{venta.cliente_nombre ?? 'Mostrador'}</td>
                      <td><EstadoPill venta={venta} /></td>
                      <td>{venta.forma === 'PAGADA' && venta.metodo_pago ? <MethodPill metodo={venta.metodo_pago as 'EFECTIVO' | 'QR' | 'TARJETA'} /> : '—'}</td>
                      <td className="num"><MoneyText value={venta.total} /></td>
                      <td>{hora(venta.created_at)}</td>
                    </tr>,

                    desplegada && (
                      <tr key={`${venta.id}-detalle`}>
                        <td colSpan={7} style={{ background: 'rgba(0,0,0,.02)' }}>
                          <div style={{ padding: '10px 6px', display: 'grid', gap: 12 }}>
                            <div>
                              <strong>Qué se llevó</strong>
                              <div style={{ marginTop: 6, display: 'grid', gap: 4 }}>
                                {combos.map(c => (
                                  <div key={c.nombre}>
                                    🎁 {c.nombre} — <MoneyText value={c.total} />
                                    <div className="admin-cell-sub" style={{ paddingLeft: 18 }}>
                                      {c.partes.map(p => `${p.cantidad}× ${p.nombre}`).join(' + ')}
                                    </div>
                                  </div>
                                ))}
                                {sueltos.map(i => (
                                  <div key={i.producto_id}>
                                    {i.cantidad}× {i.nombre} — <MoneyText value={i.precio_unitario * i.cantidad} />
                                    {i.descuento > 0 && (
                                      <span className="admin-cell-sub"> (desc. <MoneyText value={i.descuento} />)</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="admin-cell-sub" style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
                              {venta.cajero && <span>Cajero: {venta.cajero}</span>}
                              {venta.codigo && <span>Código: {venta.codigo}</span>}
                              {venta.canal && <span>Canal: {venta.canal}</span>}
                              {venta.cliente?.telefono && <span>Tel: {venta.cliente.telefono}</span>}
                              {venta.descuento && <span>Descuento: {venta.descuento}</span>}
                            </div>

                            {/* Un fiado sin su saldo obliga a ir a Deudores para
                                saber cuánto falta; se muestra acá directamente. */}
                            {venta.deuda && (
                              <div className="gate-warning" style={{ margin: 0 }}>
                                Fiado · saldo pendiente <MoneyText value={venta.deuda.saldo} />
                                {venta.deuda.vencimiento && ` · vence ${new Date(venta.deuda.vencimiento).toLocaleDateString('es-BO')}`}
                              </div>
                            )}
                            {venta.forma === 'CORTESIA' && (
                              <div className="admin-cell-sub">Cortesía: no entró dinero a caja ni suma a los ingresos.</div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
