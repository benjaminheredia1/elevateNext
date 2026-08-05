'use client';

import { FormEvent, useEffect, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import KpiCard from '@/components/ui/KpiCard';
import MoneyText from '@/components/ui/MoneyText';
import DataTable from '@/components/ui/DataTable';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import {
  useSucursales, useGuardarSucursal, useEstadoSucursal,
  type Sucursal, type SucursalPayload,
} from '@/hooks/sucursales';

const EMPTY_FORM: SucursalPayload = { nombre: '', direccion: '' };

function SucursalModal({ value, onClose, onSubmit, saving, error }: {
  value: SucursalPayload | null;
  onClose: () => void;
  onSubmit: (value: SucursalPayload) => void;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<SucursalPayload>(EMPTY_FORM);

  useEffect(() => { setForm(value ?? EMPTY_FORM); }, [value]);
  if (!value) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      ...form,
      nombre: form.nombre.trim(),
      direccion: form.direccion?.trim() || undefined,
      // Vacío se manda como undefined: es la forma de borrar el dato sin que
      // el schema lo rechace por longitud mínima.
      telefono: form.telefono?.trim() || undefined,
      maps_url: form.maps_url?.trim() || undefined,
    });
  };

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <form onSubmit={submit} className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>{form.id ? 'Editar sucursal' : 'Nueva sucursal'}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>×</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <div className="form-group full">
              <label>Nombre</label>
              <input
                value={form.nombre}
                onChange={e => setForm({ ...form, nombre: e.target.value })}
                placeholder="Ej: Sucursal Norte"
                required
              />
            </div>
            <div className="form-group full">
              <label>Dirección (opcional)</label>
              <input
                value={form.direccion ?? ''}
                onChange={e => setForm({ ...form, direccion: e.target.value })}
              />
            </div>
            <div className="form-group full">
              <label>Teléfono / WhatsApp (opcional)</label>
              <input
                inputMode="tel"
                value={form.telefono ?? ''}
                onChange={e => setForm({ ...form, telefono: e.target.value })}
                placeholder="Ej: 70012345"
              />
              <span className="form-hint">
                Es el contacto de esta sucursal. En la tienda aparece como botón de WhatsApp
                cuando el cliente la tiene seleccionada.
              </span>
            </div>
            <div className="form-group full">
              <label>Enlace de Google Maps (opcional)</label>
              <input
                type="url"
                value={form.maps_url ?? ''}
                onChange={e => setForm({ ...form, maps_url: e.target.value })}
                placeholder="https://maps.app.goo.gl/..."
              />
              <span className="form-hint">
                Pega el enlace de &quot;Compartir&quot; de Google Maps del local. Solo se aceptan
                enlaces de Google Maps.
              </span>
            </div>
            <div className="form-group">
              <label>Latitud (opcional)</label>
              <input
                type="number" step="any"
                value={form.lat ?? ''}
                onChange={e => setForm({ ...form, lat: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>
            <div className="form-group">
              <label>Longitud (opcional)</label>
              <input
                type="number" step="any"
                value={form.lng ?? ''}
                onChange={e => setForm({ ...form, lng: e.target.value === '' ? undefined : Number(e.target.value) })}
              />
            </div>

            {/* Tarifa de delivery del local. El checkout la usa para cotizar el
                envío según la distancia hasta donde el cliente marca el pin. */}
            <div className="form-group full">
              <span className="form-hint" style={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Tarifa de delivery
              </span>
            </div>
            <div className="form-group">
              <label>Base (Bs)</label>
              <input
                type="number" step="0.5" min="0"
                value={form.envio_base ?? ''}
                onChange={e => setForm({ ...form, envio_base: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="8"
              />
            </div>
            <div className="form-group">
              <label>Km incluidos en la base</label>
              <input
                type="number" step="0.5" min="0"
                value={form.envio_km_incluidos ?? ''}
                onChange={e => setForm({ ...form, envio_km_incluidos: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="2.5"
              />
            </div>
            <div className="form-group">
              <label>Por km adicional (Bs)</label>
              <input
                type="number" step="0.5" min="0"
                value={form.envio_por_km ?? ''}
                onChange={e => setForm({ ...form, envio_por_km: e.target.value === '' ? undefined : Number(e.target.value) })}
                placeholder="2.5"
              />
            </div>
            <div className="form-group">
              <label>Tope del envío (Bs)</label>
              <input
                type="number" step="0.5" min="0"
                value={form.envio_maximo ?? ''}
                onChange={e => setForm({ ...form, envio_maximo: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Sin tope"
              />
            </div>
            <div className="form-group full">
              <label>Radio de reparto (km)</label>
              <input
                type="number" step="0.5" min="0"
                value={form.envio_radio_km ?? ''}
                onChange={e => setForm({ ...form, envio_radio_km: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="Sin límite"
              />
              <span className="form-hint">
                Más lejos que esto el checkout no cotiza y le ofrece retiro en el local.
                Referencias del rubro: PedidosYa cobra Bs 5 los primeros 5 km y Bs 1 por km extra;
                la tarifa municipal de Cochabamba, Bs 6,50 el primer km y Bs 2 por km adicional.
              </span>
            </div>
          </div>
          {!form.id && (
            <p className="form-hint" style={{ marginTop: 12 }}>
              Al crearla se generan automáticamente sus cuentas de caja (Efectivo y QR),
              necesarias para poder abrir turno. Empieza sin productos ni stock.
            </p>
          )}
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function SucursalesPage() {
  const { data: sucursales = [], isLoading, isError } = useSucursales(true);
  const guardar = useGuardarSucursal();
  const estado = useEstadoSucursal();
  const [form, setForm] = useState<SucursalPayload | null>(null);
  const [error, setError] = useState('');

  const activas = sucursales.filter(s => s.activa).length;
  const ventasTotales = sucursales.reduce((acc, s) => acc + s.ventas, 0);

  const submit = (value: SucursalPayload) => {
    setError('');
    guardar.mutate(value, {
      onSuccess: () => setForm(null),
      onError: (e: any) => setError(e?.response?.data?.error ?? 'No se pudo guardar la sucursal.'),
    });
  };

  const cambiarEstado = (sucursal: Sucursal) => {
    setError('');
    estado.mutate(
      { id: sucursal.id, activa: !sucursal.activa },
      { onError: (e: any) => setError(e?.response?.data?.error ?? 'No se pudo cambiar el estado.') },
    );
  };

  return (
    <AdminPanel>
      <div className="admin-page-header">
        <div>
          <h1>Sucursales</h1>
          <p>Locales del negocio. Cada uno tiene su caja, su stock y sus precios.</p>
        </div>
        <button className="admin-btn primary" onClick={() => { setError(''); setForm(EMPTY_FORM); }}>
          + Nueva sucursal
        </button>
      </div>

      <SucursalModal
        value={form}
        onClose={() => setForm(null)}
        onSubmit={submit}
        saving={guardar.isPending}
        error={error}
      />

      {isLoading ? <EmptyState title="Cargando sucursales…" />
        : isError ? <EmptyState title="No se pudieron cargar las sucursales" />
        : (
          <>
            <div className="kpi-grid">
              <KpiCard label="Sucursales" value={sucursales.length} />
              <KpiCard label="Activas" value={activas} accent="var(--fresh)" />
              <KpiCard label="Ventas registradas" value={ventasTotales} highlight />
            </div>

            {error && !form && <div className="gate-warning" style={{ marginBottom: 12 }}>{error}</div>}

            <DataTable
              data={sucursales}
              emptyTitle="Sin sucursales registradas"
              rowKey={(row: Sucursal) => row.id}
              columns={[
                { key: 'nombre', header: 'Sucursal', render: (row: Sucursal) => (
                  <div>
                    <div className="admin-cell-title">{row.nombre}</div>
                    {row.direccion && <div className="admin-cell-sub">{row.direccion}</div>}
                  </div>
                )},
                { key: 'contacto', header: 'Contacto', render: (row: Sucursal) => (
                  <div>
                    <div>{row.telefono || <span className="dim">Sin teléfono</span>}</div>
                    {row.maps_url && (
                      <a className="admin-cell-sub" href={row.maps_url} target="_blank" rel="noopener noreferrer">
                        Ver en Maps
                      </a>
                    )}
                  </div>
                )},
                { key: 'estado', header: 'Estado', render: (row: Sucursal) => (
                  <StatusBadge status={row.activa ? 'abierto' : 'cerrado'} label={row.activa ? 'Activa' : 'Desactivada'} />
                )},
                { key: 'usuarios', header: 'Usuarios', className: 'num', render: (row: Sucursal) => row.usuarios },
                { key: 'ventas', header: 'Ventas', className: 'num', render: (row: Sucursal) => row.ventas },
                { key: 'turnos', header: 'Turnos', className: 'num', render: (row: Sucursal) => row.turnos },
                { key: 'caja', header: 'Saldo en caja', className: 'num', render: (row: Sucursal) => (
                  <MoneyText value={row.cuentas.reduce((acc, c) => acc + c.saldo, 0)} />
                )},
                { key: 'acciones', header: '', render: (row: Sucursal) => (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      className="admin-btn ghost"
                      onClick={() => { setError(''); setForm({
                        id: row.id,
                        nombre: row.nombre,
                        direccion: row.direccion ?? '',
                        telefono: row.telefono ?? '',
                        maps_url: row.maps_url ?? '',
                        lat: row.lat ?? undefined,
                        lng: row.lng ?? undefined,
                        envio_base: row.envio_base,
                        envio_km_incluidos: row.envio_km_incluidos,
                        envio_por_km: row.envio_por_km,
                        envio_maximo: row.envio_maximo,
                        envio_radio_km: row.envio_radio_km,
                      }); }}
                    >
                      Editar
                    </button>
                    <button
                      className="admin-btn secondary"
                      onClick={() => cambiarEstado(row)}
                      disabled={estado.isPending}
                    >
                      {row.activa ? 'Desactivar' : 'Activar'}
                    </button>
                  </div>
                )},
              ]}
            />

            <p className="form-hint" style={{ marginTop: 12 }}>
              Las sucursales no se eliminan: se desactivan. Su histórico de ventas debe conservarse.
            </p>
          </>
        )}
    </AdminPanel>
  );
}
