'use client';

import { useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { useTurnos, type RangoState } from '@/hooks/finanzas';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import RangeFilter from '@/components/ui/RangeFilter';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';

function estadoDiferencia(value: number) {
  if (Math.abs(value) < 0.01) return { status: 'cuadra', label: 'Cuadra' };
  if (value < 0) return { status: 'faltante', label: 'Faltante' };
  return { status: 'sobrante', label: 'Sobrante' };
}

export default function AdminCajaPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const turnos = useTurnos(rango);
  const data = turnos.data;
  const rows = data?.turnos ?? [];
  const resumen = rows.reduce((acc: any, row: any) => {
    acc.turnos += 1;
    acc.ventas += Number(row.ventas_efectivo ?? 0) + Number(row.ventas_qr ?? 0);
    acc.esperado += Number(row.esperado_efectivo ?? 0) + Number(row.esperado_qr ?? 0);
    acc.diferencia += Number(row.diferencia_total ?? 0);
    return acc;
  }, { turnos: 0, ventas: 0, esperado: 0, diferencia: 0 });

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Caja</h1>
          <p>Turnos, ventas, efectivo esperado y diferencias de cierre.</p>
        </div>
        <RangeFilter value={rango} onChange={setRango} />
      </div>

      {turnos.isLoading ? <EmptyState title="Cargando turnos..." /> : turnos.isError ? <EmptyState title="No se pudo cargar turnos" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Turnos" value={resumen.turnos} highlight />
            <KpiCard label="Ventas" value={<MoneyText value={resumen.ventas} />} />
            <KpiCard label="Esperado" value={<MoneyText value={resumen.esperado} />} />
            <KpiCard label="Diferencia" value={<MoneyText value={resumen.diferencia} signed />} accent="var(--amber)" />
          </div>

          <DataTable
            data={rows}
            emptyTitle="Sin turnos en el periodo"
            rowKey={(row: any) => row.id}
            columns={[
              { key: 'id', header: 'Turno', render: (row: any) => `#${row.id}` },
              { key: 'estado', header: 'Estado', render: (row: any) => <StatusBadge status={String(row.estado).toLowerCase()} label={row.estado} /> },
              { key: 'sucursal', header: 'Sucursal', render: (row: any) => row.sucursal?.nombre ?? '-' },
              { key: 'cajero', header: 'Cajero', render: (row: any) => row.cajero?.nombre ?? row.cajero?.email ?? '-' },
              { key: 'apertura', header: 'Apertura', render: (row: any) => new Date(row.fecha_apertura).toLocaleString('es-BO') },
              { key: 'ventas', header: 'Ventas', className: 'num', render: (row: any) => <MoneyText value={Number(row.ventas_efectivo ?? 0) + Number(row.ventas_qr ?? 0)} /> },
              { key: 'esperado', header: 'Esperado', className: 'num', render: (row: any) => <MoneyText value={Number(row.esperado_efectivo ?? 0) + Number(row.esperado_qr ?? 0)} /> },
              { key: 'real', header: 'Real', className: 'num', render: (row: any) => <MoneyText value={Number(row.real_efectivo ?? 0) + Number(row.real_qr ?? 0)} /> },
              {
                key: 'diferencia',
                header: 'Diferencia',
                className: 'num',
                render: (row: any) => {
                  const diff = Number(row.diferencia_total ?? 0);
                  const meta = estadoDiferencia(diff);
                  return <StatusBadge status={meta.status} label={`${meta.label} Bs ${Math.abs(diff).toFixed(2)}`} />;
                },
              },
            ]}
          />
        </>
      )}
    </AdminPanel>
  );
}
