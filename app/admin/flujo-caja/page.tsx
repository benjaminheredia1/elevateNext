'use client';

import { useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { useFlujoCaja, type RangoState } from '@/hooks/finanzas';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import MethodPill from '@/components/ui/MethodPill';
import RangeFilter from '@/components/ui/RangeFilter';
import DataTable from '@/components/ui/DataTable';
import ChartCard from '@/components/ui/ChartCard';
import EmptyState from '@/components/ui/EmptyState';

const PAYMENT_METHODS = ['EFECTIVO', 'QR', 'TARJETA'] as const;

function renderMetodo(metodo: string) {
  return PAYMENT_METHODS.includes(metodo as any) ? <MethodPill metodo={metodo as any} /> : <span>{metodo}</span>;
}

export default function AdminFlujoCajaPage() {
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const flujo = useFlujoCaja(rango);
  const data = flujo.data;

  const metodos = useMemo(
    () => (data?.por_metodo ?? []).map((item: any) => ({ name: item.metodo ?? 'Sin metodo', value: Number(item.monto ?? 0) })),
    [data],
  );
  const entradasCategoria = useMemo(
    () => (data?.entradas_por_categoria ?? []).map((item: any) => ({ name: item.categoria ?? 'Sin categoria', value: Number(item.monto ?? 0) })),
    [data],
  );
  const salidasCategoria = useMemo(
    () => (data?.salidas_por_categoria ?? []).map((item: any) => ({ name: item.categoria ?? 'Sin categoria', value: Number(item.monto ?? 0) })),
    [data],
  );

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Flujo de Caja</h1>
          <p>Entradas, salidas y neto por metodo y categoria.</p>
        </div>
        <RangeFilter value={rango} onChange={setRango} />
      </div>

      {flujo.isLoading ? <EmptyState title="Cargando flujo de caja..." /> : flujo.isError ? <EmptyState title="No se pudo cargar flujo de caja" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Entradas" value={<MoneyText value={data?.entradas ?? 0} />} highlight accent="var(--fresh)" />
            <KpiCard label="Salidas" value={<MoneyText value={data?.salidas ?? 0} />} accent="var(--danger)" />
            <KpiCard label="Neto" value={<MoneyText value={data?.flujo_neto ?? 0} signed />} accent="var(--orange)" />
            <KpiCard label="Movimientos" value={data?.movimientos?.length ?? 0} />
          </div>

          <div className="finance-grid">
            <ChartCard title="Por metodo (neto)" data={metodos} color="#3b82f6" />
            <ChartCard title="Entradas por categoria" data={entradasCategoria} color="#10b981" />
            <ChartCard title="Salidas por categoria" data={salidasCategoria} color="#e5484d" />
          </div>

          <div className="finance-panel span-12">
            <DataTable
              data={data?.movimientos ?? []}
              emptyTitle="Sin movimientos en el periodo"
              rowKey={(row: any) => row.id}
              columns={[
                { key: 'fecha', header: 'Fecha', render: (row: any) => new Date(row.created_at).toLocaleString('es-BO') },
                { key: 'tipo', header: 'Tipo', render: (row: any) => row.tipo },
                { key: 'metodo', header: 'Metodo', render: (row: any) => renderMetodo(row.metodo_pago ?? '-') },
                { key: 'concepto', header: 'Concepto', render: (row: any) => row.concepto ?? '-' },
                { key: 'monto', header: 'Monto', className: 'num', render: (row: any) => <MoneyText value={row.monto ?? 0} /> },
              ]}
            />
          </div>
        </>
      )}
    </AdminPanel>
  );
}
