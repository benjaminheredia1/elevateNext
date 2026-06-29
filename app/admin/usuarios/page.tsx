'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import {
  type RolUsuario,
  type UsuarioPayload,
  useAdminUsuarios,
  useDesactivarUsuario,
  useGuardarUsuario,
} from '@/hooks/admin-usuarios';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

const ROLES: RolUsuario[] = ['DUENO', 'ADMIN', 'CAJERO', 'CLIENTE'];

const ROL_CLASS: Record<RolUsuario, string> = {
  DUENO: 'orange',
  ADMIN: 'warn',
  CAJERO: 'info',
  CLIENTE: 'fresh',
};

function RolBadge({ rol }: { rol: RolUsuario }) {
  return (
    <span className={`admin-badge-soft ${ROL_CLASS[rol]}`}>
      {rol}
    </span>
  );
}

const EMPTY_FORM: UsuarioPayload = {
  nombre: '', apellido_paterno: '', apellido_materno: '',
  email: '', username: '', password: '', rol: 'CAJERO',
  activo: true, sucursal_id: null,
};

function useSucursales() {
  return useQuery({
    queryKey: ['sucursales'],
    queryFn: async () => (await apiClient.get('/api/admin/sucursales')).data,
    retry: false,
  });
}

function FormModal({
  value,
  myRol,
  onClose,
  onSubmit,
  saving,
}: {
  value: UsuarioPayload | null;
  myRol: RolUsuario;
  onClose: () => void;
  onSubmit: (v: UsuarioPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<UsuarioPayload>(EMPTY_FORM);
  const sucursales = useSucursales();

  useEffect(() => { if (value) setForm({ ...value, password: '' }); }, [value]);

  if (!value) return null;

  const rolesPermitidos = myRol === 'DUENO' ? ROLES : ['CAJERO'] as RolUsuario[];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const payload = { ...form };
    if (!payload.password) delete payload.password;
    onSubmit(payload);
  };

  return (
    <div className="admin-modal-overlay">
      <form onSubmit={submit} className="admin-modal wide">
        <div className="admin-modal-header">
          <h2>{form.id ? 'Editar usuario' : 'Nuevo usuario'}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
          <div className="form-group">
            <label>Nombre</label>
            <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Apellido paterno</label>
            <input value={form.apellido_paterno} onChange={e => setForm({ ...form, apellido_paterno: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Apellido materno</label>
            <input value={form.apellido_materno} onChange={e => setForm({ ...form, apellido_materno: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Email</label>
            <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
          </div>
          <div className="form-group">
            <label>Username</label>
            <input value={form.username ?? ''} onChange={e => setForm({ ...form, username: e.target.value || null })} />
          </div>
          <div className="form-group">
            <label>{form.id ? 'Nueva contraseña (opcional)' : 'Contraseña'}</label>
            <input type="password" value={form.password ?? ''} onChange={e => setForm({ ...form, password: e.target.value })} required={!form.id} />
          </div>
          <div className="form-group">
            <label>Rol</label>
            <select value={form.rol} onChange={e => setForm({ ...form, rol: e.target.value as RolUsuario })}>
              {rolesPermitidos.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          {form.rol === 'CAJERO' && (
            <div className="form-group">
              <label>Sucursal</label>
              <select value={form.sucursal_id ?? ''} onChange={e => setForm({ ...form, sucursal_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Sin asignar</option>
                {(sucursales.data?.items ?? sucursales.data ?? []).map((s: { id: number; nombre: string }) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>
          )}
          {form.id && (
            <div className="form-group">
              <label>Estado</label>
              <select value={form.activo ? 'true' : 'false'} onChange={e => setForm({ ...form, activo: e.target.value === 'true' })}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>
          )}
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

export default function UsuariosPage() {
  const usuarios = useAdminUsuarios();
  const guardar = useGuardarUsuario();
  const desactivar = useDesactivarUsuario();
  const [editing, setEditing] = useState<UsuarioPayload | null>(null);

  const items: any[] = usuarios.data?.items ?? [];

  const byRol = (r: RolUsuario) => items.filter(u => u.rol === r).length;

  const [myRol, setMyRol] = useState<RolUsuario>('CAJERO');
  useEffect(() => {
    const stored = localStorage.getItem('rol') as RolUsuario | null;
    if (stored) setMyRol(stored);
  }, []);

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Usuarios</h1>
          <p>Gestión de accesos y roles del sistema.</p>
        </div>
        <button className="admin-btn primary" onClick={() => setEditing(EMPTY_FORM)}>Nuevo usuario</button>
      </div>

      {usuarios.isLoading ? (
        <EmptyState title="Cargando usuarios..." />
      ) : usuarios.isError ? (
        <EmptyState title="Error al cargar usuarios" />
      ) : (
        <>
          <div className="kpi-grid">
            {ROLES.map(r => (
              <KpiCard key={r} label={r} value={byRol(r)} />
            ))}
          </div>

          <DataTable
            data={items}
            emptyTitle="Sin usuarios registrados"
            rowKey={(row: any) => row.id}
            columns={[
              { key: 'usuario', header: 'Usuario', render: (row: any) => (
                <div>
                  <div className="admin-cell-title">{row.nombre} {row.apellido_paterno}</div>
                  <div className="admin-cell-sub">{row.email}</div>
                </div>
              )},
              { key: 'rol', header: 'Rol', render: (row: any) => <RolBadge rol={row.rol} /> },
              { key: 'sucursal', header: 'Sucursal', render: (row: any) => row.sucursal?.nombre ?? '—' },
              { key: 'estado', header: 'Estado', render: (row: any) => <StatusBadge status={row.activo ? 'abierto' : 'cerrado'} label={row.activo ? 'Activo' : 'Inactivo'} /> },
              {
                key: 'acciones',
                header: '',
                render: (row: any) => (
                  <div className="admin-actions">
                    <button className="admin-btn ghost" onClick={() => setEditing(row)}>Editar</button>
                    <button
                      className="admin-btn ghost"
                      disabled={!row.activo || desactivar.isPending}
                      onClick={() => desactivar.mutate(row.id)}
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

      <FormModal
        value={editing}
        myRol={myRol}
        onClose={() => setEditing(null)}
        onSubmit={payload => guardar.mutate(payload, { onSuccess: () => setEditing(null) })}
        saving={guardar.isPending}
      />
    </AdminPanel>
  );
}
