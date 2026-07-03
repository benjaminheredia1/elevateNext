'use client';

import { FormEvent, useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import MethodPill from '@/components/ui/MethodPill';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import {
  useEliminarGastoOperativo,
  useGastosOperativos,
  useRegistrarGastoOperativo,
  type GastoOperativoPayload,
  type MetodoPago,
} from '@/hooks/gastos-operativos';

const CATEGORIAS = ['Alquiler', 'Servicios', 'Sueldos', 'Marketing', 'Mantenimiento', 'Merma/Consumo', 'Otros'];
const FILTROS: { label: string; value: MetodoPago | 'TODOS' }[] = [
  { label: 'Todos', value: 'TODOS' },
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'QR', value: 'QR' },
];

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function exportCsv(rows: any[]) {
  const header = ['Concepto', 'Categoria', 'Fecha', 'Metodo', 'Monto', 'Notas'];
  const lines = rows.map(r => [
    r.concepto, r.categoria, fmtDate(r.fecha), r.metodo_pago, r.monto, r.notas ?? '',
  ].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','));
  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `gastos-operativos-${todayInput()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function RegistrarGastoModal({ onClose, onSubmit, saving }: {
  onClose: () => void;
  onSubmit: (payload: GastoOperativoPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<GastoOperativoPayload>({
    concepto: '',
    categoria: CATEGORIAS[0],
    monto: 0,
    metodo_pago: 'EFECTIVO',
    fecha: todayInput(),
    notas: '',
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.concepto.trim() || form.monto <= 0) return;
    onSubmit({ ...form, notas: form.notas?.trim() || undefined });
  };

  return (
    <div className="admin-modal-overlay">
      <form onSubmit={submit} className="admin-modal">
        <div className="admin-modal-header">
          <h2>Registrar gasto operativo</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Concepto</label>
              <input
                value={form.concepto}
                onChange={e => setForm(f => ({ ...f, concepto: e.target.value }))}
                placeholder="Ej. Alquiler local, sueldo empleado..."
                required
              />
            </div>
            <div className="form-group">
              <label>Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Monto (Bs)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto || ''}
                onChange={e => setForm(f => ({ ...f, monto: Number(e.target.value) }))}
                placeholder="0"
                required
              />
            </div>
            <div className="form-group">
              <label>Fecha</label>
              <input
                type="date"
                value={form.fecha}
                onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>Método de pago</label>
              <div className="pay-method-toggle">
                <button
                  type="button"
                  className={`pay-method-btn ${form.metodo_pago === 'EFECTIVO' ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, metodo_pago: 'EFECTIVO' }))}
                >
                  Efectivo
                </button>
                <button
                  type="button"
                  className={`pay-method-btn ${form.metodo_pago === 'QR' ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, metodo_pago: 'QR' }))}
                >
                  QR
                </button>
              </div>
            </div>
            <div className="form-group full">
              <label>Notas (opcional)</label>
              <input
                value={form.notas ?? ''}
                onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                placeholder="Descripción adicional"
              />
            </div>
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

export default function GastosOperativosPage() {
  const [filtro, setFiltro] = useState<MetodoPago | 'TODOS'>('TODOS');
  const [q, setQ] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const gastos = useGastosOperativos({ metodo_pago: filtro === 'TODOS' ? undefined : filtro, q: q || undefined });
  const registrar = useRegistrarGastoOperativo();
  const eliminar = useEliminarGastoOperativo();

  const items = gastos.data?.items ?? [];
  const resumen = gastos.data?.resumen;
  const porCategoria: Record<string, number> = resumen?.por_categoria ?? {};

  const categorias = useMemo(() => Object.entries(porCategoria).sort((a, b) => b[1] - a[1]), [porCategoria]);

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <span className="admin-badge">Finanzas</span>
          <h1>Gastos Operativos</h1>
          <p>{items.length} registro{items.length === 1 ? '' : 's'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="admin-btn ghost" onClick={() => exportCsv(items)} disabled={items.length === 0}>
            ⬇ Excel
          </button>
          <button className="admin-btn primary" onClick={() => setModalOpen(true)}>+ Registrar gasto</button>
        </div>
      </div>

      {gastos.isLoading ? (
        <EmptyState title="Cargando gastos..." />
      ) : gastos.isError ? (
        <EmptyState title="No se pudo cargar gastos operativos" />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total gastos operativos" value={<MoneyText value={resumen?.total ?? 0} />} highlight />
            <KpiCard label="Efectivo" value={<MoneyText value={resumen?.efectivo ?? 0} />} accent="var(--fresh)" />
            <KpiCard label="QR" value={<MoneyText value={resumen?.qr ?? 0} />} accent="var(--info)" />
          </div>

          {categorias.length > 0 && (
            <div className="kpi-grid">
              {categorias.map(([categoria, monto]) => (
                <KpiCard key={categoria} label={categoria} value={<MoneyText value={monto} />} />
              ))}
            </div>
          )}

          <div className="admin-toolbar">
            <input
              className="admin-search-field"
              placeholder="Buscar gasto..."
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="finance-filter-row">
            {FILTROS.map(f => (
              <button
                key={f.value}
                className={`finance-chip ${filtro === f.value ? 'active' : ''}`}
                onClick={() => setFiltro(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <DataTable
            data={items}
            emptyTitle="Sin gastos operativos registrados"
            rowKey={(row: any) => row.id}
            columns={[
              {
                key: 'concepto',
                header: 'Concepto',
                render: (row: any) => (
                  <div>
                    <div className="admin-cell-title">{row.concepto}</div>
                    {row.notas && <div className="admin-cell-sub">{row.notas}</div>}
                  </div>
                ),
              },
              { key: 'categoria', header: 'Categoría', render: (row: any) => <span className="finance-chip active" style={{ cursor: 'default' }}>{row.categoria}</span> },
              { key: 'fecha', header: 'Fecha', render: (row: any) => fmtDate(row.fecha) },
              { key: 'metodo', header: 'Método', render: (row: any) => <MethodPill metodo={row.metodo_pago} /> },
              { key: 'monto', header: 'Monto', className: 'num', render: (row: any) => <MoneyText value={-Math.abs(row.monto)} signed /> },
              {
                key: 'acciones',
                header: '',
                render: (row: any) => (
                  <button
                    type="button"
                    className="admin-row-delete"
                    title="Eliminar gasto"
                    disabled={eliminar.isPending}
                    onClick={() => {
                      if (confirm(`¿Eliminar el gasto "${row.concepto}"?`)) eliminar.mutate(row.id);
                    }}
                  >
                    &times;
                  </button>
                ),
              },
            ]}
          />
        </>
      )}

      {modalOpen && (
        <RegistrarGastoModal
          onClose={() => setModalOpen(false)}
          saving={registrar.isPending}
          onSubmit={payload => registrar.mutate(payload, { onSuccess: () => setModalOpen(false) })}
        />
      )}
    </AdminPanel>
  );
}
