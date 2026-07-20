'use client';

import { useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { useBalance, useEstadoResultados, useFlujoCaja, type RangoState } from '@/hooks/finanzas';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import RangeFilter from '@/components/ui/RangeFilter';
import DataTable from '@/components/ui/DataTable';
import ChartCard from '@/components/ui/ChartCard';
import EmptyState from '@/components/ui/EmptyState';

type Tab = 'estado' | 'balance';

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminContabilidadPage() {
  const [tab, setTab] = useState<Tab>('estado');
  const [rango, setRango] = useState<RangoState>({ rango: 'mes' });
  const estado = useEstadoResultados(rango);
  const balance = useBalance(rango.sucursal);
  const flujo = useFlujoCaja(rango);

  const er = estado.data;
  const balanceData = balance.data;
  const categorias = useMemo(
    () => (er?.desglose_categoria ?? []).map((item: any) => ({ name: item.categoria ?? 'Sin categoria', value: Number(item.monto ?? 0) })),
    [er],
  );

  const handleExport = () => {
    if (!er) return;
    downloadCsv('estado-resultados.csv', [
      ['Concepto', 'Monto'],
      ['Ingresos (devengado)', er.ingresos?.total ?? 0],
      ['Por cobrar (fiados del periodo)', er.ingresos?.por_cobrar ?? 0],
      ['CMV (consumo por receta)', er.cmv ?? 0],
      ['Utilidad bruta', er.utilidad_bruta ?? 0],
      ['Gastos operativos', er.gastos_operativos ?? 0],
      ['  - Gastos de caja', er.gastos_caja ?? 0],
      ['  - Gastos fijos prorrateados', er.gastos_fijos_prorrateados ?? 0],
      ['Utilidad neta', er.utilidad_neta ?? 0],
    ]);
  };

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Contabilidad</h1>
          <p>Estado de resultados, balance y movimientos del periodo.</p>
        </div>
        <div className="admin-toolbar" style={{ marginBottom: 0 }}>
          <RangeFilter value={rango} onChange={setRango} />
          <button className="admin-btn secondary" onClick={handleExport} disabled={!er}>Exportar CSV</button>
        </div>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${tab === 'estado' ? 'active' : ''}`} onClick={() => setTab('estado')}>Estado de Resultados</button>
        <button className={`admin-tab ${tab === 'balance' ? 'active' : ''}`} onClick={() => setTab('balance')}>Balance General</button>
      </div>

      {tab === 'estado' && (
        <>
          {estado.isLoading ? <EmptyState title="Cargando contabilidad..." /> : estado.isError ? <EmptyState title="No se pudo cargar contabilidad" /> : (
            <>
              <div className="kpi-grid">
                <KpiCard label="Ingresos" value={<MoneyText value={er?.ingresos?.total ?? 0} />} highlight />
                <KpiCard label="CMV" value={<MoneyText value={er?.cmv ?? 0} />} accent="var(--amber)" />
                <KpiCard label="Gastos" value={<MoneyText value={er?.gastos_operativos ?? 0} />} accent="var(--danger)" />
                <KpiCard label="Utilidad neta" value={<MoneyText value={er?.utilidad_neta ?? 0} signed />} accent="var(--fresh)" />
              </div>

              <div className="finance-grid">
                <div className="dash-card span-6">
                  <div className="dash-card-header"><h3>Resumen</h3></div>
                  <div className="finance-list">
                    <div className="finance-row"><span>Ticket promedio</span><strong><MoneyText value={er?.ingresos?.ticket_promedio ?? 0} /></strong></div>
                    <div className="finance-row"><span>Ventas</span><strong>{er?.ingresos?.ventas_count ?? 0}</strong></div>
                    <div className="finance-row"><span>Margen bruto</span><strong>{Number(er?.margen_bruto ?? 0).toFixed(2)}%</strong></div>
                    <div className="finance-row"><span>Food cost</span><strong>{Number(er?.food_cost_pct ?? 0).toFixed(2)}%</strong></div>
                    <div className="finance-row"><span>Cobrado en caja (efectivo / QR / tarjeta)</span><strong><MoneyText value={(er?.ingresos?.efectivo ?? 0) + (er?.ingresos?.qr ?? 0) + (er?.ingresos?.tarjeta ?? 0)} /></strong></div>
                    <div className="finance-row"><span>Por cobrar (fiados del periodo)</span><strong><MoneyText value={er?.ingresos?.por_cobrar ?? 0} /></strong></div>
                    <div className="finance-row"><span>Cobros de fiados anteriores</span><strong><MoneyText value={er?.ingresos?.cobrado?.cobros_fiado ?? 0} /></strong></div>
                    <div className="finance-row"><span>Gastos fijos prorrateados</span><strong><MoneyText value={er?.gastos_fijos_prorrateados ?? 0} /></strong></div>
                  </div>
                </div>
                <ChartCard title="Movimientos netos por categoria" data={categorias} />
              </div>

              <div className="finance-panel span-12">
                <DataTable
                  data={flujo.data?.movimientos ?? []}
                  emptyTitle="Sin movimientos en el periodo"
                  rowKey={(row: any) => row.id}
                  columns={[
                    { key: 'fecha', header: 'Fecha', render: (row: any) => new Date(row.created_at).toLocaleString('es-BO') },
                    { key: 'tipo', header: 'Tipo', render: (row: any) => row.tipo },
                    { key: 'concepto', header: 'Concepto', render: (row: any) => row.concepto ?? '-' },
                    { key: 'monto', header: 'Monto', className: 'num', render: (row: any) => <MoneyText value={row.monto ?? 0} /> },
                  ]}
                />
              </div>
            </>
          )}
        </>
      )}

      {tab === 'balance' && (
        <>
          {balance.isLoading ? <EmptyState title="Cargando balance..." /> : balance.isError ? <EmptyState title="No se pudo cargar balance" /> : (
            <>
              <div className="kpi-grid">
                <KpiCard label="Caja efectivo" value={<MoneyText value={balanceData?.activos?.caja_efectivo ?? 0} />} highlight />
                <KpiCard label="Cuentas financieras" value={<MoneyText value={balanceData?.activos?.cuentas_financieras ?? 0} />} />
                <KpiCard label="Inventario" value={<MoneyText value={balanceData?.activos?.inventario ?? 0} />} />
                <KpiCard label="Patrimonio" value={<MoneyText value={balanceData?.patrimonio ?? 0} />} accent="var(--fresh)" />
              </div>
              <div className="finance-grid">
                <div className="dash-card span-6">
                  <div className="dash-card-header"><h3>Activos</h3></div>
                  <div className="finance-list">
                    <div className="finance-row"><span>Cuentas financieras</span><strong><MoneyText value={balanceData?.activos?.cuentas_financieras ?? 0} /></strong></div>
                    <div className="finance-row"><span>Inventario valorizado</span><strong><MoneyText value={balanceData?.activos?.inventario ?? 0} /></strong></div>
                    <div className="finance-row"><span>Cuentas por cobrar (fiados)</span><strong><MoneyText value={balanceData?.activos?.cuentas_por_cobrar ?? 0} /></strong></div>
                    <div className="finance-row"><span>Activos fijos</span><strong><MoneyText value={balanceData?.activos?.activos_fijos ?? 0} /></strong></div>
                  </div>
                </div>
                <div className="dash-card span-6">
                  <div className="dash-card-header"><h3>Ecuacion contable</h3></div>
                  <div className="finance-list">
                    <div className="finance-row"><span>Activos totales</span><strong><MoneyText value={balanceData?.activos?.total ?? 0} /></strong></div>
                    <div className="finance-row"><span>Pasivos</span><strong><MoneyText value={balanceData?.pasivos?.total ?? 0} /></strong></div>
                    <div className="finance-row"><span>Patrimonio</span><strong><MoneyText value={balanceData?.patrimonio ?? 0} /></strong></div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </AdminPanel>
  );
}
