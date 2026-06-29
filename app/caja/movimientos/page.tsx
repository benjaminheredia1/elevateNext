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
};

type Filtro = 'TODOS' | 'INGRESOS' | 'EGRESOS' | 'EFECTIVO' | 'QR';

export default function MovimientosCajaPage() {
  const { data, isLoading, isError } = useMovimientos();
  const [filtro, setFiltro] = useState<Filtro>('TODOS');

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
                <th>Concepto</th>
                <th>Tipo</th>
                <th>Método</th>
                <th className="num">Monto</th>
                <th>Hora</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map(m => (
                <tr key={m.id}>
                  <td>{m.concepto}</td>
                  <td>{m.tipo.replaceAll('_', ' ')}</td>
                  <td><MethodPill metodo={m.metodo_pago} /></td>
                  <td className="num"><MoneyText value={m.monto} signed /></td>
                  <td>{new Date(m.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
