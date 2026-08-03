'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AdminPanel from '@/components/admin/AdminPanel';
import { useAdminClientes, type PeriodoClientes } from '@/hooks/admin-clientes';
import { useCrearCliente } from '@/hooks/privilegios';
import apiClient from '@/hooks/api';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Normaliza para buscar sin importar tildes ni mayúsculas. */
function norm(value: string) {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Sugerencias máximas del autocompletado. */
const MAX_SUGERENCIAS = 8;

function monthName(value: string | undefined) {
  if (!value) return 'Mes actual';
  const [year, month] = value.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' });
}

function FavoriteProduct({ product }: { product?: { nombre: string; cantidad: number; total: number } | null }) {
  if (!product) return <span className="admin-cell-muted">Sin compras</span>;
  return (
    <div>
      <div className="admin-cell-title">{product.nombre}</div>
      <div className="admin-cell-sub">{Number(product.cantidad).toFixed(0)} un. · <MoneyText value={product.total} /></div>
    </div>
  );
}

function MergeModal({ items, onClose, onMerged }: { items: any[]; onClose: () => void; onMerged: () => void }) {
  const [keepId, setKeepId] = useState<number | ''>('');
  const [mergeId, setMergeId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const label = (c: any) => `${c.nombre}${c.telefono ? ` · ${c.telefono}` : ''} (${c.pedidos} ped.)`;

  const submit = async () => {
    setError('');
    if (!keepId || !mergeId || keepId === mergeId) { setError('Selecciona dos clientes distintos.'); return; }
    setBusy(true);
    try {
      await apiClient.post('/api/admin/clientes/merge', { keepId, mergeId });
      onMerged();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? e?.response?.data?.error ?? 'No se pudo fusionar.');
    } finally { setBusy(false); }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>Fusionar clientes duplicados</h2>
          <button className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            Mueve los pedidos del cliente duplicado al cliente que conservas. El duplicado se elimina. Esta acción no se puede deshacer.
          </p>
          <div className="form-group">
            <label>Cliente a conservar</label>
            <select value={keepId} onChange={e => setKeepId(e.target.value ? +e.target.value : '')}>
              <option value="">Selecciona…</option>
              {items.map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Cliente duplicado (se fusiona y elimina)</label>
            <select value={mergeId} onChange={e => setMergeId(e.target.value ? +e.target.value : '')}>
              <option value="">Selecciona…</option>
              {items.filter(c => c.id !== keepId).map(c => <option key={c.id} value={c.id}>{label(c)}</option>)}
            </select>
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Fusionando…' : 'Fusionar'}</button>
        </div>
      </div>
    </div>
  );
}

function NuevoClienteModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const crear = useCrearCliente();
  const [form, setForm] = useState({ nombre: '', telefono: '', nit: '', email: '', direccion: '' });
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.nombre.trim().length < 2) { setError('El nombre es obligatorio.'); return; }
    crear.mutate(
      {
        nombre: form.nombre.trim(),
        telefono: form.telefono.trim() || undefined,
        nit: form.nit.trim() || undefined,
        email: form.email.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
      },
      {
        onSuccess: () => { onCreated(); onClose(); },
        onError: (e: any) => setError(e?.response?.data?.error ?? 'No se pudo crear el cliente.'),
      },
    );
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Agregar cliente</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Nombre o razón social</label>
              <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label>Celular</label>
              <input inputMode="numeric" value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value.replace(/\D/g, '') }))} />
            </div>
            <div className="form-group">
              <label>NIT / C.I.</label>
              <input inputMode="numeric" value={form.nit} onChange={e => setForm(f => ({ ...f, nit: e.target.value.replace(/\D/g, '') }))} />
            </div>
            <div className="form-group">
              <label>Correo (opcional)</label>
              <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Dirección (opcional)</label>
              <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
            </div>
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={crear.isPending}>{crear.isPending ? 'Creando...' : 'Crear cliente'}</button>
        </div>
      </form>
    </div>
  );
}

type FormaCompra = 'PAGADA' | 'FIADO' | 'CORTESIA';

const FORMA_PILL: Record<FormaCompra, { clase: string; label: string; ayuda: string }> = {
  PAGADA:   { clase: 'fresh', label: 'Pagada',   ayuda: 'Cobrada en su momento' },
  FIADO:    { clase: 'info',  label: 'Fiado',    ayuda: 'Entregada, pago pendiente' },
  CORTESIA: { clase: 'warn',  label: 'Cortesía', ayuda: 'No se cobró ni suma a ingresos' },
};

/**
 * Historial de compras del cliente: pagadas, fiadas y cortesías.
 *
 * Las tres viven en la misma tabla, pero solo la pagada deja movimiento de
 * caja: armar esta lista desde los movimientos dejaría afuera justo las que uno
 * quiere revisar al mirar a un cliente.
 */
function ComprasDelCliente({ clienteId }: { clienteId: number }) {
  const [filtro, setFiltro] = useState<'TODAS' | FormaCompra>('TODAS');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'cliente-compras', clienteId],
    queryFn: async () => (await apiClient.get(`/api/admin/clientes/${clienteId}/compras`)).data,
  });

  const compras = data?.items ?? [];
  const visibles = filtro === 'TODAS' ? compras : compras.filter((c: any) => c.forma === filtro);
  const resumen = data?.resumen;

  if (isLoading) return <p className="form-hint" style={{ marginTop: 16 }}>Cargando compras…</p>;
  if (isError) return <p className="form-hint" style={{ marginTop: 16 }}>No se pudieron cargar las compras.</p>;

  return (
    <div style={{ marginTop: 18 }}>
      <h4 style={{ marginBottom: 8 }}>Compras ({compras.length})</h4>

      {resumen && (
        // Separados a propósito: lo fiado todavía se debe y la cortesía nunca
        // se cobró, así que sumarlos en un solo "gastó" sería un número falso.
        <div className="inv-summary" style={{ marginBottom: 12 }}>
          <div className="inv-stat">
            <div className="inv-stat-label">Pagado</div>
            <div className="inv-stat-val"><MoneyText value={resumen.pagado} /></div>
          </div>
          <div className="inv-stat">
            <div className="inv-stat-label">Fiado</div>
            <div className="inv-stat-val"><MoneyText value={resumen.fiado} /></div>
          </div>
          <div className="inv-stat">
            <div className="inv-stat-label">Cortesías</div>
            <div className="inv-stat-val"><MoneyText value={resumen.cortesias} /></div>
          </div>
          <div className="inv-stat">
            <div className="inv-stat-label">Debe hoy</div>
            <div className="inv-stat-val"><MoneyText value={resumen.deuda_pendiente} /></div>
          </div>
        </div>
      )}

      <div className="admin-cat-filters" style={{ marginBottom: 10 }}>
        {(['TODAS', 'PAGADA', 'FIADO', 'CORTESIA'] as const).map(f => (
          <button
            key={f}
            type="button"
            className={`cat-filter-btn ${filtro === f ? 'active' : ''}`}
            onClick={() => setFiltro(f)}
          >
            {f === 'TODAS' ? 'Todas' : FORMA_PILL[f].label}
            {' '}({f === 'TODAS' ? compras.length : compras.filter((c: any) => c.forma === f).length})
          </button>
        ))}
      </div>

      {visibles.length === 0 ? (
        <p className="form-hint">Sin compras que coincidan.</p>
      ) : (
        <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
          {visibles.map((compra: any) => {
            const pill = FORMA_PILL[compra.forma as FormaCompra];
            return (
              <div key={compra.id} className="finance-modal-note" style={{ display: 'grid', gap: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span>
                    <strong>#{compra.numero_sucursal ?? compra.id}</strong>{' '}
                    <span className="dim">{fmt(compra.created_at)}</span>
                    {compra.sucursal && <span className="dim"> · {compra.sucursal}</span>}
                  </span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`admin-badge-soft ${pill.clase}`} title={pill.ayuda}>{pill.label}</span>
                    <strong><MoneyText value={compra.total} /></strong>
                  </span>
                </div>
                <div className="admin-cell-sub">
                  {compra.items.map((i: any) => `${i.cantidad}× ${i.nombre}`).join(', ') || 'Sin detalle'}
                  {compra.descuento && ` · ${compra.descuento}`}
                </div>
                {compra.deuda && compra.deuda.saldo > 0 && (
                  <div className="admin-cell-sub" style={{ color: 'var(--amber)' }}>
                    Debe <MoneyText value={compra.deuda.saldo} />
                    {compra.deuda.vencimiento && ` · vence ${fmt(compra.deuda.vencimiento)}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ClienteDetalleModal({ cliente, onClose }: { cliente: any; onClose: () => void }) {
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <div>
            <h2>{cliente.nombre}</h2>
            <p className="form-hint">{cliente.telefono ?? 'Sin celular'} · {cliente.pedidos} pedidos · <MoneyText value={cliente.total_gastado} /></p>
          </div>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div><span className="dim">Celular:</span> {cliente.telefono ?? '—'}</div>
            <div><span className="dim">Correo:</span> {cliente.email ?? '—'}</div>
            <div><span className="dim">NIT / C.I.:</span> {cliente.nit ?? '—'}</div>
            <div><span className="dim">Dirección:</span> {cliente.direccion ?? '—'}</div>
          </div>

          <ComprasDelCliente clienteId={cliente.id} />

          <p className="form-hint" style={{ marginTop: 12 }}>
            Los privilegios (descuentos) ya no se asignan al cliente: el cajero elige uno por venta en el punto de venta.
          </p>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/** Períodos del filtro de la lista. "7d" es la última semana corrida. */
const PERIODOS: { id: PeriodoClientes['rango']; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: 'Semana' },
  { id: 'mes', label: 'Mes' },
  { id: 'todo', label: 'Todo' },
  { id: 'custom', label: 'Rango' },
];

export default function ClientesAdminPage() {
  const [q, setQ] = useState('');
  const [mes, setMes] = useState(currentMonth());
  const [periodo, setPeriodo] = useState<PeriodoClientes>({ rango: 'mes' });
  const [mergeOpen, setMergeOpen] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalle, setDetalle] = useState<any | null>(null);
  const [seleccionado, setSeleccionado] = useState<any | null>(null);
  const [sugerenciasAbiertas, setSugerenciasAbiertas] = useState(false);
  const [resaltada, setResaltada] = useState(0);
  const buscadorRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  // La búsqueda es local: el servidor solo depende del mes, así no se recarga en cada tecla.
  const { data, isLoading, isError } = useAdminClientes('', mes, periodo);

  const items = data?.items ?? [];

  const coincidencias = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return items;
    return items.filter((c: any) => norm(c.nombre).includes(term) || (c.telefono ?? '').includes(term));
  }, [items, q]);

  // Si hay un cliente elegido se muestra solo ese; si no, lo que coincida con el texto.
  const visibles = seleccionado ? items.filter((c: any) => c.id === seleccionado.id) : coincidencias;
  const sugerencias = coincidencias.slice(0, MAX_SUGERENCIAS);

  // Cierra el desplegable al hacer clic fuera del buscador.
  useEffect(() => {
    if (!sugerenciasAbiertas) return;
    const onClickFuera = (e: MouseEvent) => {
      if (!buscadorRef.current?.contains(e.target as Node)) setSugerenciasAbiertas(false);
    };
    document.addEventListener('mousedown', onClickFuera);
    return () => document.removeEventListener('mousedown', onClickFuera);
  }, [sugerenciasAbiertas]);

  const elegirCliente = (cliente: any) => {
    setSeleccionado(cliente);
    setQ(cliente.nombre);
    setSugerenciasAbiertas(false);
  };

  const limpiarBusqueda = () => {
    setSeleccionado(null);
    setQ('');
    setSugerenciasAbiertas(false);
  };

  const onTeclaBuscador = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setSugerenciasAbiertas(false); return; }
    if (!sugerenciasAbiertas || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltada(i => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltada(i => (i - 1 + sugerencias.length) % sugerencias.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      elegirCliente(sugerencias[Math.min(resaltada, sugerencias.length - 1)]);
    }
  };
  const resumen = data?.resumen;
  const clienteMasComprador = resumen?.cliente_mas_comprador;
  const clienteMasFrecuente = resumen?.cliente_mas_frecuente;
  const productoMasComprado = resumen?.producto_mas_comprado;
  const topFavoritos = resumen?.top_favoritos_mes ?? [];
  const topClientes = resumen?.top_clientes_mes ?? [];
  const maxFavClientes = topFavoritos[0]?.clientes ?? 0;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Clientes</h1>
          <p>Historial y métricas de clientes registrados.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="admin-btn secondary" onClick={() => setMergeOpen(true)} disabled={items.length < 2}>
            Fusionar duplicados
          </button>
          <button className="admin-btn primary" onClick={() => setNuevoOpen(true)}>+ Agregar cliente</button>
        </div>
      </div>

      {mergeOpen && (
        <MergeModal
          items={items}
          onClose={() => setMergeOpen(false)}
          onMerged={() => queryClient.invalidateQueries({ queryKey: ['admin', 'clientes'] })}
        />
      )}

      {nuevoOpen && (
        <NuevoClienteModal
          onClose={() => setNuevoOpen(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['admin', 'clientes'] })}
        />
      )}

      {detalle && <ClienteDetalleModal cliente={detalle} onClose={() => setDetalle(null)} />}

      {isLoading ? (
        <EmptyState title="Cargando clientes..." />
      ) : isError ? (
        <EmptyState title="Error al cargar clientes" />
      ) : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Total clientes" value={resumen?.total_clientes ?? 0} />
            <KpiCard label="Ingresos totales" value={<MoneyText value={resumen?.ingresos_totales ?? 0} />} highlight />
            <KpiCard label="Gasto promedio" value={<MoneyText value={resumen?.gasto_promedio ?? 0} />} />
            <KpiCard label="Activos del mes" value={resumen?.clientes_activos_mes ?? 0} accent="var(--fresh)" />
          </div>

          <div className="admin-toolbar">
            <div className="cliente-search" ref={buscadorRef}>
              <input
                placeholder="Buscar por nombre o teléfono…"
                value={q}
                onChange={e => {
                  setQ(e.target.value);
                  setSeleccionado(null);
                  setResaltada(0);
                  setSugerenciasAbiertas(true);
                }}
                onFocus={() => setSugerenciasAbiertas(true)}
                onKeyDown={onTeclaBuscador}
                className="admin-search-field"
                role="combobox"
                aria-expanded={sugerenciasAbiertas}
                aria-autocomplete="list"
              />
              {q && (
                <button type="button" className="cliente-search-clear" onClick={limpiarBusqueda} aria-label="Limpiar búsqueda">
                  ×
                </button>
              )}
              {sugerenciasAbiertas && q.trim() && !seleccionado && (
                <ul className="cliente-search-list" role="listbox">
                  {sugerencias.length === 0 ? (
                    <li className="cliente-search-empty">Sin coincidencias</li>
                  ) : (
                    sugerencias.map((c: any, i: number) => (
                      <li
                        key={c.id}
                        role="option"
                        aria-selected={i === resaltada}
                        className={`cliente-search-option ${i === resaltada ? 'is-active' : ''}`}
                        onMouseEnter={() => setResaltada(i)}
                        onMouseDown={e => { e.preventDefault(); elegirCliente(c); }}
                      >
                        <span className="cliente-search-name">{c.nombre}</span>
                        <span className="cliente-search-meta">
                          {c.telefono ?? 'Sin celular'} · {c.pedidos} ped.
                        </span>
                      </li>
                    ))
                  )}
                  {coincidencias.length > sugerencias.length && (
                    <li className="cliente-search-empty">
                      +{coincidencias.length - sugerencias.length} coincidencias más — sigue escribiendo
                    </li>
                  )}
                </ul>
              )}
            </div>
            {seleccionado && (
              <button type="button" className="admin-btn ghost" onClick={limpiarBusqueda}>
                Ver todos los clientes
              </button>
            )}
            <div className="form-group" style={{ minWidth: 190 }}>
              <label>Mes de fidelización</label>
              <input type="month" value={mes} onChange={e => setMes(e.target.value || currentMonth())} />
            </div>
          </div>

          {/* Período de la LISTA, aparte del mes de fidelización: una cosa es
              "quién compró esta semana" y otra "quién fue el mejor de julio". */}
          <div className="admin-cat-filters" style={{ marginTop: 12 }}>
            {PERIODOS.map(p => (
              <button
                key={p.id}
                type="button"
                className={`cat-filter-btn ${periodo.rango === p.id ? 'active' : ''}`}
                onClick={() => setPeriodo({ rango: p.id, desde: periodo.desde, hasta: periodo.hasta })}
              >
                {p.label}
              </button>
            ))}
            {periodo.rango === 'custom' && (
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', marginLeft: 8 }}>
                <input
                  type="date"
                  value={periodo.desde ?? ''}
                  onChange={e => setPeriodo({ ...periodo, desde: e.target.value })}
                />
                <span className="dim">a</span>
                <input
                  type="date"
                  value={periodo.hasta ?? ''}
                  onChange={e => setPeriodo({ ...periodo, hasta: e.target.value })}
                />
              </span>
            )}
          </div>

          <div className="finance-grid">
            <div className="finance-panel span-4">
              <div className="finance-panel-header">
                <div>
                  <h3>Más comprador</h3>
                  <p>{monthName(resumen?.mes)}</p>
                </div>
              </div>
              {clienteMasComprador ? (
                <div className="finance-list">
                  <div className="finance-row"><span>Cliente</span><strong>{clienteMasComprador.nombre}</strong></div>
                  <div className="finance-row"><span>Gastó</span><strong><MoneyText value={clienteMasComprador.gastado_mes} /></strong></div>
                  <div className="finance-row"><span>Pedidos</span><strong>{clienteMasComprador.pedidos_mes}</strong></div>
                  <div className="finance-row"><span>Compra más</span><strong>{clienteMasComprador.producto_favorito_mes?.nombre ?? 'Sin producto'}</strong></div>
                </div>
              ) : (
                <EmptyState title="Sin compras en este mes" />
              )}
            </div>

            <div className="finance-panel span-4">
              <div className="finance-panel-header">
                <div>
                  <h3>Más frecuente</h3>
                  <p>Cliente con más pedidos</p>
                </div>
              </div>
              {clienteMasFrecuente ? (
                <div className="finance-list">
                  <div className="finance-row"><span>Cliente</span><strong>{clienteMasFrecuente.nombre}</strong></div>
                  <div className="finance-row"><span>Pedidos</span><strong>{clienteMasFrecuente.pedidos_mes}</strong></div>
                  <div className="finance-row"><span>Ticket prom.</span><strong><MoneyText value={clienteMasFrecuente.ticket_promedio_mes} /></strong></div>
                  <div className="finance-row"><span>Compra más</span><strong>{clienteMasFrecuente.producto_favorito_mes?.nombre ?? 'Sin producto'}</strong></div>
                </div>
              ) : (
                <EmptyState title="Sin frecuencia este mes" />
              )}
            </div>

            <div className="finance-panel span-4">
              <div className="finance-panel-header">
                <div>
                  <h3>Productos favoritos</h3>
                  <p>Preferidos por más clientes este mes</p>
                </div>
              </div>
              {topFavoritos.length > 0 ? (
                <ul className="fav-prod-list">
                  {topFavoritos.map((fav: any, i: number) => (
                    <li key={fav.producto_id} className="fav-prod-item">
                      <span className="fav-prod-rank">{i + 1}</span>
                      <div className="fav-prod-body">
                        <div className="fav-prod-name">{fav.nombre}</div>
                        <div className="fav-prod-bar-track">
                          <span className="fav-prod-bar" style={{ width: `${maxFavClientes > 0 ? (fav.clientes / maxFavClientes) * 100 : 0}%` }} />
                        </div>
                      </div>
                      <div className="fav-prod-stats">
                        <strong>{fav.clientes}</strong>
                        <span>{fav.clientes === 1 ? 'cliente' : 'clientes'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : productoMasComprado ? (
                <div className="finance-list">
                  <div className="finance-row"><span>Producto</span><strong>{productoMasComprado.nombre}</strong></div>
                  <div className="finance-row"><span>Unidades</span><strong>{Number(productoMasComprado.cantidad).toFixed(0)}</strong></div>
                  <div className="finance-row"><span>Ingresos</span><strong><MoneyText value={productoMasComprado.total} /></strong></div>
                </div>
              ) : (
                <EmptyState title="Sin productos vendidos" />
              )}
            </div>
          </div>

          {topClientes.length > 0 && (
            <div className="dash-card span-12" style={{ marginBottom: 18 }}>
              <div className="dash-card-header">
                <h3>Top clientes del mes</h3>
                <span className="dash-card-sub">
                  {topClientes.length} {topClientes.length === 1 ? 'cliente' : 'clientes'} · ordenados por gasto
                </span>
              </div>
              <ol className="top-clientes-list">
                {topClientes.map((cliente: any, index: number) => (
                  <li
                    key={cliente.id}
                    className="top-cliente-item"
                    onClick={() => setDetalle(items.find((c: any) => c.id === cliente.id) ?? cliente)}
                  >
                    <span className={`top-cliente-rank ${index < 3 ? 'is-podio' : ''}`}>{index + 1}</span>
                    <div className="top-cliente-body">
                      <div className="top-cliente-name">{cliente.nombre}</div>
                      <div className="top-cliente-sub">
                        {cliente.pedidos_mes} {cliente.pedidos_mes === 1 ? 'pedido' : 'pedidos'} · {cliente.producto_favorito_mes?.nombre ?? 'Sin producto favorito'}
                      </div>
                    </div>
                    <strong className="top-cliente-total"><MoneyText value={cliente.gastado_mes} /></strong>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <DataTable
            data={visibles}
            emptyTitle={q.trim() ? 'Sin clientes que coincidan' : 'Sin clientes registrados'}
            rowKey={(row: any) => row.id}
            onRowClick={(row: any) => setDetalle(row)}
            columns={[
              { key: 'nombre', header: 'Cliente', render: (row: any) => (
                <div>
                  <div className="admin-cell-title">{row.nombre}</div>
                  {row.telefono && <div className="admin-cell-sub">{row.telefono}</div>}
                </div>
              )},
              { key: 'primer_pedido', header: 'Primer pedido', render: (row: any) => fmt(row.primer_pedido) },
              { key: 'pedidos', header: 'Pedidos', className: 'num', render: (row: any) => row.pedidos },
              { key: 'total_gastado', header: 'Total gastado', className: 'num', render: (row: any) => <MoneyText value={row.total_gastado} /> },
              // Del período elegido arriba, no del mes de fidelización.
              { key: 'pedidos_periodo', header: 'Pedidos período', className: 'num', render: (row: any) => row.pedidos_periodo ?? 0 },
              { key: 'gastado_periodo', header: 'Gastado período', className: 'num', render: (row: any) => <MoneyText value={row.gastado_periodo ?? 0} /> },
              { key: 'favorito_mes', header: 'Compra más', render: (row: any) => <FavoriteProduct product={row.producto_favorito_mes} /> },
              { key: 'gasto_promedio', header: 'Gasto prom.', className: 'num', render: (row: any) => <MoneyText value={row.gasto_promedio} /> },
            ]}
          />
        </>
      )}
    </AdminPanel>
  );
}
