'use client';

import { FormEvent, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  useEliminarPrivilegio,
  useGuardarPrivilegio,
  usePrivilegios,
  type Privilegio,
  type PrivilegioPayload,
} from '@/hooks/privilegios';

function PrivilegioModal({ inicial, onClose, onSubmit, saving }: {
  inicial: Privilegio | null;
  onClose: () => void;
  onSubmit: (payload: PrivilegioPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<PrivilegioPayload>({
    id: inicial?.id,
    nombre: inicial?.nombre ?? '',
    descripcion: inicial?.descripcion ?? '',
    porcentaje: inicial?.porcentaje ?? 10,
    activo: inicial?.activo ?? true,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.nombre.trim() || form.porcentaje < 0 || form.porcentaje > 100) return;
    onSubmit({ ...form, descripcion: form.descripcion?.trim() || undefined });
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>{inicial ? 'Editar privilegio' : 'Nuevo privilegio'}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Nombre</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Ej. Snack Fitbull" required />
            </div>
            <div className="form-group">
              <label>Descuento (%)</label>
              <input type="number" min="0" max="100" step="0.5" value={form.porcentaje} onChange={e => setForm(f => ({ ...f, porcentaje: Number(e.target.value) }))} required />
            </div>
            <div className="form-group">
              <label>Estado</label>
              <select value={form.activo ? '1' : '0'} onChange={e => setForm(f => ({ ...f, activo: e.target.value === '1' }))}>
                <option value="1">Activo</option>
                <option value="0">Inactivo</option>
              </select>
            </div>
            <div className="form-group full">
              <label>Descripción (opcional)</label>
              <input value={form.descripcion ?? ''} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} placeholder="Ej. 10% en todos los productos" />
            </div>
          </div>
          <span className="form-hint">El descuento se aplica al total de la venta (y del fiado) del cliente que tenga este privilegio.</span>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

export default function PrivilegiosPage() {
  const privilegios = usePrivilegios(true);
  const guardar = useGuardarPrivilegio();
  const eliminar = useEliminarPrivilegio();
  const [modal, setModal] = useState<{ open: boolean; inicial: Privilegio | null }>({ open: false, inicial: null });

  const items = privilegios.data ?? [];

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <span className="admin-badge">Gestión</span>
          <h1>Privilegios</h1>
          <p>Descuentos que puedes asignar a clientes desde su ficha en Clientes.</p>
        </div>
        <button className="admin-btn primary" onClick={() => setModal({ open: true, inicial: null })}>+ Nuevo privilegio</button>
      </div>

      {privilegios.isLoading ? (
        <EmptyState title="Cargando privilegios..." />
      ) : privilegios.isError ? (
        <EmptyState title="No se pudo cargar privilegios" />
      ) : (
        <DataTable
          data={items}
          emptyTitle="Sin privilegios creados"
          rowKey={(row: Privilegio) => row.id}
          columns={[
            { key: 'nombre', header: 'Privilegio', render: (row: Privilegio) => (
              <div>
                <div className="admin-cell-title">{row.nombre}</div>
                {row.descripcion && <div className="admin-cell-sub">{row.descripcion}</div>}
              </div>
            )},
            { key: 'porcentaje', header: 'Descuento', className: 'num', render: (row: Privilegio) => <strong>{row.porcentaje}%</strong> },
            { key: 'clientes', header: 'Clientes', className: 'num', render: (row: Privilegio) => row.clientes_count ?? 0 },
            { key: 'estado', header: 'Estado', render: (row: Privilegio) => <StatusBadge status={row.activo ? 'abierto' : 'cerrado'} label={row.activo ? 'Activo' : 'Inactivo'} /> },
            { key: 'acciones', header: '', render: (row: Privilegio) => (
              <div className="admin-actions">
                <button className="admin-btn ghost" onClick={() => setModal({ open: true, inicial: row })}>Editar</button>
                {row.activo && (
                  <button className="admin-btn ghost" style={{ color: 'var(--danger)' }} disabled={eliminar.isPending} onClick={() => { if (confirm(`¿Desactivar "${row.nombre}"?`)) eliminar.mutate(row.id); }}>
                    Desactivar
                  </button>
                )}
              </div>
            )},
          ]}
        />
      )}

      {modal.open && (
        <PrivilegioModal
          inicial={modal.inicial}
          onClose={() => setModal({ open: false, inicial: null })}
          saving={guardar.isPending}
          onSubmit={payload => guardar.mutate(payload, { onSuccess: () => setModal({ open: false, inicial: null }) })}
        />
      )}
    </AdminPanel>
  );
}
