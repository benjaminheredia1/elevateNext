'use client';

import { FormEvent, useEffect, useState } from 'react';
import EmptyState from '@/components/ui/EmptyState';
import {
  useAsignarPrivilegios, useClientesDirectorio, useCrearClienteCaja, useEditarCliente, usePrivilegiosCaja,
  type ClienteResultado, type CrearClienteCajaInput, type PrivilegioResumen,
} from '@/hooks/caja';

function NuevoClienteModal({ catalogo, onClose, onSubmit, saving, error }: {
  catalogo: PrivilegioResumen[];
  onClose: () => void;
  onSubmit: (datos: CrearClienteCajaInput) => void;
  saving: boolean;
  error: string | null;
}) {
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [nit, setNit] = useState('');
  const [privilegios, setPrivilegios] = useState<number[]>([]);

  const toggle = (id: number) =>
    setPrivilegios(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    onSubmit({
      nombre: nombre.trim(),
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      nit: nit.trim() || undefined,
      privilegio_ids: privilegios,
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
          {catalogo.length > 0 && (
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>Privilegios (opcional)</span>
              {catalogo.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={privilegios.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span>
                    <strong>{p.nombre}</strong> · {p.porcentaje}% de descuento
                    {p.descripcion ? <span className="form-hint" style={{ display: 'block' }}>{p.descripcion}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
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

function PrivilegiosModal({ cliente, catalogo, onClose, onSubmit, saving, error }: {
  cliente: ClienteResultado;
  catalogo: PrivilegioResumen[];
  onClose: () => void;
  onSubmit: (ids: number[]) => void;
  saving: boolean;
  error: string | null;
}) {
  const [seleccion, setSeleccion] = useState<number[]>(() => (cliente.privilegios ?? []).map(p => p.id));

  const toggle = (id: number) =>
    setSeleccion(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="admin-modal-overlay" onMouseDown={onClose}>
      <div className="admin-modal compact" onMouseDown={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h2>Privilegios · {cliente.nombre}</h2>
          <button type="button" className="admin-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="admin-modal-body">
          {catalogo.length === 0 ? (
            <p className="form-hint">El administrador aún no publicó privilegios activos.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {catalogo.map(p => (
                <label key={p.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={seleccion.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span>
                    <strong>{p.nombre}</strong> · {p.porcentaje}% de descuento
                    {p.descripcion ? <span className="form-hint" style={{ display: 'block' }}>{p.descripcion}</span> : null}
                  </span>
                </label>
              ))}
              <span className="form-hint">
                El cambio queda registrado en auditoría con tu usuario, el cliente y el detalle.
              </span>
            </div>
          )}
          {error && <div className="gate-warning" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="admin-modal-footer">
          <button type="button" className="admin-btn ghost" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            className="admin-btn primary"
            disabled={saving || catalogo.length === 0}
            onClick={() => onSubmit(seleccion)}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ClientesCajaPage() {
  const [busqueda, setBusqueda] = useState('');
  const [busquedaDebounced, setBusquedaDebounced] = useState('');
  const [modalCliente, setModalCliente] = useState<ClienteResultado | null>(null);
  const [editCliente, setEditCliente] = useState<ClienteResultado | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busqueda), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const clientesQuery = useClientesDirectorio(busquedaDebounced);
  const privilegiosQuery = usePrivilegiosCaja();
  const asignar = useAsignarPrivilegios();
  const editar = useEditarCliente();
  const crear = useCrearClienteCaja();

  const clientes = clientesQuery.data ?? [];
  const catalogo = privilegiosQuery.data ?? [];

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

  const guardar = async (ids: number[]) => {
    if (!modalCliente) return;
    setModalError(null);
    try {
      await asignar.mutateAsync({ clienteId: modalCliente.id, privilegioIds: ids });
      setMsg(`Privilegios de ${modalCliente.nombre} actualizados.`);
      setModalCliente(null);
      setTimeout(() => setMsg(null), 3500);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setModalError(e?.response?.data?.error ?? 'No se pudo guardar. Intenta de nuevo.');
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Clientes</h1>
          <p>Directorio de clientes y asignación de privilegios publicados por el administrador.</p>
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
                <th>Privilegios</th>
                <th>Deuda</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.nombre}</strong></td>
                  <td className="dim">{[c.telefono, c.nit].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    {(c.privilegios ?? []).length === 0
                      ? <span className="dim">Sin privilegios</span>
                      : (c.privilegios ?? []).map(p => (
                          <span key={p.id} className="historial-pill" style={{ marginRight: 6 }}>
                            {p.nombre} · {p.porcentaje}%
                          </span>
                        ))}
                  </td>
                  <td>
                    {(c.deuda_saldo ?? 0) > 0
                      ? <span style={{ color: 'var(--amber)', fontWeight: 600 }}>Bs {(c.deuda_saldo ?? 0).toFixed(2)}</span>
                      : <span className="dim">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="admin-btn ghost"
                      style={{ marginRight: 6 }}
                      onClick={() => { setModalError(null); setEditCliente(c); }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="admin-btn secondary"
                      onClick={() => { setModalError(null); setModalCliente(c); }}
                    >
                      Privilegios
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
          catalogo={catalogo}
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

      {modalCliente && (
        <PrivilegiosModal
          cliente={modalCliente}
          catalogo={catalogo}
          onClose={() => setModalCliente(null)}
          onSubmit={guardar}
          saving={asignar.isPending}
          error={modalError}
        />
      )}
    </div>
  );
}
