'use client';

import { FormEvent, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import {
  type CuentaPayload,
  type EstadoCuenta,
  type TipoCuenta,
  useCrearCuenta,
  useCuentas,
  useRegistrarPago,
  useDeudasVencidas,
  useEnviarAlertaDeudas,
} from '@/hooks/cuentas-corrientes';
import { useAdminClientes } from '@/hooks/admin-clientes';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';

const ESTADOS: { label: string; value: EstadoCuenta }[] = [
  { label: 'Todas', value: 'TODAS' },
  { label: 'Pendientes', value: 'PENDIENTE' },
  { label: 'Parciales', value: 'PARCIAL' },
  { label: 'Completadas', value: 'PAGADA' },
];

function estadoToStatus(e: string): 'abierto' | 'cerrado' | 'pendiente' {
  if (e === 'PAGADA') return 'cerrado';
  if (e === 'PARCIAL') return 'pendiente';
  return 'abierto';
}

function estadoLabel(e: string) {
  if (e === 'PAGADA') return 'Pagada';
  if (e === 'PARCIAL') return 'Parcial';
  return 'Pendiente';
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-BO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function isVencida(row: any): boolean {
  return row.vencido === true || (row.vencimiento && new Date(row.vencimiento) < new Date() && row.estado !== 'PAGADA');
}

/* ---- Modal nueva cuenta ---- */
function NuevaCuentaModal({
  tipo,
  onClose,
  onSubmit,
  saving,
}: {
  tipo: TipoCuenta;
  onClose: () => void;
  onSubmit: (v: CuentaPayload) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<CuentaPayload>({
    tipo,
    contraparte: '',
    concepto: '',
    monto: 0,
    vencimiento: null,
    cliente_id: null,
  });

  const { data: clientesData } = useAdminClientes('', undefined);
  const clientes: any[] = clientesData?.items ?? [];

  const handleClienteChange = (id: string) => {
    const clienteId = id ? Number(id) : null;
    const cliente = clientes.find((c: any) => c.id === clienteId);
    setForm(f => ({
      ...f,
      cliente_id: clienteId,
      contraparte: cliente ? cliente.nombre : f.contraparte,
    }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit({ ...form, monto: Number(form.monto) });
  };

  return (
    <div className="admin-modal-overlay">
      <form onSubmit={submit} className="admin-modal">
        <div className="admin-modal-header">
          <h2>{tipo === 'POR_COBRAR' ? 'Nueva cuenta por cobrar' : 'Nueva cuenta por pagar'}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            {tipo === 'POR_COBRAR' && clientes.length > 0 && (
              <div className="form-group full">
                <label>Cliente registrado (opcional)</label>
                <select value={form.cliente_id ?? ''} onChange={e => handleClienteChange(e.target.value)}>
                  <option value="">— Sin cliente registrado —</option>
                  {clientes.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.telefono ? ` · ${c.telefono}` : ''}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group full">
              <label>{tipo === 'POR_COBRAR' ? 'Deudor' : 'Acreedor'}</label>
              <input
                value={form.contraparte}
                onChange={e => setForm({ ...form, contraparte: e.target.value })}
                placeholder="Nombre de la persona o empresa"
                required
              />
            </div>
            <div className="form-group full">
              <label>Concepto</label>
              <input
                value={form.concepto}
                onChange={e => setForm({ ...form, concepto: e.target.value })}
                placeholder="Descripción de la deuda"
                required
              />
            </div>
            <div className="form-group">
              <label>Monto (Bs.)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={form.monto}
                onChange={e => setForm({ ...form, monto: Number(e.target.value) })}
                required
              />
            </div>
            <div className="form-group">
              <label>Fecha límite de pago</label>
              <input
                type="date"
                value={form.vencimiento ?? ''}
                onChange={e => setForm({ ...form, vencimiento: e.target.value || null })}
              />
            </div>
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

/* ---- Modal pago ---- */
function PagoModal({
  cuenta,
  onClose,
  onSubmit,
  saving,
}: {
  cuenta: { id: number; contraparte: string; saldo: number } | null;
  onClose: () => void;
  onSubmit: (id: number, monto: number) => void;
  saving: boolean;
}) {
  const [monto, setMonto] = useState(0);
  if (!cuenta) return null;
  return (
    <div className="admin-modal-overlay">
      <form onSubmit={e => { e.preventDefault(); onSubmit(cuenta.id, Number(monto)); }} className="admin-modal compact">
        <div className="admin-modal-header">
          <h2>Registrar pago</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="finance-modal-note">{cuenta.contraparte} · Saldo: <strong><MoneyText value={cuenta.saldo} /></strong></div>
          <div className="form-group">
            <label>Monto a pagar (Bs.)</label>
            <input
              type="number"
              min="0.01"
              max={cuenta.saldo}
              step="0.01"
              value={monto || ''}
              onChange={e => setMonto(Number(e.target.value))}
              required
              autoFocus
            />
          </div>
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>Confirmar</button>
        </div>
      </form>
    </div>
  );
}

/* ---- Vista principal reutilizable ---- */
export default function CuentasCorrientesView({ tipo }: { tipo: TipoCuenta }) {
  const [filtro, setFiltro] = useState<EstadoCuenta>('TODAS');
  const [nuevaOpen, setNuevaOpen] = useState(false);
  const [pagando, setPagando] = useState<{ id: number; contraparte: string; saldo: number } | null>(null);

  const cuentas = useCuentas(tipo, filtro);
  const crear = useCrearCuenta();
  const pago = useRegistrarPago();
  const deudasVencidas = useDeudasVencidas();
  const enviarAlerta = useEnviarAlertaDeudas();

  const items = cuentas.data?.items ?? [];
  const resumen = cuentas.data?.resumen;
  const esCobrar = tipo === 'POR_COBRAR';
  const cantVencidas: number = resumen?.vencidas ?? 0;

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>{esCobrar ? 'Cuentas por Cobrar' : 'Cuentas por Pagar'}</h1>
          <p>{esCobrar ? 'Saldos pendientes de clientes y deudores.' : 'Obligaciones con proveedores y acreedores.'}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {esCobrar && cantVencidas > 0 && (
            <button
              className="admin-btn danger"
              onClick={() => enviarAlerta.mutate()}
              disabled={enviarAlerta.isPending}
              title="Enviar alerta WhatsApp de deudas vencidas"
            >
              {enviarAlerta.isPending ? 'Enviando…' : `⚠️ ${cantVencidas} vencida${cantVencidas > 1 ? 's' : ''} · Notificar`}
            </button>
          )}
          <button className="admin-btn primary" onClick={() => setNuevaOpen(true)}>Nueva cuenta</button>
        </div>
      </div>

      {cuentas.isLoading ? (
        <EmptyState title="Cargando..." />
      ) : cuentas.isError ? (
        <EmptyState title="Error al cargar cuentas" />
      ) : (
        <>
          <div className="kpi-grid">
            {esCobrar ? (
              <>
                <KpiCard label="Por cobrar" value={<MoneyText value={resumen?.por_cobrar ?? 0} />} highlight />
                <KpiCard label="Cobrado" value={<MoneyText value={resumen?.cobrado ?? 0} />} />
                <KpiCard label="Total registrado" value={<MoneyText value={resumen?.total_cobrar ?? 0} />} />
                {cantVencidas > 0 && (
                  <KpiCard label="Vencidas" value={cantVencidas} accent="var(--danger)" />
                )}
              </>
            ) : (
              <>
                <KpiCard label="Por pagar" value={<MoneyText value={resumen?.por_pagar ?? 0} />} highlight />
                <KpiCard label="Pagado" value={<MoneyText value={resumen?.pagado ?? 0} />} />
                <KpiCard label="Total registrado" value={<MoneyText value={resumen?.total_pagar ?? 0} />} />
              </>
            )}
          </div>

          {/* Filtros */}
          <div className="finance-filter-row">
            {ESTADOS.map(e => (
              <button
                key={e.value}
                className={`finance-chip ${filtro === e.value ? 'active' : ''}`}
                onClick={() => setFiltro(e.value)}
              >
                {e.label}
              </button>
            ))}
          </div>

          <DataTable
            data={items}
            emptyTitle="Sin cuentas registradas"
            rowKey={(row: any) => row.id}
            columns={[
              {
                key: 'contraparte',
                header: esCobrar ? 'Deudor' : 'Acreedor',
                render: (row: any) => (
                  <div>
                    <div className="admin-cell-title">
                      {row.contraparte}
                      {row.transaccion_id && (
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--info)', background: 'rgba(59,130,196,.12)', padding: '2px 6px', borderRadius: 4 }}>
                          Fiado #{row.transaccion_id}
                        </span>
                      )}
                    </div>
                    {row.cliente && (
                      <div className="admin-cell-sub">{row.cliente.telefono ?? ''}</div>
                    )}
                  </div>
                ),
              },
              { key: 'concepto', header: 'Concepto', render: (row: any) => row.concepto },
              {
                key: 'vencimiento',
                header: 'Vencimiento',
                render: (row: any) => (
                  <span style={isVencida(row) ? { color: 'var(--danger)', fontWeight: 600 } : {}}>
                    {fmt(row.vencimiento)}
                    {isVencida(row) && ' ⚠️'}
                  </span>
                ),
              },
              {
                key: 'estado',
                header: 'Estado',
                render: (row: any) => <StatusBadge status={estadoToStatus(row.estado)} label={estadoLabel(row.estado)} />,
              },
              { key: 'monto', header: 'Total', className: 'num', render: (row: any) => <MoneyText value={row.monto} /> },
              { key: 'pagado', header: 'Pagado', className: 'num', render: (row: any) => <MoneyText value={row.monto_pagado} /> },
              { key: 'saldo', header: 'Saldo', className: 'num', render: (row: any) => <MoneyText value={row.saldo} /> },
              {
                key: 'acciones',
                header: '',
                render: (row: any) => (
                  <div className="admin-actions">
                    <button
                      className="admin-btn ghost"
                      disabled={row.estado === 'PAGADA' || pago.isPending}
                      onClick={() => setPagando({ id: row.id, contraparte: row.contraparte, saldo: row.saldo })}
                    >
                      Registrar pago
                    </button>
                  </div>
                ),
              },
            ]}
          />
        </>
      )}

      {nuevaOpen && (
        <NuevaCuentaModal
          tipo={tipo}
          onClose={() => setNuevaOpen(false)}
          onSubmit={payload => crear.mutate(payload, { onSuccess: () => setNuevaOpen(false) })}
          saving={crear.isPending}
        />
      )}

      <PagoModal
        cuenta={pagando}
        onClose={() => setPagando(null)}
        onSubmit={(id, monto) => pago.mutate({ id, monto }, { onSuccess: () => setPagando(null) })}
        saving={pago.isPending}
      />
    </AdminPanel>
  );
}
