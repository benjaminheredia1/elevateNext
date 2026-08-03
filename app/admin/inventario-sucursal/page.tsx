'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import apiClient from '@/hooks/api';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import { useSucursales } from '@/hooks/sucursales';

interface ItemStock {
  insumo_id: number;
  nombre: string;
  unidad_medida: string;
  categoria_insumo: string | null;
  proveedor: string | null;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
  punto_critico: number;
  nivel: 'ok' | 'bajo' | 'critico';
}

const NIVEL_META: Record<ItemStock['nivel'], { label: string; status: string }> = {
  ok:      { label: 'OK',      status: 'abierto' },
  bajo:    { label: 'Bajo',    status: 'sobrante' },
  critico: { label: 'Crítico', status: 'faltante' },
};

function TransferenciaModal({ sucursalOrigen, items, onClose, onHecha }: {
  sucursalOrigen: number;
  items: ItemStock[];
  onClose: () => void;
  onHecha: () => void;
}) {
  const { data: sucursales = [] } = useSucursales();
  const [insumoId, setInsumoId] = useState<number | ''>('');
  const [destino, setDestino] = useState<number | ''>('');
  const [cantidad, setCantidad] = useState('');
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const insumo = items.find(i => i.insumo_id === insumoId);
  const destinos = sucursales.filter(s => s.id !== sucursalOrigen);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!insumoId || !destino || !(Number(cantidad) > 0)) {
      setError('Elige el insumo, la sucursal destino y una cantidad mayor a cero.');
      return;
    }
    if (insumo && Number(cantidad) > insumo.stock_actual) {
      setError(`Solo hay ${insumo.stock_actual} ${insumo.unidad_medida} en la sucursal de origen.`);
      return;
    }
    setEnviando(true);
    try {
      await apiClient.post('/api/admin/inventario/transferencia', {
        insumo_id: Number(insumoId),
        desde_sucursal: sucursalOrigen,
        hacia_sucursal: Number(destino),
        cantidad: Number(cantidad),
        nota: nota.trim() || undefined,
      });
      onHecha();
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'No se pudo hacer la transferencia.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form className="admin-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Transferir stock a otra sucursal</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <p className="form-hint" style={{ marginBottom: 14 }}>
            La mercadería sale de esta sucursal y entra en la otra. El stock total del negocio
            no cambia y quedan dos movimientos para auditarlo.
          </p>
          <div className="form-group">
            <label>Insumo</label>
            <select value={insumoId} onChange={e => setInsumoId(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Selecciona…</option>
              {items.filter(i => i.stock_actual > 0).map(i => (
                <option key={i.insumo_id} value={i.insumo_id}>
                  {i.nombre} — {i.stock_actual} {i.unidad_medida}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Sucursal destino</label>
            <select value={destino} onChange={e => setDestino(e.target.value ? Number(e.target.value) : '')}>
              <option value="">Selecciona…</option>
              {destinos.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Cantidad {insumo ? `(${insumo.unidad_medida})` : ''}</label>
            <input
              type="number" step="0.01" min="0"
              value={cantidad}
              onChange={e => setCantidad(e.target.value)}
              max={insumo?.stock_actual}
            />
          </div>
          <div className="form-group">
            <label>Nota (opcional)</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: reposición de fin de semana" />
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={enviando}>
            {enviando ? 'Transfiriendo…' : 'Transferir'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function InventarioSucursalPage() {
  const { data: sucursales = [] } = useSucursales();
  const [sucursalId, setSucursalId] = useState<number | null>(null);
  const [items, setItems] = useState<ItemStock[] | null>(null);
  const [error, setError] = useState('');
  const [transferir, setTransferir] = useState(false);

  // Al cargar, se posiciona en la primera sucursal disponible.
  useEffect(() => {
    if (sucursalId == null && sucursales.length > 0) setSucursalId(sucursales[0].id);
  }, [sucursales, sucursalId]);

  const cargar = async (id: number) => {
    setError('');
    try {
      const res = await apiClient.get(`/api/admin/inventario/sucursal?sucursal=${id}`);
      setItems(res.data?.items ?? []);
    } catch {
      setItems([]);
      setError('No se pudo cargar el inventario de la sucursal.');
    }
  };

  useEffect(() => { if (sucursalId != null) cargar(sucursalId); }, [sucursalId]);

  const valorizado = useMemo(
    () => (items ?? []).reduce((acc, i) => acc + i.stock_actual * i.costo_promedio, 0),
    [items],
  );
  const criticos = (items ?? []).filter(i => i.nivel === 'critico').length;
  const bajos = (items ?? []).filter(i => i.nivel === 'bajo').length;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Inventario por sucursal</h1>
          <p>Stock, costo y alertas de cada local por separado.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <label className="sucursal-selector">
            <span>Sucursal</span>
            <select
              value={sucursalId ?? ''}
              onChange={e => setSucursalId(e.target.value ? Number(e.target.value) : null)}
            >
              {sucursales.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <button
            className="admin-btn primary"
            onClick={() => setTransferir(true)}
            disabled={sucursales.length < 2 || !items?.length}
            title={sucursales.length < 2 ? 'Necesitas al menos dos sucursales' : ''}
          >
            Transferir stock
          </button>
        </div>
      </div>

      {transferir && sucursalId != null && (
        <TransferenciaModal
          sucursalOrigen={sucursalId}
          items={items ?? []}
          onClose={() => setTransferir(false)}
          onHecha={() => cargar(sucursalId)}
        />
      )}

      {error && <div className="gate-warning" style={{ marginBottom: 12 }}>{error}</div>}

      {!items ? <EmptyState title="Cargando inventario…" /> : (
        <>
          <div className="kpi-grid">
            <KpiCard label="Insumos en este local" value={items.length} />
            <KpiCard label="Inventario valorizado" value={<MoneyText value={valorizado} />} highlight />
            <KpiCard label="Stock bajo" value={bajos} accent="var(--amber)" />
            <KpiCard label="Crítico" value={criticos} accent="var(--danger)" />
          </div>

          <DataTable
            data={items}
            emptyTitle="Esta sucursal todavía no tiene inventario cargado"
            rowKey={(row: ItemStock) => row.insumo_id}
            columns={[
              { key: 'nombre', header: 'Insumo', render: (row: ItemStock) => (
                <div>
                  <div className="admin-cell-title">{row.nombre}</div>
                  {row.proveedor && <div className="admin-cell-sub">{row.proveedor}</div>}
                </div>
              )},
              { key: 'stock', header: 'Stock', className: 'num', render: (row: ItemStock) => `${row.stock_actual} ${row.unidad_medida}` },
              { key: 'nivel', header: 'Estado', render: (row: ItemStock) => (
                <StatusBadge status={NIVEL_META[row.nivel].status} label={NIVEL_META[row.nivel].label} />
              )},
              { key: 'minimo', header: 'Mínimo', className: 'num', render: (row: ItemStock) => row.stock_minimo },
              { key: 'costo', header: 'Costo prom.', className: 'num', render: (row: ItemStock) => <MoneyText value={row.costo_promedio} /> },
              { key: 'valor', header: 'Valorizado', className: 'num', render: (row: ItemStock) => <MoneyText value={row.stock_actual * row.costo_promedio} /> },
            ]}
          />
        </>
      )}
    </AdminPanel>
  );
}
