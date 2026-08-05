'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icons } from './icons'
import { sucursalElegidaId, useSucursalTienda } from '@/hooks/sucursal-tienda'
import { linkWhatsAppPedido } from '@/lib/pedido-whatsapp'
import { cotizarEnvio } from '@/lib/envio'

/* ===== Types ===== */
export type CartItem = {
  id: number
  name: string
  price: number
  precio_original?: number
  descuentoAplicado?: number
  quantity: number
  icon: React.ReactNode
  category: string
}

export type AddableProduct = {
  id: number
  name: string
  price: number
  precio_original?: number
  descuentoAplicado?: number
  icon: React.ReactNode
  category: string
}

/** La tarjeta se dio de baja como forma de pago: quedan efectivo y QR. */
type PaymentMethod = 'cash' | 'qr'
type TipoEntrega = 'recojo' | 'delivery'


/* ===== Confetti Component ===== */
function Confetti() {
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: ['#ff5c19', '#ff7a42', '#aecacd', '#e5e4d3', '#4caf50'][Math.floor(Math.random() * 5)],
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.5,
    size: 6 + Math.random() * 8,
    rotate: Math.random() * 360,
  }))
  return (
    <div className="confetti-container">
      {pieces.map(p => (
        <motion.div
          key={p.id}
          className="confetti-piece"
          style={{ left: `${p.x}%`, background: p.color, width: p.size, height: p.size, borderRadius: Math.random() > 0.5 ? '50%' : '2px' }}
          initial={{ y: -20, opacity: 1, rotate: p.rotate }}
          animate={{ y: 300, opacity: 0, rotate: p.rotate + 360 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
        />
      ))}
    </div>
  )
}

/* ===== Cart Drawer ===== */
function CartDrawer({
  cart,
  onClose,
  onUpdateQty,
  onRemove,
  onCheckout
}: {
  cart: CartItem[]
  onClose: () => void
  onUpdateQty: (id: number, delta: number) => void
  onRemove: (id: number) => void
  onCheckout: () => void
}) {
  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0)

  return (
    <>
      <motion.div
        className="cart-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="cart-drawer"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      >
        <div className="cart-drawer-header">
          <h3>Tu Carrito</h3>
          <button className="cart-close-btn" onClick={onClose}>{Icons.x}</button>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <motion.div
              className="cart-empty-icon"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {Icons.shoppingCart}
            </motion.div>
            <p>Tu carrito está vacío</p>
            <span>Agrega productos del menú</span>
          </div>
        ) : (
          <>
            <div className="cart-items">
              <AnimatePresence>
                {cart.map(item => (
                  <motion.div
                    key={item.id}
                    className="cart-item"
                    layout
                    initial={{ opacity: 0, x: 30 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -30, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    <div className="cart-item-icon">{item.icon}</div>
                    <div className="cart-item-info">
                      <div className="cart-item-name">{item.name}</div>
                      <div className="cart-item-category">{item.category}</div>
                      <div className="cart-item-price">
                        {item.precio_original && item.precio_original > item.price && (
                          <span style={{ textDecoration: 'line-through', color: '#666', fontSize: '0.8em', marginRight: 4 }}>
                            Bs. {(item.precio_original * item.quantity).toFixed(2)}
                          </span>
                        )}
                        Bs. {(item.price * item.quantity).toFixed(2)}
                      </div>
                    </div>
                    <div className="cart-item-controls">
                      <button className="qty-btn" onClick={() => onUpdateQty(item.id, -1)}>{Icons.minus}</button>
                      <span className="qty-value">{item.quantity}</span>
                      <button className="qty-btn" onClick={() => onUpdateQty(item.id, 1)}>{Icons.plus}</button>
                      <button className="qty-btn remove-btn" onClick={() => onRemove(item.id)}>{Icons.trash}</button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="cart-footer">
              <div className="cart-summary">
                <div className="cart-summary-row">
                  <span>Subtotal</span>
                  <span>Bs. {total}</span>
                </div>
                {/* El envío ya no es gratis: se cotiza por distancia recién
                    cuando el cliente marca su ubicación en el checkout. */}
                <div className="cart-summary-row">
                  <span>Envío</span>
                  <span className="free-delivery">Se calcula al elegir delivery</span>
                </div>
                <div className="cart-summary-row total">
                  <span>Total</span>
                  <span>Bs. {total}</span>
                </div>
              </div>
              <motion.button
                className="checkout-btn"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={onCheckout}
              >
                Proceder al Pago
                {Icons.arrowRight}
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </>
  )
}

/* ===== Location Picker (Leaflet) — pick delivery point on a map ===== */
function LocationPicker({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<import('leaflet').Map | null>(null)
  const markerRef = useRef<import('leaflet').Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const DEFAULT_CENTER: [number, number] = [-17.7833, -63.1821] // Santa Cruz de la Sierra

  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return

    const initMap = async () => {
      const container = mapRef.current
      if (!container || (container as unknown as { _leaflet_id?: number })._leaflet_id) return
      const L = await import('leaflet')
      if (leafletMapRef.current || (container as unknown as { _leaflet_id?: number })._leaflet_id) return

      const start: [number, number] = (lat != null && lng != null) ? [lat, lng] : DEFAULT_CENTER
      const map = L.map(container, { center: start, zoom: 15, zoomControl: true, attributionControl: false })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      const pinIcon = L.divIcon({
        className: '',
        html: `<div class="lf-dest-marker"><div class="lf-dest-pin"></div></div>`,
        iconSize: [40, 52],
        iconAnchor: [12, 40],
      })
      const marker = L.marker(start, { icon: pinIcon, draggable: true }).addTo(map)
      markerRef.current = marker

      marker.on('dragend', () => {
        const p = marker.getLatLng()
        onChangeRef.current(p.lat, p.lng)
      })
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        marker.setLatLng(e.latlng)
        onChangeRef.current(e.latlng.lat, e.latlng.lng)
      })

      leafletMapRef.current = map
      map.whenReady(() => map.invalidateSize())
      setTimeout(() => map.invalidateSize(), 350)
    }

    initMap()

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
        markerRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reflect externally-set coords (e.g. "use my location") on the map
  useEffect(() => {
    if (!leafletMapRef.current || !markerRef.current || lat == null || lng == null) return
    markerRef.current.setLatLng([lat, lng])
    leafletMapRef.current.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={mapRef} style={{ width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)' }} />
}

/* ===== Checkout Modal ===== */
function CheckoutModal({
  cart,
  onClose,
  onOrderComplete
}: {
  cart: CartItem[]
  onClose: () => void
  /** Avisa que el mensaje salió y pasa el link, por si hay que reabrirlo. */
  onOrderComplete: (linkWhatsApp?: string | null) => void
}) {
  /**
   * El formulario es UNA sola pantalla. Antes eran cuatro pasos (entrega, pago,
   * datos, confirmar) y corregir un dato obligaba a volver atrás perdiendo de
   * vista el resto. 'qr' no es un paso del formulario: es el código para pagar
   * antes de mandar el mensaje.
   */
  const [step, setStep] = useState<'form' | 'qr'>('form')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega | null>('recojo')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [nombre, setNombre] = useState('')
  const [nit, setNit] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [notas, setNotas] = useState('')
  const [direccion, setDireccion] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [codigoDescuento, setCodigoDescuento] = useState('')
  const [clienteReconocido, setClienteReconocido] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState('')
  const { sucursales } = useSucursalTienda()
  /** Lo que suman los productos. El envío se cobra aparte. */
  const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0)

  const sucursal = sucursales.find(s => s.id === sucursalElegidaId()) ?? sucursales[0]

  /**
   * Envío cotizado con la tarifa del local y la distancia hasta el pin. Se
   * recalcula solo al mover el pin, así el cliente ve el costo antes de mandar
   * el pedido y no se lo enteran recién al recibirlo.
   */
  const envio = useMemo(() => {
    if (tipoEntrega !== 'delivery' || lat == null || lng == null) return null
    if (!sucursal || sucursal.lat == null || sucursal.lng == null) return null
    return cotizarEnvio(
      { lat: sucursal.lat, lng: sucursal.lng },
      { lat, lng },
      {
        envio_base: sucursal.envio_base,
        envio_km_incluidos: sucursal.envio_km_incluidos,
        envio_por_km: sucursal.envio_por_km,
        envio_maximo: sucursal.envio_maximo,
        envio_radio_km: sucursal.envio_radio_km,
      },
    )
  }, [tipoEntrega, lat, lng, sucursal])

  const costoEnvio = envio?.dentroDeCobertura ? envio.costo : 0
  const total = subtotal + costoEnvio

  const qrData = encodeURIComponent(`Elevate Food | Pago Bs.${total} | ${nombre || 'Cliente'}`)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}&bgcolor=1e1e1e&color=ff5c19&margin=10`

  /**
   * Obligatorios: solo nombre y celular, que es lo único que hace falta para
   * preparar el pedido y avisarle al cliente. El NIT y el correo son datos de
   * factura: si se piden obligatorios, se pierden pedidos por un trámite que la
   * mayoría no quiere hacer. Si los llena, se validan.
   */
  const emailValid = email.trim() === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const nitValid = nit.trim() === '' || /^\d+$/.test(nit.trim())
  const telefonoValid = /^\d{8}$/.test(telefono.trim())
  const nombreValid = nombre.trim().length >= 2
  /**
   * Para delivery lo único imprescindible es el punto en el mapa: es lo que
   * define adónde va el repartidor y con lo que se cotiza el envío. Las
   * indicaciones escritas son una ayuda opcional, no un requisito.
   *
   * Para recoger en el local no se pide nada de ubicación.
   */
  const ubicacionLista = tipoEntrega === 'recojo'
    || (lat != null && lng != null && envio?.dentroDeCobertura !== false)
  const datosCompletos = Boolean(
    nombreValid && telefonoValid && emailValid && nitValid && tipoEntrega && paymentMethod && ubicacionLista
  )

  // Reconocer cliente recurrente por teléfono (8 díg.) o carnet/NIT → autollenar nombre
  useEffect(() => {
    const q = telefono.trim().length === 8 ? telefono.trim() : (nit.trim().length >= 5 ? nit.trim() : '')
    if (!q) { setClienteReconocido(null); return }
    let cancelado = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/clientes/lookup?q=${encodeURIComponent(q)}`)
        const json = await res.json()
        if (cancelado) return
        if (json?.data?.nombre) {
          setClienteReconocido(json.data.nombre)
          setNombre(prev => prev.trim() ? prev : json.data.nombre)
        } else {
          setClienteReconocido(null)
        }
      } catch { /* ignorar */ }
    }, 450)
    return () => { cancelado = true; clearTimeout(t) }
  }, [telefono, nit])

  const handleUsarUbicacion = () => {
    setGpsError('')
    if (!('geolocation' in navigator)) {
      setGpsError('Tu navegador no soporta geolocalización.')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); setGpsLoading(false) },
      () => { setGpsError('No se pudo obtener tu ubicación. Tócala en el mapa.'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  /**
   * Arma el link de WhatsApp del local con el pedido escrito.
   *
   * El pedido NO se registra desde acá: la web solo manda el mensaje y quien
   * atiende el WhatsApp cobra, verifica el pago y lo registra en caja marcándolo
   * como pedido web. Así no quedan pedidos fantasma en el sistema por gente que
   * nunca terminó de pagar.
   */
  const construirLinkWhatsApp = (): string | null =>
    linkWhatsAppPedido(sucursal?.telefono, {
      negocio: 'Elevate',
      sucursal: sucursal?.nombre ?? 'Sucursal',
      entrega: tipoEntrega === 'delivery' ? 'delivery' : 'recojo',
      lineas: cart.map(i => ({ nombre: i.name, cantidad: i.quantity, total: i.price * i.quantity })),
      subtotal,
      envio: costoEnvio,
      distanciaKm: envio?.distancia_km ?? null,
      indicaciones: direccion,
      lat,
      lng,
      pago: paymentMethod ?? 'cash',
      cliente: nombre.trim() || 'Cliente',
      telefono: telefono.trim(),
      notas,
    })

  /**
   * Abre WhatsApp con el pedido. La pestaña se pide dentro del mismo clic para
   * que el navegador no la trate como popup; si igual la bloquea, queda el link
   * a la vista para tocarlo a mano.
   */
  const enviarPorWhatsApp = () => {
    const url = construirLinkWhatsApp()
    if (!url) {
      setSubmitError('Esta sucursal todavía no tiene WhatsApp configurado. Escribinos por nuestras redes.')
      return
    }
    if (typeof window !== 'undefined') window.open(url, '_blank')
    // El link viaja a la confirmación: si el navegador bloqueó la pestaña, ahí
    // queda el botón para abrirlo a mano.
    onOrderComplete(url)
  }

  const handleConfirmDatos = () => {
    if (!datosCompletos) return
    // Con QR primero se muestra el código para pagar; el mensaje se manda después.
    if (paymentMethod === 'qr') setStep('qr')
    else enviarPorWhatsApp()
  }

  const handleQRDone = () => enviarPorWhatsApp()

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="checkout-modal"
        initial={{ scale: 0.85, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 280, damping: 25 }}
      >
        <button className="modal-close" onClick={onClose}>{Icons.x}</button>

        <AnimatePresence mode="wait">
          {/* ===== FORMULARIO ÚNICO ===== */}
          {step === 'form' && (
            <motion.div
              key="form"
              className="modal-content"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.25 }}
            >
              <h2 className="modal-title">Datos del pedido</h2>
              <p className="modal-subtitle">Completá tus datos y confirmá</p>

              {/* ENTREGA */}
              <h3 className="checkout-section-title">¿Cómo lo querés?</h3>
              <div className="payment-methods">
                {[
                  { id: 'recojo' as TipoEntrega, label: 'Recoger en el local', sublabel: 'Pasás por tu pedido a la tienda', icon: Icons.home },
                  { id: 'delivery' as TipoEntrega, label: 'Delivery', sublabel: 'Te lo llevamos a tu ubicación', icon: Icons.truck },
                ].map(opt => (
                  <motion.button
                    key={opt.id}
                    type="button"
                    className={`payment-method-btn ${tipoEntrega === opt.id ? 'selected' : ''}`}
                    onClick={() => setTipoEntrega(opt.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="payment-method-icon">{opt.icon}</div>
                    <div className="payment-method-info">
                      <span className="payment-method-label">{opt.label}</span>
                      <span className="payment-method-sub">{opt.sublabel}</span>
                    </div>
                    <div className={`payment-method-check ${tipoEntrega === opt.id ? 'visible' : ''}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </motion.button>
                ))}
              </div>

              {/* PAGO */}
              <h3 className="checkout-section-title">Forma de pago</h3>
              <div className="payment-methods">
                {[
                  { id: 'cash' as PaymentMethod, label: 'Efectivo', sublabel: tipoEntrega === 'delivery' ? 'Pagás al recibir tu pedido' : 'Pagás en el local', icon: Icons.cash },
                  { id: 'qr' as PaymentMethod, label: 'Código QR', sublabel: 'Escaneás y pagás al instante', icon: Icons.qr },
                ].map(method => (
                  <motion.button
                    key={method.id}
                    type="button"
                    className={`payment-method-btn ${paymentMethod === method.id ? 'selected' : ''}`}
                    onClick={() => setPaymentMethod(method.id)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className="payment-method-icon">{method.icon}</div>
                    <div className="payment-method-info">
                      <span className="payment-method-label">{method.label}</span>
                      <span className="payment-method-sub">{method.sublabel}</span>
                    </div>
                    <div className={`payment-method-check ${paymentMethod === method.id ? 'visible' : ''}`}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </motion.button>
                ))}
              </div>

              <h3 className="checkout-section-title">Tus datos</h3>
              {clienteReconocido && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(31,169,113,0.12)', border: '1px solid rgba(31,169,113,0.35)', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 13, color: '#4caf50' }}>
                  ✓ ¡Hola de nuevo, <strong>{clienteReconocido}</strong>! Reconocimos tus datos.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
                {[
                  { id: 'nombre', label: 'Nombre', value: nombre, setter: setNombre, placeholder: 'Ej: Carlos Pérez', type: 'text', inputMode: 'text' as const, digitsOnly: false, maxLen: 0, required: true },
                  { id: 'tel', label: 'Celular de contacto (8 dígitos)', value: telefono, setter: setTelefono, placeholder: 'Ej: 70000000', type: 'tel', inputMode: 'numeric' as const, digitsOnly: true, maxLen: 8, required: true },
                  { id: 'nit', label: 'NIT / C.I. (para factura)', value: nit, setter: setNit, placeholder: 'Opcional', type: 'text', inputMode: 'numeric' as const, digitsOnly: true, maxLen: 0, required: false },
                  { id: 'email', label: 'Correo electrónico', value: email, setter: setEmail, placeholder: 'Opcional', type: 'email', inputMode: 'email' as const, digitsOnly: false, maxLen: 0, required: false },
                  { id: 'desc', label: 'Código de descuento', value: codigoDescuento, setter: setCodigoDescuento, placeholder: 'Opcional', type: 'text', inputMode: 'text' as const, digitsOnly: false, maxLen: 0, required: false },
                ].map(field => {
                  const invalid =
                    (field.id === 'email' && field.value.length > 0 && !emailValid) ||
                    (field.id === 'nit' && field.value.length > 0 && !nitValid) ||
                    (field.id === 'tel' && field.value.length > 0 && !telefonoValid)
                  const errorMsg = field.id === 'email' ? 'Correo no válido'
                    : field.id === 'nit' ? 'Solo números, sin letras ni espacios.'
                    : field.id === 'tel' ? 'Debe tener exactamente 8 dígitos.'
                    : ''
                  return (
                    <div key={field.id}>
                      <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
                        {field.label} {field.required && <span style={{ color: '#ff5c19' }}>*</span>}
                      </label>
                      <input
                        type={field.type}
                        inputMode={field.inputMode}
                        maxLength={field.maxLen || undefined}
                        value={field.value}
                        onChange={e => {
                          let v = e.target.value
                          if (field.digitsOnly) v = v.replace(/\D/g, '')
                          if (field.maxLen) v = v.slice(0, field.maxLen)
                          field.setter(v)
                        }}
                        placeholder={field.placeholder}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.06)',
                          border: `1px solid ${invalid ? 'rgba(239,68,68,0.6)' : field.value ? 'rgba(255,92,25,0.4)' : 'rgba(255,255,255,0.12)'}`,
                          color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color 0.2s',
                        }}
                      />
                      {invalid && <span style={{ color: '#ef4444', fontSize: 11 }}>{errorMsg}</span>}
                    </div>
                  )
                })}

                {/* Nota del cliente: llega a la comanda de cocina y a quien
                    entrega, que es donde sirve. */}
                <div>
                  <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
                    Nota para tu pedido
                  </label>
                  <textarea
                    value={notas}
                    onChange={e => setNotas(e.target.value.slice(0, 300))}
                    rows={3}
                    placeholder={tipoEntrega === 'delivery'
                      ? 'Ej: sin picante, tocar timbre, dejar en portería'
                      : 'Ej: sin picante, para llevar, cubiertos aparte'}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
                      background: 'rgba(255,255,255,0.06)',
                      border: `1px solid ${notas ? 'rgba(255,92,25,0.4)' : 'rgba(255,255,255,0.12)'}`,
                      color: '#fff', fontSize: 14, outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                    }}
                  />
                  <span style={{ fontSize: 11, color: '#888' }}>{notas.length}/300 · opcional</span>
                </div>

                {/* Solo delivery: dirección y punto en el mapa. Para recoger en
                    el local no hay dónde entregar, así que no se piden. */}
                {tipoEntrega === 'delivery' && (
                  <>
                    {/* Ya no es una dirección autocompletada desde el mapa: eso
                        escribía un texto larguísimo de Nominatim que nadie usa.
                        Ahora lo escribe el cliente, para guiar al repartidor
                        hasta la puerta. Dónde entregar lo dice el mapa. */}
                    <div>
                      <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
                        Indicaciones para la entrega
                      </label>
                      <input
                        type="text"
                        value={direccion}
                        onChange={e => setDireccion(e.target.value.slice(0, 200))}
                        placeholder="Opcional. Ej: casa amarilla, portón negro, depto 3B"
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.06)', border: `1px solid ${direccion ? 'rgba(255,92,25,0.4)' : 'rgba(255,255,255,0.12)'}`,
                          color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color 0.2s',
                        }}
                      />
                      <span style={{ fontSize: 11, color: '#888' }}>Referencias que ayuden al repartidor a encontrarte.</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <label style={{ color: '#aaa', fontSize: 12, fontWeight: 500 }}>
                          Ubicación en el mapa <span style={{ color: '#ff5c19' }}>*</span>
                        </label>
                        <button
                          type="button"
                          onClick={handleUsarUbicacion}
                          disabled={gpsLoading}
                          style={{ background: 'none', border: 'none', color: '#ff5c19', fontWeight: 600, fontSize: 12, cursor: gpsLoading ? 'wait' : 'pointer' }}
                        >
                          {gpsLoading ? 'Ubicando…' : '📍 Usar mi ubicación'}
                        </button>
                      </div>
                      <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
                      <span style={{ display: 'block', marginTop: 6, fontSize: 11, color: lat != null ? '#4caf50' : '#888' }}>
                        {lat != null && lng != null
                          ? `✓ Ubicación marcada (${lat.toFixed(5)}, ${lng.toFixed(5)})`
                          : 'Toca el mapa o usa tu ubicación para marcar dónde entregar.'}
                      </span>
                      {gpsError && <span style={{ display: 'block', fontSize: 11, color: '#ef4444' }}>{gpsError}</span>}
                    </div>
                  </>
                )}
              </div>

              {/* Pie fijo: el total no se pierde de vista al scrollear el
                  formulario, que ahora es una sola pantalla. */}
              <div className="checkout-footer">
              <div className="modal-total-box">
                <div className="modal-total-row">
                  <span>{tipoEntrega === 'delivery' ? 'Entrega estimada' : 'Listo para recoger'}</span>
                  <span className="modal-delivery-time">{Icons.clock} 30-45 min</span>
                </div>
                <div className="modal-total-row">
                  <span>Subtotal</span>
                  <span>Bs. {subtotal}</span>
                </div>
                {/* El envío sale de la tarifa del local y la distancia al pin.
                    Aparece recién cuando hay ubicación marcada. */}
                {tipoEntrega === 'delivery' && envio?.dentroDeCobertura && (
                  <div className="modal-total-row">
                    {/* El envío se le paga al repartidor, no al local. */}
                    <span>Envío ({envio.distancia_km.toFixed(1)} km) · al repartidor</span>
                    <span>Bs. {costoEnvio}</span>
                  </div>
                )}
                {tipoEntrega === 'delivery' && envio && !envio.dentroDeCobertura && (
                  <div className="modal-total-row" style={{ color: '#ef4444' }}>
                    <span>Fuera de la zona de reparto ({envio.distancia_km.toFixed(1)} km)</span>
                    <span>—</span>
                  </div>
                )}
                <div className="modal-total-row big">
                  <span>Total a pagar</span>
                  <span className="modal-total-price">Bs. {total}</span>
                </div>
              </div>

              {submitError && (
                <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, color: '#ef4444', fontSize: 13 }}>
                  {submitError}
                </div>
              )}
              {/* Qué falta para poder confirmar. Sin esto, con el botón
                  deshabilitado el cliente no sabe qué le está faltando. */}
              {!datosCompletos && (
                <p style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>
                  Falta: {[
                    !nombreValid && 'tu nombre',
                    !telefonoValid && 'tu celular (8 dígitos)',
                    !emailValid && 'un correo válido',
                    !nitValid && 'un NIT solo con números',
                    !paymentMethod && 'la forma de pago',
                    tipoEntrega === 'delivery' && (lat == null || lng == null) && 'marcar en el mapa dónde entregar',
                  ].filter(Boolean).join(', ')}.
                </p>
              )}
              <motion.button
                className="modal-primary-btn"
                whileHover={datosCompletos ? { scale: 1.02 } : {}}
                whileTap={datosCompletos ? { scale: 0.98 } : {}}
                onClick={handleConfirmDatos}
                disabled={!datosCompletos}
                style={{ opacity: datosCompletos ? 1 : 0.5, cursor: datosCompletos ? 'pointer' : 'not-allowed' }}
              >
                {paymentMethod === 'qr' ? 'Ver Código QR' : '💬 Enviar pedido por WhatsApp'} {Icons.arrowRight}
              </motion.button>
              </div>
            </motion.div>
          )}

          {/* ===== QR STEP ===== */}
          {step === 'qr' && (
            <motion.div
              key="qr"
              className="modal-content"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="modal-title">Escanea para Pagar</h2>
              <p className="modal-subtitle">Apunta tu cámara al código QR para completar el pago</p>
              <div className="qr-container">
                <motion.div
                  className="qr-frame"
                  animate={{ boxShadow: ['0 0 0px rgba(255,92,25,0.3)', '0 0 30px rgba(255,92,25,0.6)', '0 0 0px rgba(255,92,25,0.3)'] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <img src={qrUrl} alt="QR de pago" className="qr-image" />
                </motion.div>
                <div className="qr-amount">
                  <span className="qr-amount-label">Total a pagar</span>
                  <span className="qr-amount-value">Bs. {total}</span>
                </div>
                <div className="qr-instructions">
                  <div className="qr-step">
                    <span className="qr-step-num">1</span>
                    <span>Abre tu app bancaria o Tigo Money</span>
                  </div>
                  <div className="qr-step">
                    <span className="qr-step-num">2</span>
                    <span>Selecciona "Pagar con QR"</span>
                  </div>
                  <div className="qr-step">
                    <span className="qr-step-num">3</span>
                    <span>Escanea el código de arriba</span>
                  </div>
                </div>
              </div>
              <div className="modal-actions">
                <button className="modal-back-btn" onClick={() => setStep('form')}>← Volver</button>
                <motion.button
                  className="modal-primary-btn"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleQRDone}
                >
                  Ya pagué · enviar por WhatsApp 💬
                </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

/* ===== Pedido enviado ===== */
/**
 * Confirmación de que el mensaje salió. Reemplaza al seguimiento del pedido:
 * la web ya no registra nada, así que no hay estados que mostrar. Quien atiende
 * el WhatsApp confirma el pago y el tiempo de entrega.
 */
function PedidoEnviado({ onClose, whatsappUrl }: { onClose: () => void; whatsappUrl?: string | null }) {
  return (
    <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div
        className="checkout-modal"
        initial={{ scale: 0.9, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 30 }}
        transition={{ type: 'spring', stiffness: 280, damping: 25 }}
      >
        <button className="modal-close" onClick={onClose}>{Icons.x}</button>
        <Confetti />
        <div className="modal-content confirming-content">
          <div style={{ fontSize: 46 }}>💬</div>
          <h3>¡Listo! Tu pedido salió por WhatsApp</h3>
          <p>
            Revisá la conversación y envialo si quedó sin mandar. Te confirmamos el pago
            y el tiempo de entrega por ahí mismo.
          </p>
          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="modal-primary-btn"
              style={{ marginTop: 18, textDecoration: 'none', display: 'inline-flex', gap: 8, justifyContent: 'center' }}
            >
              💬 Abrir WhatsApp
            </a>
          )}
          <button className="modal-back-btn" style={{ marginTop: 14 }} onClick={onClose}>Seguir viendo el menú</button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ===== useShop hook: cart state + order flow, shared across pages ===== */
export function useShop() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  /** Confirmación de que el mensaje salió. Antes acá vivía el seguimiento del pedido. */
  const [enviadoOpen, setEnviadoOpen] = useState(false)
  /** Link por si el navegador bloqueó la pestaña de WhatsApp. */
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null)
  const [addedProductId, setAddedProductId] = useState<number | null>(null)

  // Lock body scroll when overlays open
  useEffect(() => {
    if (cartOpen || checkoutOpen || enviadoOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [cartOpen, checkoutOpen, enviadoOpen])

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0)

  const addToCart = useCallback((product: AddableProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, precio_original: product.precio_original, descuentoAplicado: product.descuentoAplicado, quantity: 1, icon: product.icon, category: product.category }]
    })
    setAddedProductId(product.id)
    setTimeout(() => setAddedProductId(null), 700)
  }, [])

  const updateQty = useCallback((id: number, delta: number) => {
    setCart(prev => prev.map(i => {
      if (i.id !== id) return i
      const newQty = i.quantity + delta
      return newQty < 1 ? i : { ...i, quantity: newQty }
    }))
  }, [])

  const removeItem = useCallback((id: number) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }, [])

  const openCart = useCallback(() => setCartOpen(true), [])

  const handleCheckout = () => {
    setCartOpen(false)
    setTimeout(() => setCheckoutOpen(true), 300)
  }

  /**
   * El pedido ya salió por WhatsApp. Se vacía el carrito y se confirma; no hay
   * pedido que guardar ni seguir, porque la web no registra nada: lo registra
   * quien atiende el WhatsApp cuando cobra.
   */
  const handleOrderComplete = (linkWhatsApp?: string | null) => {
    setWhatsappUrl(linkWhatsApp ?? null)
    setCheckoutOpen(false)
    setCart([])
    setTimeout(() => setEnviadoOpen(true), 300)
  }

  return {
    cart,
    cartCount,
    addedProductId,
    addToCart,
    updateQty,
    removeItem,
    openCart,
    // internal state exposed for ShopOverlays
    cartOpen,
    setCartOpen,
    checkoutOpen,
    setCheckoutOpen,
    enviadoOpen,
    setEnviadoOpen,
    whatsappUrl,
    handleCheckout,
    handleOrderComplete,
  }
}

export type ShopState = ReturnType<typeof useShop>



/* ===== ShopOverlays: FAB + cart drawer + checkout + tracker ===== */
export function ShopOverlays({ shop }: { shop: ShopState }) {
  return (
    <>
      {/* CART FAB */}
      <AnimatePresence>
        {shop.cartCount > 0 && (
          <motion.button
            className="cart-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={shop.openCart}
            title="Ver carrito"
          >
            {Icons.shoppingCart}
            <motion.span
              className="cart-fab-badge"
              key={shop.cartCount}
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 500 }}
            >
              {shop.cartCount}
            </motion.span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* CART DRAWER */}
      <AnimatePresence>
        {shop.cartOpen && (
          <CartDrawer
            cart={shop.cart}
            onClose={() => shop.setCartOpen(false)}
            onUpdateQty={shop.updateQty}
            onRemove={shop.removeItem}
            onCheckout={shop.handleCheckout}
          />
        )}
      </AnimatePresence>

      {/* CHECKOUT MODAL */}
      <AnimatePresence>
        {shop.checkoutOpen && (
          <CheckoutModal
            cart={shop.cart}
            onClose={() => shop.setCheckoutOpen(false)}
            onOrderComplete={shop.handleOrderComplete}
          />
        )}
      </AnimatePresence>

      {/* PEDIDO ENVIADO */}
      <AnimatePresence>
        {shop.enviadoOpen && (
          <PedidoEnviado
            onClose={() => shop.setEnviadoOpen(false)}
            whatsappUrl={shop.whatsappUrl}
          />
        )}
      </AnimatePresence>
    </>
  )
}
