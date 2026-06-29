'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';

interface Promocion {
  id: number;
  nombre: string;
  valor: string;
}

interface ReglaHoraria {
  id: number;
  promocionesDescuentos_id: number;
  fecha_inicio: string;
  fecha_fin: string;
  promocionesDescuentos?: Promocion;
}

interface ReglaPayload {
  promocionesDescuentos_id: number;
  fecha_inicio: string;
  fecha_fin: string;
}

function fmtDate(value: string) {
  return new Date(value).toLocaleString('es-BO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isActive(row: ReglaHoraria) {
  const now = Date.now();
  return new Date(row.fecha_inicio).getTime() <= now && now <= new Date(row.fecha_fin).getTime();
}

function useReglasHorarias() {
  return useQuery({
    queryKey: ['admin', 'reglas-horarias'],
    queryFn: async () => (await apiClient.get<ReglaHoraria[]>('/api/reglas-horarias')).data,
  });
}

function usePromociones() {
  return useQuery({
    queryKey: ['admin', 'promociones'],
    queryFn: async () => (await apiClient.get<Promocion[]>('/api/promociones')).data,
  });
}

function useCrearRegla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ReglaPayload) => (await apiClient.post('/api/reglas-horarias', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reglas-horarias'] }),
  });
}

function useEliminarRegla() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/reglas-horarias/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'reglas-horarias'] }),
  });
}

function NuevaReglaModal({
  promociones,
  onClose,
  onSubmit,
  saving,
}: {
  promociones: Promocion[];
  onClose: () => void;
  onSubmit: (value: ReglaPayload) => void;
  saving: boolean;
}) {
  const defaultPromo = promociones[0]?.id ?? 0;
  const [form, setForm] = useState<ReglaPayload>({
    promocionesDescuentos_id: defaultPromo,
    fecha_inicio: '',
    fecha_fin: '',
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(form);
  };

  return (
    <div className="admin-modal-overlay">
      <form onSubmit={submit} className="admin-modal">
        <div className="admin-modal-header">
          <h2>Nueva regla horaria</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          {promociones.length === 0 ? (
            <EmptyState title="Sin promociones disponibles" hint="Crea una promoción antes de asignarle un horario." />
          ) : (
            <div className="form-grid">
              <div className="form-group full">
                <label>Promoción</label>
                <select
                  value={form.promocionesDescuentos_id}
                  onChange={event => setForm({ ...form, promocionesDescuentos_id: Number(event.target.value) })}
                >
                  {promociones.map(promocion => (
                    <option key={promocion.id} value={promocion.id}>
                      {promocion.nombre} · {promocion.valor}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Inicio</label>
                <input
                  type="datetime-local"
                  value={form.fecha_inicio}
                  onChange={event => setForm({ ...form, fecha_inicio: event.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Fin</label>
                <input
                  type="datetime-local"
                  value={form.fecha_fin}
                  onChange={event => setForm({ ...form, fecha_fin: event.target.value })}
                  required
                />
              </div>
            </div>
          )}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving || promociones.length === 0}>Guardar</button>
        </div>
      </form>
    </div>
  );
}

export default function ReglasHorarias() {
  const reglas = useReglasHorarias();
  const promociones = usePromociones();
  const crear = useCrearRegla();
  const eliminar = useEliminarRegla();
  const [showModal, setShowModal] = useState(false);

  const rows = reglas.data ?? [];
  const resumen = useMemo(() => {
    const activas = rows.filter(isActive).length;
    return { total: rows.length, activas, programadas: rows.length - activas };
  }, [rows]);

  return (
    <>
      <div className="admin-page-header">
        <div>
          <span className="admin-badge">Promos</span>
          <h1>Horarios</h1>
          <p>Reglas de vigencia para promociones aplicadas por fecha y hora.</p>
        </div>
        <button className="admin-btn primary" onClick={() => setShowModal(true)}>Nueva regla</button>
      </div>

      {reglas.isLoading ? (
        <EmptyState title="Cargando horarios..." />
      ) : reglas.isError ? (
        <EmptyState title="No se pudieron cargar los horarios" />
      ) : (
        <>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-label">Reglas</div>
              <div className="kpi-value">{resumen.total}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" /></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Activas ahora</div>
              <div className="kpi-value">{resumen.activas}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ background: 'var(--fresh)' }} /></div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Fuera de ventana</div>
              <div className="kpi-value">{resumen.programadas}</div>
              <div className="kpi-bar"><div className="kpi-bar-fill" style={{ background: 'var(--amber)' }} /></div>
            </div>
          </div>

          <DataTable
            data={rows}
            emptyTitle="Sin reglas horarias"
            rowKey={row => row.id}
            columns={[
              {
                key: 'promocion',
                header: 'Promoción',
                render: row => (
                  <div>
                    <div className="admin-cell-title">{row.promocionesDescuentos?.nombre ?? `Promoción #${row.promocionesDescuentos_id}`}</div>
                    <div className="admin-cell-sub">{row.promocionesDescuentos?.valor ?? 'Sin valor registrado'}</div>
                  </div>
                ),
              },
              { key: 'inicio', header: 'Inicio', render: row => <span className="admin-cell-muted">{fmtDate(row.fecha_inicio)}</span> },
              { key: 'fin', header: 'Fin', render: row => <span className="admin-cell-muted">{fmtDate(row.fecha_fin)}</span> },
              {
                key: 'estado',
                header: 'Estado',
                render: row => (
                  <span className={`admin-badge-soft ${isActive(row) ? 'fresh' : 'warn'}`}>
                    {isActive(row) ? 'Activa' : 'Programada'}
                  </span>
                ),
              },
              {
                key: 'acciones',
                header: '',
                render: row => (
                  <div className="admin-actions">
                    <button className="admin-btn ghost" onClick={() => eliminar.mutate(row.id)} disabled={eliminar.isPending}>
                      Eliminar
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {showModal && (
        <NuevaReglaModal
          promociones={promociones.data ?? []}
          onClose={() => setShowModal(false)}
          onSubmit={payload => crear.mutate(payload, { onSuccess: () => setShowModal(false) })}
          saving={crear.isPending}
        />
      )}
    </>
  );
}
