'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import AdminPanel from '@/components/admin/AdminPanel';
import { useAdminClientes } from '@/hooks/admin-clientes';
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

export default function ClientesAdminPage() {
  const [q, setQ] = useState('');
  const [mes, setMes] = useState(currentMonth());
  const [mergeOpen, setMergeOpen] = useState(false);
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
        <button className="admin-btn secondary" onClick={() => setMergeOpen(true)} disabled={items.length < 2}>
          Fusionar duplicados
        </button>
      </div>

      {mergeOpen && (
        <MergeModal
          items={items}
          onClose={() => setMergeOpen(false)}
          onMerged={() => queryClient.invalidateQueries({ queryKey: ['admin', 'clientes'] })}
        />
      )}

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
