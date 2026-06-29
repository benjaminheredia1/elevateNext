'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { Frecuencia, GastoFijoPayload, useEliminarGastoFijo, useGastosFijos, useGuardarGastoFijo } from '@/hooks/gastos-fijos';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

const FRECUENCIAS: Frecuencia[] = ['MENSUAL', 'QUINCENAL', 'SEMANAL', 'ANUAL'];
const EMPTY_FORM: GastoFijoPayload = { concepto: '', categoria: '', monto: 0, frecuencia: 'MENSUAL', activo: true };

function FormModal({
  value,
  onClose,
  onSubmit,
  saving,
}: {
  value: GastoFijoPayload | null;
  onClose: () => void;
  onSubmit: (value: GastoFijoPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<GastoFijoPayload>(EMPTY_FORM);

  useEffect(() => {
    setForm(value ?? EMPTY_FORM);
  }, [value]);

  if (!value) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ ...form, monto: Number(form.monto) });
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <form onSubmit={submit} className="dash-card" style={{ width: 'min(520px, 100%)', gridColumn: 'auto' }}>
        <div className="dash-card-header">
          <h3>{form.id ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}</h3>
        </div>
        <div className="form-grid">
          <div className="form-group full">
            <label>Concepto</label>
            <input value={form.concepto} onChange={e => setForm({ ...form, concepto: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Categoría</label>
            <input value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Monto</label>
            <input type="number" min="0.01" step="0.01" value={form.monto} onChange={e => setForm({ ...form, monto: Number(e.target.value) })} required />
          </div>
          <div className="form-group">
            <label>Frecuencia</label>
            <select value={form.frecuencia} onChange={e => setForm({ ...form, frecuencia: e.target.value as Frecuencia })}>
              {FRECUENCIAS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Estado</label>
            <select value={form.activo ? 'true' : 'false'} onChange={e => setForm({ ...form, activo: e.target.value === 'true' })}>
              <option value="true">Activo</option>
              <option value="false">Inactivo</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>Guardar</button>
        </div>
      </form>
    </div>
  );
}

export default function GastosFijosPage() {
  const gastos = useGastosFijos();
  const guardar = useGuardarGastoFijo();
  const eliminar = useEliminarGastoFijo();
  const [editing, setEditing] = useState<GastoFijoPayload | null>(null);

  const items = gastos.data?.items ?? [];

  const handleSubmit = (payload: GastoFijoPayload) => {
    guardar.mutate(payload, { onSuccess: () => setEditing(null) });
  };

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Gastos Fijos</h1>
          <p>Costos recurrentes normalizados para lectura mensual y diaria.</p>
        </div>
        <button className="admin-btn primary" onClick={() => setEditing(EMPTY_FORM)}>Nuevo gasto</button>
      </div>

      {gastos.isLoading ? <EmptyState title="Cargando gastos fijos..." /> : gastos.isError ? <EmptyState title="No se pudo cargar gastos fijos" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total mensual" value={<MoneyText value={gastos.data?.resumen?.total_mensual ?? 0} />} highlight />
            <KpiCard label="Equivalente diario" value={<MoneyText value={gastos.data?.resumen?.equivalente_diario ?? 0} />} />
            <KpiCard label="Activos" value={gastos.data?.resumen?.activos ?? 0} />
          </div>

          <DataTable
            data={items}
            emptyTitle="Sin gastos fijos registrados"
            rowKey={(row: any) => row.id}
            columns={[
              { key: 'concepto', header: 'Concepto', render: (row: any) => row.concepto },
              { key: 'categoria', header: 'Categoría', render: (row: any) => row.categoria },
              { key: 'frecuencia', header: 'Frecuencia', render: (row: any) => row.frecuencia },
              { key: 'estado', header: 'Estado', render: (row: any) => <StatusBadge status={row.activo ? 'abierto' : 'cerrado'} label={row.activo ? 'Activo' : 'Inactivo'} /> },
              { key: 'monto', header: 'Monto', className: 'num', render: (row: any) => <MoneyText value={row.monto ?? 0} /> },
              { key: 'mensual', header: 'Equiv./mes', className: 'num', render: (row: any) => <MoneyText value={row.equivalente_mensual ?? 0} /> },
              {
                key: 'acciones',
                header: '',
                render: (row: any) => (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="admin-btn ghost" onClick={() => setEditing(row)}>Editar</button>
                    <button className="admin-btn ghost" onClick={() => eliminar.mutate(row.id)} disabled={!row.activo || eliminar.isPending}>Desactivar</button>
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
