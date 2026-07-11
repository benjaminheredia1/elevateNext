'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import AdminPanel from '@/components/admin/AdminPanel';
import KpiCard from '@/components/ui/KpiCard';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import apiClient from '@/hooks/api';
import {
  type CambioCelda,
  type CeldaHorario,
  type TrabajadorHorario,
  useCrearFeriado,
  useDiasFeriados,
  useEliminarFeriado,
  useGuardarHorarios,
  useHorariosTrabajadores,
} from '@/hooks/admin-horarios-trabajadores';

const DIAS: { dia: 1 | 2 | 3 | 4 | 5 | 6 | 7; label: string }[] = [
  { dia: 1, label: 'Lun' },
  { dia: 2, label: 'Mar' },
  { dia: 3, label: 'Mié' },
  { dia: 4, label: 'Jue' },
  { dia: 5, label: 'Vie' },
  { dia: 6, label: 'Sáb' },
  { dia: 7, label: 'Dom' },
];

function useSucursales() {
  return useQuery({
    queryKey: ['sucursales'],
    queryFn: async () => (await apiClient.get('/api/admin/sucursales')).data,
    retry: false,
  });
}

function claveCelda(usuarioId: number, dia: number) {
  return `${usuarioId}:${dia}`;
}

function DiaCell({
  celda,
  onChange,
  dirty,
}: {
  celda: CeldaHorario;
  onChange: (celda: CeldaHorario) => void;
  dirty: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 4, minWidth: 132,
        padding: 6, borderRadius: 6,
        background: dirty ? 'rgba(255,92,25,0.08)' : 'transparent',
        border: dirty ? '1px solid rgba(255,92,25,0.35)' : '1px solid transparent',
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={celda.es_libre}
          onChange={e => onChange({ ...celda, es_libre: e.target.checked })}
        />
        Libre
      </label>
      {!celda.es_libre && (
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="time"
            value={celda.hora_entrada ?? ''}
            onChange={e => onChange({ ...celda, hora_entrada: e.target.value || null })}
            style={{ width: '100%', fontSize: 12 }}
          />
          <input
            type="time"
            value={celda.hora_salida ?? ''}
            onChange={e => onChange({ ...celda, hora_salida: e.target.value || null })}
            style={{ width: '100%', fontSize: 12 }}
          />
        </div>
      )}
    </div>
  );
}

function GrillaHorarios() {
  const horarios = useHorariosTrabajadores();
  const guardar = useGuardarHorarios();
  const [dirty, setDirty] = useState<Map<string, CambioCelda>>(new Map());

  const trabajadores: TrabajadorHorario[] = horarios.data?.trabajadores ?? [];

  useEffect(() => {
    if (dirty.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty.size]);

  const getCelda = (t: TrabajadorHorario, dia: number): CeldaHorario => {
    const key = claveCelda(t.usuario_id, dia);
    const override = dirty.get(key);
    if (override) return override;
    return t.dias[String(dia) as keyof TrabajadorHorario['dias']];
  };

  const setCelda = (usuarioId: number, dia: number, celda: CeldaHorario) => {
    setDirty(prev => {
      const next = new Map(prev);
      next.set(claveCelda(usuarioId, dia), { usuario_id: usuarioId, dia_semana: dia, ...celda });
      return next;
    });
  };

  const diasLibresEstaSemana = trabajadores.reduce((acc, t) => {
    return acc + DIAS.filter(({ dia }) => getCelda(t, dia).es_libre).length;
  }, 0);

  const guardarCambios = () => {
    const cambios = Array.from(dirty.values());
    if (cambios.length === 0) return;
    guardar.mutate(cambios, { onSuccess: () => setDirty(new Map()) });
  };

  if (horarios.isLoading) return <EmptyState title="Cargando horarios..." />;
  if (horarios.isError) return <EmptyState title="Error al cargar horarios" />;

  return (
    <>
      <div className="kpi-grid">
        <KpiCard label="Trabajadores" value={trabajadores.length} />
        <KpiCard label="Días libres (semana)" value={diasLibresEstaSemana} />
        <KpiCard label="Celdas sin guardar" value={dirty.size} highlight={dirty.size > 0} />
      </div>

      <div className="admin-page-header" style={{ marginTop: 16 }}>
        <div>
          <h2>Parrilla semanal</h2>
          <p>Editá el día libre y los horarios de entrada/salida de cada trabajador.</p>
        </div>
        <button
          className="admin-btn primary"
          disabled={dirty.size === 0 || guardar.isPending}
          onClick={guardarCambios}
        >
          {guardar.isPending ? 'Guardando...' : `Guardar cambios${dirty.size ? ` (${dirty.size})` : ''}`}
        </button>
      </div>

      <DataTable
        data={trabajadores}
        emptyTitle="No hay trabajadores registrados"
        rowKey={t => t.usuario_id}
        columns={[
          {
            key: 'trabajador', header: 'Trabajador', render: t => (
              <div>
                <div className="admin-cell-title">{t.nombre}</div>
                <div className="admin-cell-sub">{t.rol}</div>
              </div>
            ),
          },
          { key: 'sucursal', header: 'Sucursal', render: t => t.sucursal?.nombre ?? '—' },
          { key: 'negocio', header: 'Negocio', render: t => t.negocio },
          ...DIAS.map(({ dia, label }) => ({
            key: `dia-${dia}`,
            header: label,
            render: (t: TrabajadorHorario) => (
              <DiaCell
                celda={getCelda(t, dia)}
                dirty={dirty.has(claveCelda(t.usuario_id, dia))}
                onChange={celda => setCelda(t.usuario_id, dia, celda)}
              />
            ),
          })),
        ]}
      />
    </>
  );
}

function PanelFeriados() {
  const feriados = useDiasFeriados();
  const crear = useCrearFeriado();
  const eliminar = useEliminarFeriado();
  const sucursales = useSucursales();

  const [fecha, setFecha] = useState('');
  const [nombre, setNombre] = useState('');
  const [sucursalId, setSucursalId] = useState<string>('');

  const items = feriados.data?.items ?? [];
  const listaSucursales = useMemo(() => sucursales.data?.items ?? sucursales.data ?? [], [sucursales.data]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!fecha || !nombre.trim()) return;
    crear.mutate(
      { fecha, nombre: nombre.trim(), sucursal_id: sucursalId ? Number(sucursalId) : null },
      { onSuccess: () => { setFecha(''); setNombre(''); setSucursalId(''); } },
    );
  };

  return (
    <div style={{ marginTop: 32 }}>
      <div className="admin-page-header">
        <div>
          <h2>Días feriados</h2>
          <p>Feriados globales o por sucursal.</p>
        </div>
      </div>

      <form onSubmit={submit} className="form-grid" style={{ marginBottom: 16, alignItems: 'end' }}>
        <div className="form-group">
          <label>Fecha</label>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} required />
        </div>
        <div className="form-group">
          <label>Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Año Nuevo" required />
        </div>
        <div className="form-group">
          <label>Sucursal</label>
          <select value={sucursalId} onChange={e => setSucursalId(e.target.value)}>
            <option value="">Global (todas)</option>
            {listaSucursales.map((s: { id: number; nombre: string }) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <button type="submit" className="admin-btn primary" disabled={crear.isPending}>
            Agregar feriado
          </button>
        </div>
      </form>

      {feriados.isLoading ? (
        <EmptyState title="Cargando feriados..." />
      ) : (
        <DataTable
          data={items}
          emptyTitle="Sin feriados registrados"
          rowKey={f => f.id}
          columns={[
            { key: 'fecha', header: 'Fecha', render: f => new Date(f.fecha).toLocaleDateString('es-BO', { timeZone: 'UTC' }) },
            { key: 'nombre', header: 'Nombre', render: f => f.nombre },
            { key: 'sucursal', header: 'Sucursal', render: f => f.sucursal?.nombre ?? 'Global' },
            {
              key: 'acciones', header: '', render: f => (
                <button
                  className="admin-btn ghost"
                  disabled={eliminar.isPending}
                  onClick={() => eliminar.mutate(f.id)}
                >
                  Eliminar
                </button>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}

export default function HorariosTrabajadoresPage() {
  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Horario de Trabajadores</h1>
          <p>Días laborales, sucursal y negocio del personal.</p>
        </div>
      </div>

      <GrillaHorarios />
      <PanelFeriados />
    </AdminPanel>
  );
}
