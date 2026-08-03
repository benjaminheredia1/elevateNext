'use client';

import { useMemo, useState } from 'react';
import { useMovimientos } from '@/hooks/caja';
import EmptyState from '@/components/ui/EmptyState';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';

type Movimiento = {
  id: number;
  concepto: string;
  tipo: string;
  metodo_pago: 'EFECTIVO' | 'QR' | 'TARJETA';
  monto: string | number;
  created_at: string;
  transaccion?: {
    id: number;
    numero_turno: number | null;
    numero_sucursal?: number | null;
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

/**
 * El concepto se guarda con el id global ("Venta #2102"), que es un contador
 * compartido por todas las sucursales. Se reescribe con el correlativo del
 * local, que es el que conoce el cliente: "Venta #2 (global #2102)".
 * Movimientos sin venta asociada quedan igual.
 */
function conceptoConNumeroLocal(m: Movimiento) {
  const numero = m.transaccion?.numero_sucursal ?? m.transaccion?.numero_turno;
  if (m.transaccion == null || numero == null) return m.concepto;
  return m.concepto.replaceAll(
    `#${m.transaccion.id}`,
    `#${numero} (global #${m.transaccion.id})`,
  );
}

type Filtro = 'TODOS' | 'INGRESOS' | 'EGRESOS' | 'EFECTIVO' | 'QR';

export default function MovimientosCajaPage() {
  const { data, isLoading, isError } = useMovimientos();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');
  const [abierta, setAbierta] = useState<number | null>(null);

  const movimientos = useMemo(() => {
    const base = (data?.movimientos ?? []) as Movimiento[];
    return base.filter(m => {
      const monto = Number(m.monto);
      if (filtro === 'INGRESOS') return monto > 0;
      if (filtro === 'EGRESOS') return monto < 0;
      if (filtro === 'EFECTIVO') return m.metodo_pago === 'EFECTIVO';
      if (filtro === 'QR') return m.metodo_pago === 'QR';
      return true;
    });
  }, [data, filtro]);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Movimientos</h1>
          <p>Libro de caja del turno activo.</p>
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
      ) : movimientos.length === 0 ? (
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
              {movimientos.map(m => {
                const detalles = m.transaccion?.transaccionesDetalles_id ?? [];
                const desplegado = abierta === m.id;
                return [
                  <tr key={m.id} onClick={() => setAbierta(desplegado ? null : m.id)} style={{ cursor: 'pointer' }} title="Ver el detalle">
                    <td aria-hidden>{desplegado ? '▾' : '▸'}</td>
                    <td>{conceptoConNumeroLocal(m)}</td>
                    <td>{m.tipo.replaceAll('_', ' ')}</td>
                    <td><MethodPill metodo={m.metodo_pago} /></td>
                    <td className="num"><MoneyText value={m.monto} signed /></td>
                    <td>{new Date(m.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>,

                  desplegado && (
                    <tr key={`${m.id}-detalle`}>
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
