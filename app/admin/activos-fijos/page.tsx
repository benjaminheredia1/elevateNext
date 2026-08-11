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
  categoria: 'Equipos de cocina',
  fecha_compra: new Date().toISOString().slice(0, 10),
  valor_original: 0,
  depreciacion_pct: null,
  vida_util_anios: null,
  metodo_pago: 'EFECTIVO',
  notas: '',
};

// La depreciación se piensa de dos formas equivalentes: "me dura 5 años" o
// "pierde 20% al año". Se guarda siempre el %, y si se cargó por años también
// los años, para reabrir el formulario en el mismo modo en que se cargó.
type ModoDepreciacion = 'ANIOS' | 'PCT' | 'NINGUNA';

function pctDesdeAnios(anios: number) {
  if (!anios || anios <= 0) return null;
  return Number((100 / anios).toFixed(2));
}

function aniosDesdePct(pct: number) {
  if (!pct || pct <= 0) return null;
  return 100 / pct;
}

function modoDe(v: ActivoFijoPayload): ModoDepreciacion {
  if (v.vida_util_anios != null) return 'ANIOS';
  if (v.depreciacion_pct != null) return 'PCT';
  return 'NINGUNA';
}

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
  const [modo, setModo] = useState<ModoDepreciacion>('ANIOS');
  // Los importes se editan como texto: con un number crudo no se puede borrar
  // el 0 inicial y al escribir 90 queda "090".
  const [valorTxt, setValorTxt] = useState('');
  const [aniosTxt, setAniosTxt] = useState('5');
  const [pctTxt, setPctTxt] = useState('20');

  useEffect(() => {
    if (!value) return;
    setForm({
      ...value,
      fecha_compra: value.fecha_compra
        ? new Date(value.fecha_compra).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      metodo_pago: value.metodo_pago ?? 'EFECTIVO',
    });
    setValorTxt(value.valor_original ? String(value.valor_original) : '');
    setModo(modoDe(value));
    setAniosTxt(value.vida_util_anios != null ? String(value.vida_util_anios) : '5');
    setPctTxt(value.depreciacion_pct != null ? String(value.depreciacion_pct) : '20');
  }, [value]);

  if (!value) return null;

  const anios = Number(aniosTxt);
  const pct = Number(pctTxt);
  const pctCalculado = modo === 'ANIOS' ? pctDesdeAnios(anios) : modo === 'PCT' ? (pct > 0 ? pct : null) : null;
  const aniosCalculados = modo === 'PCT' ? aniosDesdePct(pct) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const valor = Number(valorTxt);
    if (!form.nombre.trim() || !(valor > 0)) return;
    onSubmit({
      ...form,
      valor_original: valor,
      depreciacion_pct: pctCalculado,
      vida_util_anios: modo === 'ANIOS' && anios > 0 ? Math.round(anios) : null,
      notas: form.notas?.trim() || null,
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
              <label>Nombre del activo</label>
              <input
                value={form.nombre}
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Freidora industrial"
                required
              />
            </div>
            <div className="form-group">
              <label>Categoría</label>
              <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value as CategoriaActivo }))}>
                {CATEGORIAS_ACTIVO.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Valor original (Bs)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorTxt}
                onChange={e => setValorTxt(e.target.value)}
                placeholder="0"
                required
              />
            </div>
            <div className="form-group">
              <label>Fecha de compra</label>
              <input
                type="date"
                value={form.fecha_compra}
                onChange={e => setForm(f => ({ ...f, fecha_compra: e.target.value }))}
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
              <label>Depreciación</label>
              <div className="pay-method-toggle">
                <button type="button" className={`pay-method-btn ${modo === 'ANIOS' ? 'active' : ''}`} onClick={() => setModo('ANIOS')}>
                  Por años
                </button>
                <button type="button" className={`pay-method-btn ${modo === 'PCT' ? 'active' : ''}`} onClick={() => setModo('PCT')}>
                  Por % anual
                </button>
                <button type="button" className={`pay-method-btn ${modo === 'NINGUNA' ? 'active' : ''}`} onClick={() => setModo('NINGUNA')}>
                  Sin depreciación
                </button>
              </div>
            </div>
            {modo === 'ANIOS' && (
              <div className="form-group full">
                <div className="depre-row">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    step="1"
                    className="depre-input"
                    value={aniosTxt}
                    onChange={e => setAniosTxt(e.target.value)}
                    required
                  />
                  <span className="depre-hint">
                    años{pctCalculado != null ? ` · ${pctCalculado.toFixed(1)}% anual` : ''}
                  </span>
                </div>
              </div>
            )}
            {modo === 'PCT' && (
              <div className="form-group full">
                <div className="depre-row">
                  <input
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    className="depre-input"
                    value={pctTxt}
                    onChange={e => setPctTxt(e.target.value)}
                    required
                  />
                  <span className="depre-hint">
                    % anual{aniosCalculados != null ? ` · ${aniosCalculados.toFixed(1)} años de vida útil` : ''}
                  </span>
                </div>
              </div>
            )}
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
              { key: 'metodo_pago', header: 'Pago', render: (row: any) => (row.metodo_pago === 'QR' ? 'QR' : 'Efectivo') },
              {
                key: 'depreciacion_pct',
                header: 'Depreciación',
                className: 'num',
                render: (row: any) =>
                  row.depreciacion_pct != null
                    ? row.vida_util_anios != null
                      ? `${row.vida_util_anios} años · ${row.depreciacion_pct}%`
                      : `${row.depreciacion_pct}%`
                    : '—',
              },
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
