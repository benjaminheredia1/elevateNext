'use client';

import { FormEvent, useEffect, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import {
  useClientesDirectorio, useCrearClienteCaja, useEditarCliente,
  type ClienteResultado, type CrearClienteCajaInput,
} from '@/hooks/caja';

function NuevoClienteModal({ onClose, onSubmit, saving, error }: {
  onClose: () => void;
  onSubmit: (datos: CrearClienteCajaInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [nit, setNit] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSubmit({
      nombre: nombre.trim(),
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      nit: nit.trim() || undefined,
    });
  };

  return (
    <div className="admin-modal-overlay" onMouseDown={onClose}>
      <form className="admin-modal compact" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Agregar cliente</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <label className="form-group full"><span>Nombre</span><input value={nombre} onChange={e => setNombre(e.target.value)} required autoFocus /></label>
            <label className="form-group"><span>Celular</span><input inputMode="numeric" value={telefono} onChange={e => setTelefono(e.target.value.replace(/\D/g, ''))} placeholder="Opcional" /></label>
            <label className="form-group"><span>NIT / C.I.</span><input inputMode="numeric" value={nit} onChange={e => setNit(e.target.value.replace(/\D/g, ''))} placeholder="Opcional" /></label>
            <label className="form-group full"><span>Correo</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Opcional" /></label>
          </div>
          <span className="form-hint" style={{ display: 'block', marginTop: 10 }}>
            El alta queda registrada en auditoría. Si el celular, email o NIT ya pertenece a otro cliente, no se creará un duplicado.
          </span>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Agregar cliente'}</button>
        </div>
      </form>
    </div>
  );
}

function EditarClienteModal({ cliente, onClose, onSubmit, saving, error }: {
  cliente: ClienteResultado;
  onClose: () => void;
  onSubmit: (datos: { nombre: string; telefono: string; email: string; nit: string }) => void;
  saving: boolean;
  error: string | null;
}) {
  const [nombre, setNombre] = useState(cliente.nombre);
  const [telefono, setTelefono] = useState(cliente.telefono ?? '');
  const [email, setEmail] = useState(cliente.email ?? '');
  const [nit, setNit] = useState(cliente.nit ?? '');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSubmit({ nombre: nombre.trim(), telefono: telefono.trim(), email: email.trim(), nit: nit.trim() });
  };

  return (
    <div className="admin-modal-overlay" onMouseDown={onClose}>
      <form className="admin-modal compact" onMouseDown={e => e.stopPropagation()} onSubmit={submit}>
        <div className="admin-modal-header">
          <h2>Editar cliente · {cliente.nombre}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          <div className="form-grid">
            <label className="form-group full"><span>Nombre</span><input value={nombre} onChange={e => setNombre(e.target.value)} required /></label>
            <label className="form-group"><span>Celular</span><input inputMode="numeric" value={telefono} onChange={e => setTelefono(e.target.value.replace(/\D/g, ''))} placeholder="Sin registrar" /></label>
            <label className="form-group"><span>NIT / C.I.</span><input inputMode="numeric" value={nit} onChange={e => setNit(e.target.value.replace(/\D/g, ''))} placeholder="Sin registrar" /></label>
            <label className="form-group full"><span>Correo</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Sin registrar" /></label>
            <span className="form-hint">El cambio queda registrado en auditoría con el antes y el después.</span>
          </div>
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

export default function ClientesCajaPage() {
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [editCliente, setEditCliente] = useState<ClienteResultado | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const clientesQuery = useClientesDirectorio(busquedaDebounced);
  const editar = useEditarCliente();
  const crear = useCrearClienteCaja();

  const clientes = clientesQuery.data ?? [];

  const guardarEdicion = async (datos: { nombre: string; telefono: string; email: string; nit: string }) => {
    if (!editCliente) return;
    setModalError(null);
    try {
      await editar.mutateAsync({ clienteId: editCliente.id, datos });
      setMsg(`Datos de ${datos.nombre} actualizados.`);
      setEditCliente(null);
      setTimeout(() => setMsg(null), 3500);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setModalError(e?.response?.data?.error ?? 'No se pudo guardar. Intenta de nuevo.');
    }
  };

  const guardarNuevo = async (datos: CrearClienteCajaInput) => {
    setModalError(null);
    try {
      const creado = await crear.mutateAsync(datos);
      setMsg(`Cliente ${creado.nombre} registrado.`);
      setNuevoAbierto(false);
      setTimeout(() => setMsg(null), 3500);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setModalError(e?.response?.data?.error ?? 'No se pudo registrar. Intenta de nuevo.');
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Clientes</h1>
          <p>Directorio de clientes. Los privilegios (descuentos) se aplican por venta desde el punto de venta.</p>
        </div>
        <button
          type="button"
          className="admin-btn primary"
          onClick={() => { setModalError(null); setNuevoAbierto(true); }}
        >
          + Agregar cliente
        </button>
      </div>

      {msg && (
        <div className="gate-warning" style={{ background: 'rgba(31,169,113,.12)', borderColor: 'rgba(31,169,113,.35)', color: 'var(--fresh)', marginBottom: 12 }}>
          ✓ {msg}
        </div>
      )}

      <div className="admin-toolbar">
        <input
          className="admin-search-field"
          placeholder="Buscar por nombre, celular o NIT…"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
        />
      </div>

      {clientesQuery.isLoading ? (
        <EmptyState title="Cargando clientes..." />
      ) : clientes.length === 0 ? (
        <EmptyState title="Sin clientes" hint={busquedaDebounced ? `No hay resultados para "${busquedaDebounced}".` : 'Aún no hay clientes registrados.'} />
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Correo</th>
                <th>Deuda</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong></td>
                  <td className="dim">{[c.telefono, c.nit].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="dim">{c.email ?? '—'}</td>
                  <td>
                    {(c.deuda_saldo ?? 0) > 0
                      ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Bs {(c.deuda_saldo ?? 0).toFixed(2)}</span>
                      : <span className="dim">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      onClick={() => { setModalError(null); setEditCliente(c); }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nuevoAbierto && (
        <NuevoClienteModal
          onClose={() => setNuevoAbierto(false)}
          onSubmit={guardarNuevo}
          saving={crear.isPending}
          error={modalError}
        />
      )}

      {editCliente && (
        <EditarClienteModal
          cliente={editCliente}
          onClose={() => setEditCliente(null)}
          onSubmit={guardarEdicion}
          saving={editar.isPending}
          error={modalError}
        />
      )}
    </div>
  );
}
