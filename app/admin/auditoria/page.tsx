'use client';

import { useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import { type RolFiltro, useAuditoria } from '@/hooks/admin-auditoria';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import MoneyText from '@/components/ui/MoneyText';

const ROL_OPTS: { label: string; value: RolFiltro }[] = [
  { label: 'Todos', value: '' },
  { label: 'Dueño', value: 'DUENO' },
  { label: 'Admin', value: 'ADMIN' },
  { label: 'Cajero', value: 'CAJERO' },
  { label: 'Cliente', value: 'CLIENTE' },
];

const ACCION_CLASS: Record<string, string> = {
  CREO: 'fresh',
  MODIFICO: 'info',
  ELIMINO: 'danger',
  LOGIN: 'orange',
  LOGOUT: '',
  APERTURA_CAJA: 'warn',
  CIERRE_CAJA: 'warn',
};

function fmt(d: string | Date) {
  return new Date(d).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AuditoriaPage() {
  const [q, setQ] = useState('');
  const [rol, setRol] = useState<RolFiltro>('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useAuditoria(q, rol, page);
  const items = data?.items ?? [];

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Auditoría</h1>
          <p>Registro inmutable de acciones del sistema. Solo lectura.</p>
        </div>
      </div>

      <div className="admin-toolbar">
        <input
          placeholder="Buscar detalle, entidad o usuario…"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          className="admin-search-field"
        />
        <div className="finance-filter-row" style={{ marginBottom: 0 }}>
          {ROL_OPTS.map(o => (
            <button
              key={o.value}
              className={`finance-chip ${rol === o.value ? 'active' : ''}`}
              onClick={() => { setRol(o.value); setPage(1); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <EmptyState title="Cargando auditoría..." />
      ) : isError ? (
        <EmptyState title="Error al cargar registros" />
      ) : (
        <>
          <DataTable
            data={items}
            emptyTitle="Sin registros de auditoría"
            rowKey={(row: any) => row.id}
            columns={[
              { key: 'fecha', header: 'Fecha', render: (row: any) => <span className="admin-cell-muted">{fmt(row.created_at)}</span> },
              { key: 'usuario', header: 'Usuario', render: (row: any) => (
                <div>
                  <div className="admin-cell-title">{row.usuario_nombre}</div>
                  <div className="admin-cell-sub">{row.rol}</div>
                </div>
              )},
              { key: 'accion', header: 'Acción', render: (row: any) => (
                <span className={`admin-badge-soft ${ACCION_CLASS[row.accion] ?? ''}`}>{row.accion}</span>
              )},
              { key: 'entidad', header: 'Entidad', render: (row: any) => (
                <span className="admin-cell-muted">{row.entidad}{row.entidad_id ? ` #${row.entidad_id}` : ''}</span>
              )},
              { key: 'detalle', header: 'Detalle', render: (row: any) => <span className="admin-cell-muted">{row.detalle}</span> },
              { key: 'monto', header: 'Monto', className: 'num', render: (row: any) => row.monto != null ? <MoneyText value={row.monto} /> : '—' },
            ]}
          />

          {/* Paginación */}
          {data && data.pages > 1 && (
            <div className="admin-pagination">
              <button className="admin-btn ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
              <span className="admin-page-count">Pág. {page} / {data.pages}</span>
              <button className="admin-btn ghost" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </AdminPanel>
  );
}
