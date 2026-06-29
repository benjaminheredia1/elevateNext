'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import {
  CATEGORIAS_ACTIVO,
  type ActivoFijoPayload,
  type CategoriaActivo,
  useActivosFijos,
  useEliminarActivoFijo,
  useGuardarActivoFijo,
} from '@/hooks/activos-fijos';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

const EMPTY_FORM: ActivoFijoPayload = {
  nombre: '',
  categoria: 'Otros',
  fecha_compra: new Date().toISOString().slice(0, 10),
  valor_original: 0,
  valor_actual: 0,
  depreciacion_pct: null,
  notas: '',
};

function FormModal({
  value,
  onClose,
  onSubmit,
  saving,
}: {
  value: ActivoFijoPayload | null;
  onClose: () => void;
  onSubmit: (v: ActivoFijoPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ActivoFijoPayload>(EMPTY_FORM);

  useEffect(() => {
    if (value) {
      setForm({
        ...value,
        fecha_compra: value.fecha_compra
          ? new Date(value.fecha_compra).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      });
    }
  }, [value]);

  if (!value) return null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      valor_original: Number(form.valor_original),
      valor_actual: Number(form.valor_actual),
      depreciacion_pct: form.depreciacion_pct != null && form.depreciacion_pct !== ('' as unknown as null)
        ? Number(form.depreciacion_pct)
        : null,
    });
  };

  return (
    <div className="admin-modal-overlay">
      <form onSubmit={submit} className="admin-modal wide">
        <div className="admin-modal-header">
          <h2>{form.id ? 'Editar activo fijo' : 'Nuevo activo fijo'}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
          <div className="form-group full">
            <label>Nombre</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Categoría</label>
            <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value as CategoriaActivo })}>
              {CATEGORIAS_ACTIVO.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Fecha de compra</label>
            <input type="date" value={form.fecha_compra} onChange={e => setForm({ ...form, fecha_compra: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Valor original (Bs.)</label>
            <input type="number" min="0" step="0.01" value={form.valor_original} onChange={e => setForm({ ...form, valor_original: Number(e.target.value) })} required />
          </div>
          <div className="form-group">
            <label>Valor actual (Bs.)</label>
            <input type="number" min="0" step="0.01" value={form.valor_actual} onChange={e => setForm({ ...form, valor_actual: Number(e.target.value) })} required />
          </div>
          <div className="form-group">
            <label>Depreciación (%)</label>
            <input type="number" min="0" max="100" step="0.01" value={form.depreciacion_pct ?? ''} onChange={e => setForm({ ...form, depreciacion_pct: e.target.value === '' ? null : Number(e.target.value) })} placeholder="Opcional" />
          </div>
          <div className="form-group full">
            <label>Notas</label>
            <input value={form.notas ?? ''} onChange={e => setForm({ ...form, notas: e.target.value })} placeholder="Opcional" />
          </div>
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>Guardar</button>
        </div>
      </form>
    </div>
  );
}

function fmt(date: string | Date) {
  return new Date(date).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function ActivosFijosPage() {
  const activos = useActivosFijos();
  const guardar = useGuardarActivoFijo();
  const eliminar = useEliminarActivoFijo();
  const [editing, setEditing] = useState<ActivoFijoPayload | null>(null);

  const items = activos.data?.items ?? [];
  const totales = activos.data?.totales;
  const resumen: Record<string, { valor_original: number; valor_actual: number; cantidad: number }> = activos.data?.resumen ?? {};

  const handleSubmit = (payload: ActivoFijoPayload) => {
    guardar.mutate(payload, { onSuccess: () => setEditing(null) });
  };

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Activos Fijos</h1>
          <p>Inventario de bienes del negocio con seguimiento de depreciación.</p>
        </div>
        <button className="admin-btn primary" onClick={() => setEditing(EMPTY_FORM)}>Nuevo activo</button>
      </div>

      {activos.isLoading ? (
        <EmptyState title="Cargando activos fijos..." />
      ) : activos.isError ? (
        <EmptyState title="No se pudo cargar activos fijos" />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Valor original total" value={<MoneyText value={totales?.total_original ?? 0} />} highlight />
            <KpiCard label="Valor actual total" value={<MoneyText value={totales?.total_actual ?? 0} />} />
            <KpiCard label="Activos registrados" value={totales?.activos ?? 0} />
          </div>

          {/* Resumen por categoría */}
          <div className="dash-card" style={{ marginBottom: 16 }}>
            <div className="dash-card-header"><h3>Por categoría</h3></div>
            <div className="finance-category-grid">
              {Object.entries(resumen).map(([cat, vals]) => (
                <div key={cat} className="finance-category-card">
                  <div className="finance-category-label">{cat}</div>
                  <div className="finance-category-value"><MoneyText value={vals.valor_actual} /></div>
                  <div className="finance-category-sub">{vals.cantidad} activo{vals.cantidad !== 1 ? 's' : ''}</div>
                </div>
              ))}
            </div>
          </div>

          <DataTable
            data={items}
            emptyTitle="Sin activos fijos registrados"
            rowKey={(row: any) => row.id}
            columns={[
              { key: 'nombre', header: 'Nombre', render: (row: any) => row.nombre },
              { key: 'categoria', header: 'Categoría', render: (row: any) => row.categoria },
              { key: 'fecha_compra', header: 'F. Compra', render: (row: any) => fmt(row.fecha_compra) },
              { key: 'depreciacion_pct', header: 'Depreciación', className: 'num', render: (row: any) => row.depreciacion_pct != null ? `${row.depreciacion_pct}%` : '—' },
              { key: 'valor_original', header: 'V. Original', className: 'num', render: (row: any) => <MoneyText value={row.valor_original} /> },
              { key: 'valor_actual', header: 'V. Actual', className: 'num', render: (row: any) => <MoneyText value={row.valor_actual} /> },
              { key: 'estado', header: 'Estado', render: (row: any) => <StatusBadge status={row.activo ? 'abierto' : 'cerrado'} label={row.activo ? 'Activo' : 'Inactivo'} /> },
              {
                key: 'acciones',
                header: '',
                render: (row: any) => (
                  <div className="admin-actions">
                    <button className="admin-btn ghost" onClick={() => setEditing(row)}>Editar</button>
                    <button
                      className="admin-btn ghost"
                      onClick={() => eliminar.mutate(row.id)}
                      disabled={!row.activo || eliminar.isPending}
                    >
                      Desactivar
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      <FormModal value={editing} onClose={() => setEditing(null)} onSubmit={handleSubmit} saving={guardar.isPending} />
    </AdminPanel>
  );
}
