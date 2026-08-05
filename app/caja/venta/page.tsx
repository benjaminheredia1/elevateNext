'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertPopup from '@/components/AlertPopup';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import { useAbonarDeuda, useBuscarClientes, useCrearClienteCaja, usePrivilegiosCaja, useRegistrarVenta, type ClienteResultado } from '@/hooks/caja';

type Metodo = 'EFECTIVO' | 'QR' | 'TARJETA' | 'MIXTO';

interface Producto {
  id: number;
  nombre: string;
  descripcion?: string | null;
  /** Precio a cobrar: ya trae aplicada la promoción vigente, si hay. */
  precio: number;
  /** Precio de lista del local, antes de la promoción. */
  precio_original?: number;
  /** Cuántos Bs descuenta la promoción. Ausente o 0 = sin descuento. */
  descuentoAplicado?: number;
  disponible: boolean;
  categoria_id?: { categoria: { id: number; nombre: string } }[];
}

/** ¿El producto tiene una promoción vigente encima? */
const tieneDescuento = (p: Producto) => (p.descuentoAplicado ?? 0) > 0;

/**
 * Combo vigente en esta sucursal y a esta hora. La lista ya viene filtrada por
 * el servidor: si aparece, se puede cobrar.
 */
interface Combo {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  precio_lista: number;
  ahorro: number;
  vigencia: string;
  rinde: number | null;
  items: { producto_id: number; nombre: string; cantidad: number }[];
}

interface CartItem extends Producto {
  cantidad: number;
  /** Presente si la línea es un combo: se cobra y descuenta distinto. */
  combo_id?: number;
}

/** Categoría virtual del filtro: los combos no son productos del catálogo. */
const CAT_COMBOS = -1;
/**
 * Otra categoría virtual: los productos con promoción vigente. No es una
 * categoría real (un producto en descuento sigue siendo de la suya), pero es lo
 * que el cajero necesita ver junto para poder ofrecerlo.
 */
const CAT_DESCUENTOS = -2;

export default function VentaCajaPage() {
  const router = useRouter();
  const registrarVenta = useRegistrarVenta();
  const abonarDeuda = useAbonarDeuda();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filterCat, setFilterCat] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState<Metodo>('EFECTIVO');
  // Pago mixto: el efectivo es la fuente de verdad; el QR es el resto del total.
  const [mixtoEfectivo, setMixtoEfectivo] = useState(0);
  const [esCortesia, setEsCortesia] = useState(false);
  const [anonimo, setAnonimo] = useState(false);
  /** La venta entró como pedido de la carta web, avisado por WhatsApp. */
  const [esPedidoWeb, setEsPedidoWeb] = useState(false);
  const [entregaWeb, setEntregaWeb] = useState<'RECOJO' | 'DELIVERY'>('RECOJO');
  const [cNombre, setCNombre] = useState('');
  const [cTelefono, setCTelefono] = useState('');
  const [cEmail, setCEmail] = useState('');
  const [cNit, setCNit] = useState('');
  const [clienteSeleccionado, setClienteSeleccionado] = useState<ClienteResultado | null>(null);
  // Modal de alta de cliente desde el POS
  const [modalCliente, setModalCliente] = useState(false);
  // Privilegio (descuento) elegido por el cajero para ESTA venta: uno solo
  const [privVentaId, setPrivVentaId] = useState<number | null>(null);
  const [busquedaCliente, setBusquedaCliente] = useState('');
  const [busquedaClienteDebounced, setBusquedaClienteDebounced] = useState('');
  // El desplegable se abre al enfocar el buscador (sin texto lista todos)
  const [listaClientesAbierta, setListaClientesAbierta] = useState(false);
  const [esFiado, setEsFiado] = useState(false);
  const [fiadoVencimiento, setFiadoVencimiento] = useState('');
  // Abono a la deuda del cliente cobrado junto con la venta
  const [abonoDeuda, setAbonoDeuda] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alert, setAlert] = useState<{ title: string; description: string; type: 'success' | 'error' | 'warning' } | null>(null);
  // Clave de la última línea agregada: destaca su tarjeta un instante para que
  // el cajero vea que el toque entró, sin tener que bajar hasta el carrito.
  const [pulso, setPulso] = useState<string | null>(null);
  const carritoRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!pulso) return;
    const t = setTimeout(() => setPulso(null), 400);
    return () => clearTimeout(t);
  }, [pulso]);

  useEffect(() => {
    const t = setTimeout(() => setBusquedaClienteDebounced(busquedaCliente), 300);
    return () => clearTimeout(t);
  }, [busquedaCliente]);

  const clientesQuery = useBuscarClientes(busquedaClienteDebounced, listaClientesAbierta);
  const resultadosClientes = clientesQuery.data ?? [];
  const crearCliente = useCrearClienteCaja();
  const privilegiosQuery = usePrivilegiosCaja();
  const catalogoPriv = privilegiosQuery.data ?? [];

  const seleccionarCliente = (c: ClienteResultado) => {
    setClienteSeleccionado(c);
    setCNombre(c.nombre);
    setCTelefono(c.telefono ?? '');
    setCEmail(c.email ?? '');
    setCNit(c.nit ?? '');
    setBusquedaCliente('');
    setListaClientesAbierta(false);
  };

  const limpiarCliente = () => {
    setClienteSeleccionado(null);
    setModalCliente(false);
    setBusquedaCliente('');
    setListaClientesAbierta(false);
    setEsFiado(false);
    setFiadoVencimiento('');
    setAbonoDeuda('');
    setPrivVentaId(null);
    setCNombre(''); setCTelefono(''); setCEmail(''); setCNit('');
  };

  const cerrarModalCliente = () => {
    setModalCliente(false);
    setCNombre(''); setCTelefono(''); setCEmail(''); setCNit('');
  };

  // Alta del cliente sin necesidad de cobrar una venta: queda registrado
  // (con sus privilegios) y seleccionado por si se quiere vender igual.
  const guardarClienteNuevo = async () => {
    if (!cNombre.trim()) {
      setAlert({ title: 'Nombre requerido', description: 'Ingresa al menos el nombre del cliente.', type: 'warning' });
      return;
    }
    try {
      const creado = await crearCliente.mutateAsync({
        nombre: cNombre.trim(),
        telefono: cTelefono.trim() || undefined,
        email: cEmail.trim() || undefined,
        nit: cNit.trim() || undefined,
      });
      seleccionarCliente(creado);
      setModalCliente(false);
      setAlert({
        title: 'Cliente registrado',
        description: `${creado.nombre} quedó registrado y seleccionado. Puedes cobrar una venta o continuar sin vender.`,
        type: 'success',
      });
    } catch (error: unknown) {
      const resp = (error as { response?: { status?: number; data?: { error?: string } } })?.response;
      setAlert({
        title: resp?.status === 409 ? 'Cliente ya registrado' : 'No se pudo registrar',
        description: resp?.data?.error ?? 'No se pudo registrar el cliente. Intenta de nuevo.',
        type: resp?.status === 409 ? 'warning' : 'error',
      });
    }
  };

  useEffect(() => {
    // El menú del POS es el de la sucursal del turno abierto: sus productos,
    // con su precio y su nombre. Sin turno se cae al de la sucursal principal.
    (async () => {
      try {
        let url = '/api/productos';
        let urlCombos = '/api/combos';
        try {
          const turno = await fetch('/api/caja/turno-activo').then(r => (r.ok ? r.json() : null));
          if (turno?.sucursal_id) {
            url += `?sucursal=${turno.sucursal_id}`;
            urlCombos += `?sucursal=${turno.sucursal_id}`;
          }
        } catch { /* sin turno: menú de la principal */ }

        const [body, bodyCombos] = await Promise.all([
          fetch(url).then(r => r.json()),
          // Los combos vienen ya filtrados por franja horaria y stock del local.
          fetch(urlCombos).then(r => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
        ]);
        setProductos((body.data ?? []).filter((p: Producto) => p.disponible));
        setCombos(bodyCombos.data ?? []);
      } catch {
        setAlert({ title: 'Error', description: 'No se pudieron cargar productos.', type: 'error' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categorias = useMemo(() => {
    const map = new Map<number, string>();
    productos.flatMap(p => p.categoria_id ?? []).forEach(c => map.set(c.categoria.id, c.categoria.nombre));
    return Array.from(map, ([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [productos]);

  const enDescuento = useMemo(() => productos.filter(tieneDescuento), [productos]);

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) &&
    (filterCat === null
      ? true
      : filterCat === CAT_DESCUENTOS
        ? tieneDescuento(p)
        : filterCat === CAT_COMBOS
          // En la solapa de combos no van los productos sueltos.
          ? false
          : (p.categoria_id ?? []).some(c => c.categoria.id === filterCat))
  );
  // Los combos se ven en "Todos" y en su propia solapa, nunca dentro de una
  // categoría de productos: no pertenecen a ninguna.
  const combosVisibles = (filterCat === null || filterCat === CAT_COMBOS)
    ? combos.filter(c => c.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : [];
  const sinResultados = filtrados.length === 0 && combosVisibles.length === 0;
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0), [cart]);
  const privVenta = (!anonimo && clienteSeleccionado && privVentaId)
    ? catalogoPriv.find(p => p.id === privVentaId) ?? null
    : null;
  const descuentoPct = privVenta?.porcentaje ?? 0;
  const descuentoMonto = Number((subtotal * (descuentoPct / 100)).toFixed(2));
  const total = Number((subtotal - descuentoMonto).toFixed(2));
  const mixtoQr = Number((total - mixtoEfectivo).toFixed(2));
  const mixtoValido = metodoPago !== 'MIXTO' || (mixtoEfectivo > 0 && mixtoQr > 0);
  const deudaCliente = clienteSeleccionado?.deuda_saldo ?? 0;
  const abonoNum = Number(abonoDeuda) || 0;
  const abonoActivo = !esFiado && !esCortesia && metodoPago !== 'MIXTO' && deudaCliente > 0;
  const abonoValido = !abonoActivo || abonoNum === 0 || (abonoNum > 0 && abonoNum <= deudaCliente);
  const totalCobrar = Number((total + (abonoActivo ? abonoNum : 0)).toFixed(2));
  // Cobro de deuda sin compra: carrito vacío pero con abono válido
  // (abonoActivo ya excluye fiado, cortesía y pago mixto)
  const soloDeuda = cart.length === 0 && abonoActivo && abonoNum > 0 && abonoValido;

  // Los combos comparten el espacio de ids con los productos, así que la línea
  // del carrito se identifica por ambos: sin esto, el combo #3 y el producto #3
  // se sumarían en la misma fila.
  const claveLinea = (item: { id: number; combo_id?: number }) => `${item.combo_id ? 'c' : 'p'}${item.id}`;

  /** Cuántas unidades de esta tarjeta ya están en el carrito. */
  const enCarrito = (clave: string) => cart.find(item => claveLinea(item) === clave)?.cantidad ?? 0;

  const addProduct = (producto: Producto) => {
    setCart(prev => {
      const existing = prev.find(item => !item.combo_id && item.id === producto.id);
      if (existing) return prev.map(item => (!item.combo_id && item.id === producto.id) ? { ...item, cantidad: item.cantidad + 1 } : item);
      return [...prev, { ...producto, cantidad: 1 }];
    });
    setPulso(`p${producto.id}`);
  };

  /**
   * Un combo entra al carrito como UNA línea, al precio que fijó el servidor.
   *
   * No se topea por stock: como con los productos sueltos, el cajero tiene la
   * mercadería delante y tiene que poder cobrar aunque el inventario esté sin
   * cargar. El stock queda negativo y se corrige al reponer. Lo único que
   * bloquea un combo es su franja horaria, y eso lo valida el servidor.
   */
  const addCombo = (combo: Combo) => {
    setCart(prev => {
      const existing = prev.find(item => item.combo_id === combo.id);
      if (existing) {
        return prev.map(item => item.combo_id === combo.id ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...prev, {
        id: combo.id,
        combo_id: combo.id,
        nombre: combo.nombre,
        descripcion: combo.items.map(i => `${i.cantidad}× ${i.nombre}`).join(' + '),
        precio: combo.precio,
        disponible: true,
        cantidad: 1,
      }];
    });
    setPulso(`c${combo.id}`);
  };

  /** La barra flotante de mobile lleva al carrito, que queda al final del scroll. */
  const verCarrito = () => {
    carritoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const unidadesEnCarrito = useMemo(() => cart.reduce((sum, item) => sum + item.cantidad, 0), [cart]);

  const changeQty = (clave: string, delta: number) => {
    setCart(prev => prev
      .map(item => claveLinea(item) === clave ? { ...item, cantidad: item.cantidad + delta } : item)
      .filter(item => item.cantidad > 0));
  };

  const cobrar = async () => {
    try {
      // Cobro de deuda sin compra (carrito vacío)
      if (soloDeuda && clienteSeleccionado) {
        const r = await abonarDeuda.mutateAsync({
          clienteId: clienteSeleccionado.id,
          pagos: [{ metodo_pago: metodoPago as 'EFECTIVO' | 'QR' | 'TARJETA', monto: abonoNum }],
        });
        setConfirmOpen(false);
        setAbonoDeuda('');
        limpiarCliente();
        setAlert({
          title: 'Deuda cobrada',
          description: `Se cobró Bs ${Number(r.abonado).toFixed(2)}. Saldo restante: Bs ${Number(r.saldo_restante).toFixed(2)}.`,
          type: 'success',
        });
        return;
      }

      const venta = await registrarVenta.mutateAsync({
        // Del combo solo viaja cuál y cuántos: el precio y qué lleva adentro
        // los resuelve el servidor, que además revalida la franja horaria.
        items: cart.filter(i => !i.combo_id).map(item => ({ producto_id: item.id, cantidad: item.cantidad })),
        combos: cart.filter(i => i.combo_id).map(item => ({ combo_id: item.combo_id!, cantidad: item.cantidad })),
        metodo_pago: metodoPago,
        pago_mixto: metodoPago === 'MIXTO' ? { efectivo: mixtoEfectivo, qr: mixtoQr } : undefined,
        abono_deuda: abonoActivo && abonoNum > 0 ? abonoNum : undefined,
        es_cortesia: esCortesia,
        es_fiado: esFiado,
        fiado_vencimiento: esFiado && fiadoVencimiento ? fiadoVencimiento : undefined,
        privilegio_id: privVenta?.id,
        cliente_id: clienteSeleccionado?.id,
        cliente_anonimo: anonimo,
        cliente_nombre: anonimo ? undefined : (cNombre.trim() || undefined),
        cliente_telefono: anonimo ? undefined : (cTelefono.trim() || undefined),
        cliente_email: anonimo ? undefined : (cEmail.trim() || undefined),
        cliente_nit: anonimo ? undefined : (cNit.trim() || undefined),
        es_pedido_web: esPedidoWeb,
        tipo_entrega: esPedidoWeb ? entregaWeb : undefined,
      });
      setConfirmOpen(false);
      setCart([]);
      setEsCortesia(false);
      setAnonimo(false);
      setEsPedidoWeb(false);
      setEntregaWeb('RECOJO');
      setMixtoEfectivo(0);
      limpiarCliente();
      // Nº del turno como identificador principal; el global queda de referencia
      const numVenta = venta.numero_turno != null ? `#${venta.numero_turno} (global #${venta.id})` : `#${venta.id}`;
      setAlert({
        title: esFiado ? 'Fiado registrado' : 'Venta registrada',
        description: esFiado
          ? `Venta ${numVenta} cargada a la cuenta del cliente.`
          : venta.abono_deuda
            ? `Venta ${numVenta} creada. Incluye abono a deuda de Bs ${Number(venta.abono_deuda).toFixed(2)}.`
            : `Venta ${numVenta} creada correctamente.`,
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
    <div className={`pos-page ${cart.length > 0 ? 'with-cart-bar' : ''}`}>
      <AlertPopup visible={!!alert} title={alert?.title ?? ''} description={alert?.description ?? ''} type={alert?.type ?? 'info'} onClose={() => setAlert(null)} />
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={cobrar}
        title={soloDeuda ? 'Confirmar cobro de deuda' : esFiado ? 'Confirmar fiado' : 'Confirmar venta'}
        description={soloDeuda
          ? `Cobrar Bs ${abonoNum.toFixed(2)} de la deuda de ${clienteSeleccionado?.nombre ?? 'cliente'} (${metodoPago}). Sin productos.`
          : esFiado
          ? `Cargar Bs ${total.toFixed(2)} a la cuenta de ${clienteSeleccionado?.nombre ?? 'cliente'}. No entra dinero a caja.`
          : metodoPago === 'MIXTO'
            ? `Total: Bs ${total.toFixed(2)} · Mixto: Bs ${mixtoEfectivo.toFixed(2)} efectivo + Bs ${mixtoQr.toFixed(2)} QR${esCortesia ? ' · Cortesía' : ''}`
            : `Total informativo: Bs ${total.toFixed(2)}${abonoActivo && abonoNum > 0 ? ` + Bs ${abonoNum.toFixed(2)} abono deuda = Bs ${totalCobrar.toFixed(2)}` : ''} · Método: ${metodoPago}${esCortesia ? ' · Cortesía' : ''}`}
        confirmLabel={soloDeuda ? 'Cobrar deuda' : esFiado ? 'Cargar a cuenta' : 'Cobrar'}
        loadingLabel={esFiado ? 'Registrando...' : 'Cobrando...'}
        isLoading={registrarVenta.isPending || abonarDeuda.isPending}
        variant="confirm"
      />

      {modalCliente && (
        <div className="admin-modal-overlay" onClick={cerrarModalCliente}>
          <form
            className="admin-modal compact"
            onClick={e => e.stopPropagation()}
            onSubmit={e => { e.preventDefault(); guardarClienteNuevo(); }}
          >
            <div className="admin-modal-header">
              <h2>Agregar cliente</h2>
              <button type="button" className="admin-modal-close" onClick={cerrarModalCliente}>&times;</button>
            </div>
            <div className="admin-modal-body">
              <div className="form-group">
                <label>Nombre o razón social *</label>
                <input value={cNombre} onChange={e => setCNombre(e.target.value)} autoFocus required placeholder="Ej. Juan Pérez" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="form-group">
                  <label>Celular</label>
                  <input inputMode="numeric" value={cTelefono} onChange={e => setCTelefono(e.target.value.replace(/\D/g, ''))} placeholder="Ej. 79999999" />
                </div>
                <div className="form-group">
                  <label>NIT / C.I.</label>
                  <input inputMode="numeric" value={cNit} onChange={e => setCNit(e.target.value.replace(/\D/g, ''))} placeholder="Ej. 1234567" />
                </div>
              </div>
              <div className="form-group">
                <label>Correo (opcional)</label>
                <input type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="cliente@correo.com" />
              </div>
              <span className="form-hint">Al agregarlo quedará registrado y seleccionado para esta venta.</span>
            </div>
            <div className="admin-modal-footer">
              <button type="button" className="admin-btn ghost" onClick={cerrarModalCliente}>Cancelar</button>
              <button type="submit" className="admin-btn primary" disabled={crearCliente.isPending || !cNombre.trim()}>
                {crearCliente.isPending ? 'Agregando...' : 'Agregar cliente'}
              </button>
            </div>
          </form>
        </div>
      )}

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
            {/* La solapa de combos solo aparece si hay alguno vigente ahora:
                fuera de su franja horaria no tiene nada que mostrar. */}
            {combos.length > 0 && (
              <button
                className={`cat-filter-btn ${filterCat === CAT_COMBOS ? 'active' : ''}`}
                type="button"
                onClick={() => setFilterCat(CAT_COMBOS)}
              >
                Combos ({combos.length})
              </button>
            )}
            {/* Igual que la de combos: solo aparece si hay algo con promoción
                vigente en este momento y en este local. */}
            {enDescuento.length > 0 && (
              <button
                className={`cat-filter-btn ${filterCat === CAT_DESCUENTOS ? 'active' : ''}`}
                type="button"
                onClick={() => setFilterCat(CAT_DESCUENTOS)}
              >
                En descuento ({enDescuento.length})
              </button>
            )}
            {categorias.map(cat => (
              <button key={cat.id} className={`cat-filter-btn ${filterCat === cat.id ? 'active' : ''}`} type="button" onClick={() => setFilterCat(cat.id)}>{cat.nombre}</button>
            ))}
          </div>
          {loading ? (
            <div style={{ minHeight: 220 }} />
          ) : sinResultados ? (
            productos.length === 0 ? (
              <EmptyState title="Sin productos" hint="No hay productos disponibles para venta." />
            ) : (
              <EmptyState title="Sin resultados" hint="Ningún producto coincide con el filtro o la búsqueda." />
            )
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
              {combosVisibles.map(combo => {
                const clave = `c${combo.id}`;
                const cantidad = enCarrito(clave);
                // Sin stock para armarlo se avisa, pero se vende igual.
                const sinStock = combo.rinde != null && combo.rinde <= 0;
                return (
                <button
                  key={`combo-${combo.id}`}
                  className={`type-card pos-card ${pulso === clave ? 'is-added' : ''}`}
                  type="button"
                  onClick={() => addCombo(combo)}
                  style={{ textAlign: 'left', borderColor: 'var(--orange)' }}
                  title={combo.vigencia ? `Disponible ${combo.vigencia}` : undefined}
                >
                  {cantidad > 0 && <span key={cantidad} className="pos-card-badge">{cantidad}</span>}
                  <h5>🎁 {combo.nombre}</h5>
                  <p>{combo.items.map(i => `${i.cantidad}× ${i.nombre}`).join(' + ')}</p>
                  <div style={{ marginTop: 12, color: 'var(--orange)', fontWeight: 800 }}>
                    <MoneyText value={combo.precio} />
                    {combo.ahorro > 0 && (
                      <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--slate)', textDecoration: 'line-through' }}>
                        <MoneyText value={combo.precio_lista} />
                      </span>
                    )}
                  </div>
                  {sinStock ? (
                    <span className="form-hint" style={{ color: 'var(--orange)' }}>Sin stock cargado · se vende igual</span>
                  ) : combo.rinde != null && combo.rinde <= 5 && (
                    <span className="form-hint">Alcanza para {combo.rinde}</span>
                  )}
                </button>
                );
              })}
              {filtrados.map(producto => {
                const clave = `p${producto.id}`;
                const cantidad = enCarrito(clave);
                // El precio que se muestra ya viene con la promoción aplicada:
                // el cajero necesita ver de dónde salió y cuánto se descontó.
                const rebajado = tieneDescuento(producto);
                const original = producto.precio_original ?? producto.precio;
                const ahorro = producto.descuentoAplicado ?? 0;
                const pct = original > 0 ? Math.round((ahorro / original) * 100) : 0;
                return (
                <button
                  key={producto.id}
                  className={`type-card pos-card ${rebajado ? 'is-descuento' : ''} ${pulso === clave ? 'is-added' : ''}`}
                  type="button"
                  onClick={() => addProduct(producto)}
                  style={{ textAlign: 'left' }}
                  title={rebajado ? `Precio de lista Bs ${original.toFixed(2)} · promoción vigente` : undefined}
                >
                  {cantidad > 0 && <span key={cantidad} className="pos-card-badge">{cantidad}</span>}
                  {rebajado && <span className="pos-card-desc-badge">−{pct}%</span>}
                  <h5>{producto.nombre}</h5>
                  <p>{producto.descripcion || 'Producto disponible'}</p>
                  <div style={{ marginTop: 12, color: 'var(--orange)', fontWeight: 800 }}>
                    <MoneyText value={producto.precio} />
                    {rebajado && (
                      <span style={{ marginLeft: 8, fontSize: '0.72rem', color: 'var(--slate)', textDecoration: 'line-through' }}>
                        <MoneyText value={original} />
                      </span>
                    )}
                  </div>
                  {rebajado && (
                    <span className="form-hint" style={{ color: 'var(--fresh)' }}>
                      Ahorra <MoneyText value={ahorro} />
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="dash-card span-4" ref={carritoRef}>
          <div className="dash-card-header">
            <h3>Carrito</h3>
            <span className="dash-card-sub">{cart.length} item(s)</span>
          </div>
          {cart.length === 0 ? (
            <EmptyState title="Carrito vacío" hint="Toca un producto para agregarlo." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cart.map(item => (
                <div key={claveLinea(item)} className="ocd-item" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <div>{item.combo_id ? `🎁 ${item.nombre}` : item.nombre}</div>
                    {/* En un combo se muestra qué lleva: el cajero cobra una
                        línea, pero conviene que vea qué está entregando. */}
                    {item.combo_id && <span className="dim" style={{ display: 'block' }}>{item.descripcion}</span>}
                    <span className="dim"><MoneyText value={item.precio * item.cantidad} /></span>
                    {/* Para poder explicarle al cliente por qué paga menos. */}
                    {!item.combo_id && tieneDescuento(item) && (
                      <span className="dim" style={{ display: 'block', color: 'var(--fresh)' }}>
                        con descuento · antes <MoneyText value={(item.precio_original ?? item.precio) * item.cantidad} />
                      </span>
                    )}
                  </div>
                  <button className="action-btn" type="button" onClick={() => changeQty(claveLinea(item), -1)}>-</button>
                  <span className="num">{item.cantidad}</span>
                  <button className="action-btn" type="button" onClick={() => changeQty(claveLinea(item), 1)}>+</button>
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
                {descuentoPct > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--fresh)' }}>
                    <span>{privVenta?.nombre ?? 'Privilegio'} (-{descuentoPct}%)</span>
                    <MoneyText value={-descuentoMonto} signed />
                  </div>
                )}
              </div>
            )}
            <div className="review-stat">
              <div className="review-stat-label">{descuentoPct > 0 ? 'Total con descuento' : 'Total informativo'}</div>
              <div className="review-stat-val"><MoneyText value={total} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['EFECTIVO', 'QR', 'TARJETA', 'MIXTO'] as Metodo[]).map(metodo => (
                <button
                  key={metodo}
                  className={`cat-filter-btn ${metodoPago === metodo ? 'active' : ''}`}
                  type="button"
                  disabled={metodo === 'MIXTO' && (esFiado || esCortesia)}
                  style={metodo === 'MIXTO' && (esFiado || esCortesia) ? { opacity: 0.4 } : undefined}
                  onClick={() => { setMetodoPago(metodo); if (metodo === 'MIXTO') setMixtoEfectivo(0); }}
                >
                  <MethodPill metodo={metodo} />
                </button>
              ))}
            </div>
            {metodoPago === 'MIXTO' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', border: '1px solid var(--line)', borderRadius: 10 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <span className="form-hint">Efectivo (Bs)</span>
                    <input
                      type="number" min="0.01" max={Math.max(total - 0.01, 0)} step="0.01"
                      value={mixtoEfectivo || ''}
                      onChange={e => setMixtoEfectivo(Math.min(Math.max(Number(e.target.value) || 0, 0), total))}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <span className="form-hint">QR (Bs)</span>
                    <input
                      type="number" min="0.01" max={Math.max(total - 0.01, 0)} step="0.01"
                      value={mixtoQr > 0 ? mixtoQr : ''}
                      onChange={e => setMixtoEfectivo(Number((total - Math.min(Math.max(Number(e.target.value) || 0, 0), total)).toFixed(2)))}
                      placeholder="0.00"
                    />
                  </div>
                </div>
                <span className="form-hint" style={{ color: mixtoValido ? undefined : 'var(--amber)' }}>
                  {mixtoValido
                    ? `Bs ${mixtoEfectivo.toFixed(2)} en efectivo + Bs ${mixtoQr.toFixed(2)} por QR = Bs ${total.toFixed(2)}`
                    : 'Ingresa cuánto paga por cada método: ambas partes deben ser mayores a 0 y sumar el total.'}
                </span>
              </div>
            )}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', opacity: esFiado ? 0.4 : 1 }}>
              <input type="checkbox" checked={esCortesia} disabled={esFiado} onChange={e => { setEsCortesia(e.target.checked); if (e.target.checked && metodoPago === 'MIXTO') setMetodoPago('EFECTIVO'); }} />
              Cortesía <span className="dim">(no suma a ingresos)</span>
            </label>

            {/* Pedido que llegó por WhatsApp desde la carta web. La web no
                registra pedidos: los registra acá quien los cobra, y esta marca
                es la que después dice cuánto se vende por la web. */}
            <div style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                <input
                  type="checkbox"
                  checked={esPedidoWeb}
                  onChange={e => {
                    setEsPedidoWeb(e.target.checked);
                    if (!e.target.checked) setEntregaWeb('RECOJO');
                  }}
                />
                Pedido desde la web <span className="dim">(llegó por WhatsApp)</span>
              </label>

              {esPedidoWeb && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                  <div className="admin-cat-filters">
                    {(['RECOJO', 'DELIVERY'] as const).map(t => (
                      <button
                        key={t}
                        type="button"
                        className={`cat-filter-btn ${entregaWeb === t ? 'active' : ''}`}
                        onClick={() => setEntregaWeb(t)}
                      >
                        {t === 'RECOJO' ? 'Retiro en el local' : 'Delivery'}
                      </button>
                    ))}
                  </div>
                  {entregaWeb === 'DELIVERY' && (
                    <p className="form-hint" style={{ color: 'var(--amber)' }}>
                      El envío no se cobra acá: esa plata es del repartidor. Esta venta registra
                      solo los productos. Cuando el repartidor rinda cuentas, el dueño lo carga
                      como <strong>Ingreso extra</strong> del turno.
                    </p>
                  )}
                </div>
              )}
            </div>

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
                    </div>
                    <button type="button" className="admin-btn ghost" onClick={limpiarCliente}>Cambiar</button>
                  </div>
                  {catalogoPriv.length > 0 && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="form-hint" style={{ fontWeight: 600 }}>Privilegio para esta venta (opcional)</span>
                      <select
                        value={privVentaId ?? ''}
                        onChange={e => setPrivVentaId(e.target.value ? Number(e.target.value) : null)}
                      >
                        <option value="">Sin privilegio</option>
                        {catalogoPriv.map(p => (
                          <option key={p.id} value={p.id}>{p.nombre} — {p.porcentaje}% dcto</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {deudaCliente > 0 && (
                    <div style={{ border: '1px solid var(--amber)', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span style={{ color: 'var(--amber)', fontWeight: 700 }}>
                        Debe <MoneyText value={deudaCliente} /> en fiados
                      </span>
                      {abonoActivo ? (
                        <>
                          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span className="form-hint">Cobrar deuda ahora (opcional)</span>
                            <input
                              type="number"
                              min="0"
                              max={deudaCliente}
                              step="0.01"
                              placeholder="0.00"
                              value={abonoDeuda}
                              onChange={e => setAbonoDeuda(e.target.value)}
                            />
                          </label>
                          {abonoNum > 0 && abonoValido && (
                            <span className="form-hint" style={{ fontWeight: 600 }}>
                              ✓ Se cobrará: Bs {total.toFixed(2)} de la venta + Bs {abonoNum.toFixed(2)} de deuda = Bs {totalCobrar.toFixed(2)}
                            </span>
                          )}
                          {!abonoValido && (
                            <span className="form-hint" style={{ color: 'var(--amber)' }}>
                              El abono no puede superar la deuda (Bs {deudaCliente.toFixed(2)}).
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="form-hint">Para cobrar deuda aquí, usa venta normal (sin fiado/cortesía) con un solo método de pago.</span>
                      )}
                    </div>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
                    <input type="checkbox" checked={esFiado} onChange={e => { setEsFiado(e.target.checked); if (e.target.checked) { setEsCortesia(false); if (metodoPago === 'MIXTO') setMetodoPago('EFECTIVO'); } }} />
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
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="admin-search" style={{ width: '100%' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                    <input
                      placeholder="Buscar cliente..."
                      value={busquedaCliente}
                      onChange={e => setBusquedaCliente(e.target.value)}
                      onFocus={() => setListaClientesAbierta(true)}
                      onBlur={() => window.setTimeout(() => setListaClientesAbierta(false), 180)}
                    />
                  </div>
                  {listaClientesAbierta && (
                    <div className="cliente-search-results" style={{ maxHeight: 260, overflowY: 'auto' }}>
                      {clientesQuery.isLoading ? (
                        <div className="form-hint" style={{ padding: '8px 10px' }}>Buscando...</div>
                      ) : resultadosClientes.length > 0 ? (
                        resultadosClientes.map(c => (
                          <button key={c.id} type="button" className="cliente-result-row" onMouseDown={e => e.preventDefault()} onClick={() => seleccionarCliente(c)}>
                            <strong>{c.nombre}</strong>
                            <span className="form-hint">{c.telefono ?? 'Sin celular'} · {c.nit ?? 'Sin CI/NIT'}</span>
                          </button>
                        ))
                      ) : (
                        <div className="form-hint" style={{ padding: '8px 10px' }}>
                          {busquedaClienteDebounced.trim().length >= 2 ? 'No se encontró ningún cliente.' : 'Sin clientes registrados aún.'}
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="admin-btn ghost"
                    onClick={() => { setCNombre(busquedaCliente.trim()); setBusquedaCliente(''); setListaClientesAbierta(false); setModalCliente(true); }}
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
                (cart.length === 0 && !soloDeuda)
                || registrarVenta.isPending
                || abonarDeuda.isPending
                || !mixtoValido
                || !abonoValido
              }
              onClick={() => setConfirmOpen(true)}
            >
              {soloDeuda ? 'Cobrar deuda' : esFiado ? 'Cargar a cuenta' : 'Cobrar'}
            </button>
          </div>
        </aside>
      </div>

      {/* En mobile el carrito queda al final del scroll: esta barra mantiene el
          total a la vista y acerca el carrito de un toque. */}
      {cart.length > 0 && (
        <div className="pos-cart-bar" role="status" aria-live="polite">
          <div className="pos-cart-bar-info">
            <span className="pos-cart-bar-count">
              {unidadesEnCarrito} {unidadesEnCarrito === 1 ? 'ítem' : 'ítems'}
            </span>
            <span key={unidadesEnCarrito} className="pos-cart-bar-total">
              <MoneyText value={total} />
            </span>
          </div>
          <button type="button" className="admin-btn primary" onClick={verCarrito}>Ver carrito</button>
        </div>
      )}
    </div>
  );
}
