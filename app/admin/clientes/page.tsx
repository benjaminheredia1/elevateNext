'use client';

import { FormEvent, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPanel from '@/components/admin/AdminPanel';
import { useAdminClientes } from '@/hooks/admin-clientes';
import {
  useClientePrivilegios,
  useCrearCliente,
  useGuardarClientePrivilegios,
  usePrivilegios,
} from '@/hooks/privilegios';
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

function ClienteDetalleModal({ cliente, onClose }: { cliente: any; onClose: () => void }) {
  const catalogo = usePrivilegios(false);
  const asignados = useClientePrivilegios(cliente.id);
  const guardar = useGuardarClientePrivilegios();
  const [seleccion, setSeleccion] = useState<Set<number> | null>(null);

  const asignadosIds = new Set((asignados.data ?? []).map(p => p.id));
  const current = seleccion ?? asignadosIds;

  const toggle = (id: number) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSeleccion(next);
  };

  const save = () => {
    guardar.mutate(
      { clienteId: cliente.id, privilegio_ids: Array.from(current) },
      { onSuccess: onClose },
    );
  };

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
          <h3 style={{ margin: '0 0 10px' }}>Privilegios asignados</h3>
          {catalogo.isLoading || asignados.isLoading ? (
            <EmptyState title="Cargando..." />
          ) : (catalogo.data ?? []).length === 0 ? (
            <p className="form-hint">No hay privilegios creados. Créalos en la sección Privilegios.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(catalogo.data ?? []).map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <input type="checkbox" checked={current.has(p.id)} onChange={() => toggle(p.id)} />
                  <div style={{ flex: 1 }}>
                    <strong>{p.nombre}</strong> <span className="dim">· {p.porcentaje}%</span>
                    {p.descripcion && <div className="admin-cell-sub">{p.descripcion}</div>}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cerrar</button>
          <button type="button" className="admin-btn primary" disabled={guardar.isPending} onClick={save}>{guardar.isPending ? 'Guardando...' : 'Guardar privilegios'}</button>
        </div>
      </div>
    </div>
  );
}

export default function ClientesAdminPage() {
  const [q, setQ] = useState('');
  const [mes, setMes] = useState(currentMonth());
  const [mergeOpen, setMergeOpen] = useState(false);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalle, setDetalle] = useState<any | null>(null);
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useAdminClientes(q, mes);

  const items = data?.items ?? [];
  const resumen = data?.resumen;
  const clienteMasComprador = resumen?.cliente_mas_comprador;
  const clienteMasFrecuente = resumen?.cliente_mas_frecuente;
  const productoMasComprado = resumen?.producto_mas_comprado;
  const topClientes = resumen?.top_clientes_mes ?? [];

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
            <input
              placeholder="Buscar por nombre o teléfono…"
              value={q}
              onChange={e => setQ(e.target.value)}
              className="admin-search-field"
            />
            <div className="form-group" style={{ minWidth: 190 }}>
              <label>Mes de fidelización</label>
              <input type="month" value={mes} onChange={e => setMes(e.target.value || currentMonth())} />
            </div>
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
                  <h3>Producto favorito</h3>
                  <p>Preferencia global del mes</p>
                </div>
              </div>
              {productoMasComprado ? (
                <div className="finance-list">
                  <div className="finance-row"><span>Producto</span><strong>{productoMasComprado.nombre}</strong></div>
                  <div className="finance-row"><span>Unidades</span><strong>{Number(productoMasComprado.cantidad).toFixed(0)}</strong></div>
                  <div className="finance-row"><span>Ingresos</span><strong><MoneyText value={productoMasComprado.total} /></strong></div>
                  <div className="finance-row"><span>Ticket prom.</span><strong><MoneyText value={resumen?.ticket_promedio_mes ?? 0} /></strong></div>
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
                <span className="dash-card-sub">ordenado por gasto</span>
              </div>
              <div className="finance-category-grid">
                {topClientes.map((cliente: any, index: number) => (
                  <div key={cliente.id} className="finance-category-card">
                    <div className="finance-category-label">#{index + 1} · {cliente.pedidos_mes} pedidos</div>
                    <div className="finance-category-value">{cliente.nombre}</div>
                    <div className="finance-category-sub"><MoneyText value={cliente.gastado_mes} /> · {cliente.producto_favorito_mes?.nombre ?? 'Sin producto favorito'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DataTable
            data={items}
            emptyTitle="Sin clientes registrados"
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
              { key: 'pedidos_mes', header: 'Pedidos mes', className: 'num', render: (row: any) => row.pedidos_mes },
              { key: 'gastado_mes', header: 'Gastado mes', className: 'num', render: (row: any) => <MoneyText value={row.gastado_mes} /> },
              { key: 'favorito_mes', header: 'Compra más', render: (row: any) => <FavoriteProduct product={row.producto_favorito_mes} /> },
              { key: 'gasto_promedio', header: 'Gasto prom.', className: 'num', render: (row: any) => <MoneyText value={row.gasto_promedio} /> },
            ]}
          />
        </>
      )}
    </AdminPanel>
  );
}
