'use client';

import { useMemo, useState } from 'react';
import { useMovimientos } from '@/hooks/caja';
import EmptyState from '@/components/ui/EmptyState';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';
import { armarLibro, type MovimientoLibro, type PedidoSinCobro } from '@/lib/shared/libro-caja';

type Movimiento = Omit<MovimientoLibro, 'transaccion'> & {
  transaccion?: {
    id: number;
    numero_turno: number | null;
    total?: string | number;
    cliente_nombre?: string | null;
    codigo_descuento?: string | null;
    transaccionesDetalles_id?: {
      cantidad: number;
      precio_unitario: string | number;
      producto: { nombre: string };
      combo: { nombre: string } | null;
    }[];
  } | null;
};

type Filtro = 'TODOS' | 'INGRESOS' | 'EGRESOS' | 'EFECTIVO' | 'QR';

export default function MovimientosCajaPage() {
  const { data, isLoading, isError } = useMovimientos();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [abierta, setAbierta] = useState<string | null>(null);

  const entradas = useMemo(() => {
    const movimientos = (data?.movimientos ?? []) as Movimiento[];
    // Fiados y cortesías solo tienen sentido en la vista completa: no son
    // ingreso ni egreso ni tienen método de pago que filtrar.
    const sinCobro = filtro === 'TODOS' ? ((data?.pedidos_sin_cobro ?? []) as PedidoSinCobro[]) : [];

    const filtrados = movimientos.filter(m => {
      const monto = Number(m.monto);
      if (filtro === 'INGRESOS') return monto > 0;
      if (filtro === 'EGRESOS') return monto < 0;
      if (filtro === 'EFECTIVO') return m.metodo_pago === 'EFECTIVO';
      if (filtro === 'QR') return m.metodo_pago === 'QR';
      return true;
    });

    return armarLibro(filtrados, sinCobro);
  }, [data, filtro]);

  const pedidosDelTurno = (data?.pedidos_count ?? 0) as number;

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Movimientos</h1>
          <p>Libro de caja del turno activo · {pedidosDelTurno} pedido(s) en el turno.</p>
        </div>
      </div>

      <div className="admin-cat-filters" style={{ marginBottom: 18 }}>
        {(['TODOS', 'INGRESOS', 'EGRESOS', 'EFECTIVO', 'QR'] as Filtro[]).map(item => (
          <button key={item} className={`cat-filter-btn ${filtro === item ? 'active' : ''}`} onClick={() => setFiltro(item)}>
            {item === 'TODOS' ? 'Todos' : item.charAt(0) + item.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="dash-card span-12" style={{ minHeight: 160 }} />
      ) : isError ? (
        <EmptyState title="No se pudieron cargar movimientos" />
      ) : entradas.length === 0 ? (
        <EmptyState title="Sin movimientos" hint="Aún no hay ingresos, gastos o ventas en este turno." />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 28 }}></th>
                <th>Concepto</th>
                <th>Tipo</th>
                <th>Método</th>
                <th className="num">Monto</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map(entrada => {
                const hora = new Date(entrada.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
                const desplegado = abierta === entrada.key;

                if (entrada.clase === 'SIN_COBRO') {
                  const p = entrada.pedido;
                  return [
                    <tr key={entrada.key} className="muted">
                      <td aria-hidden></td>
                      <td>{entrada.concepto}</td>
                      <td>{entrada.etiqueta === 'Fiado' ? 'FIADO' : 'CORTESIA'}</td>
                      <td><span className="admin-cell-sub">Sin cobro</span></td>
                      <td className="num"><MoneyText value={p.total} /></td>
                      <td>{hora}</td>
                    </tr>,
                  ];
                }

                const m = entrada.movimiento;
                const detalles = m.transaccion?.transaccionesDetalles_id ?? [];
                return [
                  <tr key={entrada.key} onClick={() => setAbierta(desplegado ? null : entrada.key)} style={{ cursor: 'pointer' }} title="Ver el detalle">
                    <td aria-hidden>{desplegado ? '▾' : '▸'}</td>
                    <td>{entrada.concepto}</td>
                    <td>{m.tipo.replaceAll('_', ' ')}</td>
                    <td><MethodPill metodo={m.metodo_pago} /></td>
                    <td className="num"><MoneyText value={m.monto} signed /></td>
                    <td>{hora}</td>
                  </tr>,

                  desplegado && (
                    <tr key={`${entrada.key}-detalle`}>
                      <td colSpan={6} style={{ background: 'rgba(0,0,0,.02)' }}>
                        <div style={{ padding: '10px 6px', display: 'grid', gap: 6 }}>
                          {detalles.length > 0 ? (
                            <>
                              <strong>Qué se vendió</strong>
                              {detalles.map((d, i) => (
                                <div key={i}>
                                  {d.combo && '🎁 '}{d.cantidad}× {d.producto.nombre} — <MoneyText value={Number(d.precio_unitario) * d.cantidad} />
                                  {d.combo && <span className="admin-cell-sub"> (parte de {d.combo.nombre})</span>}
                                </div>
                              ))}
                              <div className="admin-cell-sub">
                                {m.transaccion?.cliente_nombre && <>Cliente: {m.transaccion.cliente_nombre} · </>}
                                {m.transaccion?.codigo_descuento && <>{m.transaccion.codigo_descuento} · </>}
                                Total de la venta: <MoneyText value={m.transaccion?.total ?? 0} />
                              </div>
                            </>
                          ) : (
                            // Ingresos y gastos manuales no tienen venta detrás.
                            <div className="admin-cell-sub">
                              Movimiento manual de caja, sin venta asociada. Concepto: {m.concepto}
                            </div>
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
      )}
    </div>
  );
}
