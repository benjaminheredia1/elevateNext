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

const ACCION_COLORS: Record<string, string> = {
  CREO: '#22c55e',
  MODIFICO: '#3b82f6',
  ELIMINO: '#ef4444',
  LOGIN: '#a855f7',
  LOGOUT: '#888',
  APERTURA_CAJA: '#f59e0b',
  CIERRE_CAJA: '#f59e0b',
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

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="Buscar detalle, entidad o usuario…"
          value={q}
          onChange={e => { setQ(e.target.value); setPage(1); }}
          style={{ flex: 1, minWidth: 220, maxWidth: 360, padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', color: '#fff', fontSize: 13 }}
        />
        <div style={{ display: 'flex', gap: 6 }}>
          {ROL_OPTS.map(o => (
            <button
              key={o.value}
              className={`admin-btn ${rol === o.value ? 'primary' : 'ghost'}`}
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
              { key: 'fecha', header: 'Fecha', render: (row: any) => <span style={{ fontSize: 12, color: '#aaa' }}>{fmt(row.created_at)}</span> },
              { key: 'usuario', header: 'Usuario', render: (row: any) => (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{row.usuario_nombre}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{row.rol}</div>
                </div>
              )},
              { key: 'accion', header: 'Acción', render: (row: any) => (
                <span style={{ color: ACCION_COLORS[row.accion] ?? '#fff', fontWeight: 700, fontSize: 12 }}>{row.accion}</span>
              )},
              { key: 'entidad', header: 'Entidad', render: (row: any) => (
                <span style={{ fontSize: 12 }}>{row.entidad}{row.entidad_id ? ` #${row.entidad_id}` : ''}</span>
              )},
              { key: 'detalle', header: 'Detalle', render: (row: any) => <span style={{ fontSize: 12, color: '#ccc' }}>{row.detalle}</span> },
              { key: 'monto', header: 'Monto', className: 'num', render: (row: any) => row.monto != null ? <MoneyText value={row.monto} /> : '—' },
            ]}
          />

          {/* Paginación */}
          {data && data.pages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16 }}>
              <button className="admin-btn ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button>
              <span style={{ color: '#888', fontSize: 13, alignSelf: 'center' }}>Pág. {page} / {data.pages}</span>
              <button className="admin-btn ghost" disabled={page >= data.pages} onClick={() => setPage(p => p + 1)}>Siguiente</button>
            </div>
          )}
        </>
      )}
    </AdminPanel>
  );
}
