'use client';

import { useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { useAdminClientes } from '@/hooks/admin-clientes';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ClientesAdminPage() {
  const [q, setQ] = useState('');
  const { data, isLoading, isError } = useAdminClientes(q);

  const items = data?.items ?? [];
  const resumen = data?.resumen;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Clientes</h1>
          <p>Historial y métricas de clientes registrados.</p>
        </div>
      </div>

      {isLoading ? (
        <EmptyState title="Cargando clientes..." />
      ) : isError ? (
        <EmptyState title="Error al cargar clientes" />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total clientes" value={resumen?.total_clientes ?? 0} />
            <KpiCard label="Ingresos totales" value={<MoneyText value={resumen?.ingresos_totales ?? 0} />} highlight />
            <KpiCard label="Gasto promedio" value={<MoneyText value={resumen?.gasto_promedio ?? 0} />} />
          </div>

          <div style={{ marginBottom: 12 }}>
            <input
              placeholder="Buscar por nombre o teléfono…"
              value={q}
              onChange={e => setQ(e.target.value)}
              style={{ width: '100%', maxWidth: 360, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: 13 }}
            />
          </div>

          <DataTable
            data={items}
            emptyTitle="Sin clientes registrados"
            rowKey={(row: any) => row.id}
            columns={[
              { key: 'nombre', header: 'Cliente', render: (row: any) => (
                <div>
                  <div style={{ fontWeight: 600 }}>{row.nombre}</div>
                  {row.telefono && <div style={{ fontSize: 12, color: '#888' }}>{row.telefono}</div>}
                </div>
              )},
              { key: 'primer_pedido', header: 'Primer pedido', render: (row: any) => fmt(row.primer_pedido) },
              { key: 'pedidos', header: 'Pedidos', className: 'num', render: (row: any) => row.pedidos },
              { key: 'total_gastado', header: 'Total gastado', className: 'num', render: (row: any) => <MoneyText value={row.total_gastado} /> },
              { key: 'gasto_promedio', header: 'Gasto prom.', className: 'num', render: (row: any) => <MoneyText value={row.gasto_promedio} /> },
            ]}
          />
        </>
      )}
    </AdminPanel>
  );
}
