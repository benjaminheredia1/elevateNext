'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertPopup from '@/components/AlertPopup';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import { useBuscarClientes, useRegistrarVenta, type ClienteResultado } from '@/hooks/caja';

type Metodo = 'EFECTIVO' | 'QR' | 'TARJETA';

interface Producto {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  disponible: boolean;
  categoria_id?: { categoria: { id: number; nombre: string } }[];
}

interface CartItem extends Producto {
  cantidad: number;
}

export default function VentaCajaPage() {
  const router = useRouter();
  const registrarVenta = useRegistrarVenta();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filterCat, setFilterCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState<Metodo>('EFECTIVO');
  const [esCortesia, setEsCortesia] = useState(false);
  const [anonimo, setAnonimo] = useState(false);
  const [cNombre, setCNombre] = useState('');
  const [cTelefono, setCTelefono] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cNit, setCNit] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteResultado | null>(null);
  const [modoManual, setModoManual] = useState(false);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaClienteDebounced, setBusquedaClienteDebounced] = useState('');
  const [esFiado, setEsFiado] = useState(false);
  const [fiadoVencimiento, setFiadoVencimiento] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alert, setAlert] = useState<{ title: string; description: string; type: 'success' | 'error' | 'warning' } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaClienteDebounced(busquedaCliente), 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  const clientesQuery = useBuscarClientes(busquedaClienteDebounced);
  const resultadosClientes = clientesQuery.data ?? [];

  const seleccionarCliente = (c: ClienteResultado) => {
    setClienteSeleccionado(c);
    setCNombre(c.nombre);
    setCTelefono(c.telefono ?? '');
    setCEmail(c.email ?? '');
    setCNit(c.nit ?? '');
    setBusquedaCliente('');
  };

  const limpiarCliente = () => {
    setClienteSeleccionado(null);
    setModoManual(false);
    setBusquedaCliente('');
    setEsFiado(false);
    setFiadoVencimiento('');
    setCNombre(''); setCTelefono(''); setCEmail(''); setCNit('');
  };

  useEffect(() => {
    fetch('/api/productos')
      .then(res => res.json())
      .then(body => setProductos((body.data ?? []).filter((p: Producto) => p.disponible)))
      .catch(() => setAlert({ title: 'Error', description: 'No se pudieron cargar productos.', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  const categorias = useMemo(() => {
    const map = new Map<number, string>();
    productos.flatMap(p => p.categoria_id ?? []).forEach(c => map.set(c.categoria.id, c.categoria.nombre));
    return Array.from(map, ([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [productos]);

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
    (filterCat === null || (p.categoria_id ?? []).some(c => c.categoria.id === filterCat))
  );
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0), [cart]);
  const descuentoPct = (!anonimo && clienteSeleccionado?.descuento_pct) ? clienteSeleccionado.descuento_pct : 0;
  const descuentoMonto = Number((subtotal * (descuentoPct / 100)).toFixed(2));
  const total = Number((subtotal - descuentoMonto).toFixed(2));

  const addProduct = (producto: Producto) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === producto.id);
      if (existing) return prev.map(item => item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      return [...prev, { ...producto, cantidad: 1 }];
    });
  };

  const changeQty = (id: number, delta: number) => {
    setCart(prev => prev
      .map(item => item.id === id ? { ...item, cantidad: item.cantidad + delta } : item)
      .filter(item => item.cantidad > 0));
  };

  const cobrar = async () => {
    try {
      // Validar que si es fiado en modo manual, haya al menos un identificador
      if (esFiado && modoManual && !cTelefono.trim() && !cEmail.trim() && !cNit.trim()) {
        setAlert({
          title: 'Dato requerido',
          description: 'Para cargar a cuenta (fiado), ingresa al menos el celular, email o NIT del cliente.',
          type: 'warning',
        });
        return;
      }

      const venta = await registrarVenta.mutateAsync({
        items: cart.map(item => ({ producto_id: item.id, cantidad: item.cantidad })),
        metodo_pago: metodoPago,
        es_cortesia: esCortesia,
        es_fiado: esFiado,
        fiado_vencimiento: esFiado && fiadoVencimiento ? fiadoVencimiento : undefined,
        cliente_id: clienteSeleccionado?.id,
        cliente_anonimo: anonimo,
        cliente_nombre: anonimo ? undefined : (cNombre.trim() || undefined),
        cliente_telefono: anonimo ? undefined : (cTelefono.trim() || undefined),
        cliente_email: anonimo ? undefined : (cEmail.trim() || undefined),
        cliente_nit: anonimo ? undefined : (cNit.trim() || undefined),
      });
      setConfirmOpen(false);
      setCart([]);
      setEsCortesia(false);
      setAnonimo(false);
      limpiarCliente();
      setAlert({
        title: esFiado ? 'Fiado registrado' : 'Venta registrada',
        description: esFiado
          ? `Venta #${venta.id} cargada a la cuenta del cliente.`
          : `Venta #${venta.id} creada correctamente.`,
        type: 'success',
      });
    } catch (error: unknown) {
      setConfirmOpen(false);
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setAlert({ title: 'Caja cerrada', description: 'Abre caja antes de registrar ventas.', type: 'warning' });
        setTimeout(() => router.push('/caja/apertura'), 900);
      } else {
        setAlert({ title: 'Error', description: 'No se pudo registrar la venta.', type: 'error' });
      }
    }
  };

  return (
    <div>
      <AlertPopup visible={!!alert} title={alert?.title ?? ''} description={alert?.description ?? ''} type={alert?.type ?? 'info'} onClose={() => setAlert(null)} />
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={cobrar}
        title={esFiado ? 'Confirmar fiado' : 'Confirmar venta'}
        description={esFiado
          ? `Cargar Bs ${total.toFixed(2)} a la cuenta de ${clienteSeleccionado?.nombre ?? 'cliente'}. No entra dinero a caja.`
          : `Total informativo: Bs ${total.toFixed(2)} · Método: ${metodoPago}${esCortesia ? ' · Cortesía' : ''}`}
        confirmLabel={esFiado ? 'Cargar a cuenta' : 'Cobrar'}
        loadingLabel={esFiado ? 'Registrando...' : 'Cobrando...'}
        isLoading={registrarVenta.isPending}
        variant="confirm"
      />

      <div className="admin-page-header">
        <div>
          <h1>Venta</h1>
          <p>POS rápido de mostrador. El total real se recalcula en servidor.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dash-card span-8">
          <div className="admin-search" style={{ width: '100%', marginBottom: 12 }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto..." />
          </div>
          <div className="admin-cat-filters" style={{ marginBottom: 18 }}>
            <button className={`cat-filter-btn ${filterCat === null ? 'active' : ''}`} type="button" onClick={() => setFilterCat(null)}>Todos</button>
            {categorias.map(cat => (
              <button key={cat.id} className={`cat-filter-btn ${filterCat === cat.id ? 'active' : ''}`} type="button" onClick={() => setFilterCat(cat.id)}>{cat.nombre}</button>
            ))}
          </div>
          {loading ? (
            <div style={{ minHeight: 220 }} />
          ) : filtrados.length === 0 ? (
            productos.length === 0 ? (
              <EmptyState title="Sin productos" hint="No hay productos disponibles para venta." />
            ) : (
              <EmptyState title="Sin resultados" hint="Ningún producto coincide con el filtro o la búsqueda." />
            )
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {filtrados.map(producto => (
                <button key={producto.id} className="type-card" type="button" onClick={() => addProduct(producto)} style={{ textAlign: 'left' }}>
                  <h5>{producto.nombre}</h5>
                  <p>{producto.descripcion || 'Producto disponible'}</p>
                  <div style={{ marginTop: 12, color: 'var(--orange)', fontWeight: 800 }}><MoneyText value={producto.precio} /></div>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="dash-card span-4">
          <div className="dash-card-header">
            <h3>Carrito</h3>
            <span className="dash-card-sub">{cart.length} item(s)</span>
          </div>
          {cart.length === 0 ? (
            <EmptyState title="Carrito vacío" hint="Toca un producto para agregarlo." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.map(item => (
                <div key={item.id} className="ocd-item" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div>{item.nombre}</div>
                    <span className="dim"><MoneyText value={item.precio * item.cantidad} /></span>
                  </div>
                  <button className="action-btn" type="button" onClick={() => changeQty(item.id, -1)}>-</button>
                  <span className="num">{item.cantidad}</span>
                  <button className="action-btn" type="button" onClick={() => changeQty(item.id, 1)}>+</button>
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {descuentoPct > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="dim">Subtotal</span><MoneyText value={subtotal} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fresh)' }}>
                  <span>{clienteSeleccionado?.descuento_nombre ?? 'Privilegio'} (-{descuentoPct}%)</span>
                  <MoneyText value={-descuentoMonto} signed />
                </div>
              </div>
            )}
            <div className="review-stat">
              <div className="review-stat-label">{descuentoPct > 0 ? 'Total con descuento' : 'Total informativo'}</div>
              <div className="review-stat-val"><MoneyText value={total} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['EFECTIVO', 'QR', 'TARJETA'] as Metodo[]).map(metodo => (
                <button key={metodo} className={`cat-filter-btn ${metodoPago === metodo ? 'active' : ''}`} type="button" onClick={() => setMetodoPago(metodo)}>
                  <MethodPill metodo={metodo} />
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', opacity: esFiado ? 0.4 : 1 }}>
              <input type="checkbox" checked={esCortesia} disabled={esFiado} onChange={e => setEsCortesia(e.target.checked)} />
              Cortesía <span className="dim">(no suma a ingresos)</span>
            </label>

            {/* Datos del cliente (base única multicanal) */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', marginBottom: 10 }}>
                <input type="checkbox" checked={anonimo} onChange={e => { setAnonimo(e.target.checked); if (e.target.checked) limpiarCliente(); }} />
                Cliente sin registro (anónimo)
              </label>
              {anonimo ? (
                <p className="form-hint" style={{ color: 'var(--amber)' }}>
                  Sin registrar sus datos, el cliente no podrá acceder a promociones, beneficios, historial de compras ni fidelización. La venta se registra como anónima.
                </p>
              ) : clienteSeleccionado ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="cliente-selected-card">
                    <div>
                      <strong>{clienteSeleccionado.nombre}</strong>
                      <div className="form-hint">
                        {clienteSeleccionado.telefono ?? 'Sin celular'} · {clienteSeleccionado.nit ?? 'Sin CI/NIT'}
                      </div>
                      {descuentoPct > 0 && (
                        <span className="historial-pill" style={{ marginTop: 6 }}>
                          {clienteSeleccionado.descuento_nombre} · {descuentoPct}% dcto
                        </span>
                      )}
                    </div>
                    <button type="button" className="admin-btn ghost" onClick={limpiarCliente}>Cambiar</button>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                    <input type="checkbox" checked={esFiado} onChange={e => { setEsFiado(e.target.checked); if (e.target.checked) setEsCortesia(false); }} />
                    Cargar a cuenta (fiado) <span className="dim">— paga después</span>
                  </label>
                  {esFiado && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="form-hint">Vencimiento (opcional):</span>
                      <input type="date" value={fiadoVencimiento} onChange={e => setFiadoVencimiento(e.target.value)} />
                      <span className="form-hint" style={{ color: 'var(--amber)' }}>
                        No entra dinero a caja ahora. Queda como deuda por cobrar del cliente.
                      </span>
                    </div>
                  )}
                </div>
              ) : modoManual ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input placeholder="Nombre o razón social" value={cNombre} onChange={e => setCNombre(e.target.value)} />
                  <input placeholder="Celular" inputMode="numeric" value={cTelefono} onChange={e => setCTelefono(e.target.value.replace(/\D/g, ''))} />
                  <input placeholder="NIT / C.I." inputMode="numeric" value={cNit} onChange={e => setCNit(e.target.value.replace(/\D/g, ''))} />
                  <input placeholder="Correo (opcional)" value={cEmail} onChange={e => setCEmail(e.target.value)} />
                  <span className="form-hint">Se registrará como cliente nuevo. Si el celular/NIT ya existe, se vinculará automáticamente.</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                    <input type="checkbox" checked={esFiado} onChange={e => { setEsFiado(e.target.checked); if (e.target.checked) setEsCortesia(false); }} />
                    Cargar a cuenta (fiado) <span className="dim">— paga después</span>
                  </label>
                  {esFiado && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span className="form-hint">Vencimiento (opcional):</span>
                      <input type="date" value={fiadoVencimiento} onChange={e => setFiadoVencimiento(e.target.value)} />
                      <span className="form-hint" style={{ color: 'var(--amber)' }}>
                        No entra dinero a caja ahora. Queda como deuda por cobrar del cliente.
                      </span>
                    </div>
                  )}
                  <button type="button" className="admin-btn ghost" onClick={() => { setModoManual(false); setCNombre(''); setCTelefono(''); setCEmail(''); setCNit(''); }}>
                    ← Volver a buscar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input
                    placeholder="Buscar cliente por nombre o celular..."
                    value={busquedaCliente}
                    onChange={e => setBusquedaCliente(e.target.value)}
                  />
                  {busquedaClienteDebounced.trim().length >= 2 && (
                    <div className="cliente-search-results">
                      {clientesQuery.isLoading ? (
                        <div className="form-hint" style={{ padding: '8px 10px' }}>Buscando...</div>
                      ) : resultadosClientes.length > 0 ? (
                        resultadosClientes.map(c => (
                          <button key={c.id} type="button" className="cliente-result-row" onClick={() => seleccionarCliente(c)}>
                            <strong>{c.nombre}</strong>
                            <span className="form-hint">{c.telefono ?? 'Sin celular'} · {c.nit ?? 'Sin CI/NIT'}</span>
                          </button>
                        ))
                      ) : (
                        <div className="form-hint" style={{ padding: '8px 10px' }}>No se encontró ningún cliente.</div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="admin-btn ghost"
                    onClick={() => { setModoManual(true); setCNombre(busquedaCliente); setBusquedaCliente(''); }}
                  >
                    + Agregar cliente
                  </button>
                </div>
              )}
            </div>

            <button
              className="admin-btn primary"
              type="button"
              disabled={
                cart.length === 0
                || registrarVenta.isPending
                || (esFiado && modoManual && !cTelefono.trim() && !cEmail.trim() && !cNit.trim())
              }
              onClick={() => setConfirmOpen(true)}
            >
              {esFiado ? 'Cargar a cuenta' : 'Cobrar'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
