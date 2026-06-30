'use client';

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Icons } from './icons'

/* ===== Types ===== */
export type CartItem = {
  id: number
  name: string
  price: number
  quantity: number
  icon: React.ReactNode
  category: string
}

export type AddableProduct = {
  id: number
  name: string
  price: number
  icon: React.ReactNode
  category: string
}

type PaymentMethod = 'cash' | 'card' | 'qr'
type TipoEntrega = 'recojo' | 'delivery'

type OrderStatus = 'preparing' | 'atlocal' | 'ontheway' | 'arrived' | 'delivered'

// Flujo para pedidos por delivery (con repartidor)
const ORDER_STEPS: { status: OrderStatus; label: string; sublabel: string; icon: React.ReactNode }[] = [
  { status: 'preparing', label: 'Preparando tu pedido', sublabel: 'Nuestros chefs están en acción', icon: Icons.package },
  { status: 'atlocal', label: 'Repartidor en el local', sublabel: 'El repartidor está recogiendo tu pedido', icon: Icons.home },
  { status: 'ontheway', label: 'En camino', sublabel: 'Tu repartidor va hacia ti', icon: Icons.bike },
  { status: 'arrived', label: 'Repartidor llegó', sublabel: 'Está en tu ubicación', icon: Icons.truck },
  { status: 'delivered', label: '¡Entregado!', sublabel: '¡Buen provecho!', icon: Icons.checkCircle },
]

// Flujo para pedidos de recoger en el local (sin repartidor)
const PICKUP_STEPS: { label: string; sublabel: string; icon: React.ReactNode }[] = [
  { label: 'Preparando tu pedido', sublabel: 'Nuestros chefs están en acción', icon: Icons.package },
  { label: 'Listo para recoger', sublabel: 'Pásalo a retirar por el local', icon: Icons.shoppingCart },
  { label: 'Pedido culminado', sublabel: '¡Gracias por tu compra!', icon: Icons.checkCircle },
]

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
                      <div className="cart-item-price">Bs. {item.price * item.quantity}</div>
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
                <div className="cart-summary-row">
                  <span>Delivery</span>
                  <span className="free-delivery">Gratis</span>
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
  onOrderComplete: (pedidoId?: number, tipoEntrega?: TipoEntrega) => void
}) {
  const [step, setStep] = useState<'entrega' | 'payment' | 'datos' | 'qr' | 'confirming'>('entrega')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null)
  const [nombre, setNombre] = useState('')
  const [nit, setNit] = useState('')
  const [email, setEmail] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsLoading, setGpsLoading] = useState(false)
  const [codigoDescuento, setCodigoDescuento] = useState('')
  const [clienteReconocido, setClienteReconocido] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const total = cart.reduce((acc, item) => acc + item.price * item.quantity, 0)

  const qrData = encodeURIComponent(`Elevate Food | Pago Bs.${total} | ${nombre || 'Cliente'}`)
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}&bgcolor=1e1e1e&color=ff5c19&margin=10`

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  const nitValid = /^\d+$/.test(nit.trim())
  const telefonoValid = /^\d{8}$/.test(telefono.trim())
  const datosCompletos = Boolean(
    nombre.trim() && nitValid && emailValid && telefonoValid &&
    (tipoEntrega === 'recojo' || (direccion.trim() && lat != null && lng != null))
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

  // Convierte coordenadas en una dirección legible y la coloca en el campo dirección
  const reverseGeocode = async (la: number, ln: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${la}&lon=${ln}`, {
        headers: { 'Accept': 'application/json' },
      })
      const j = await res.json()
      if (j?.display_name) setDireccion(j.display_name)
    } catch { /* ignorar: el usuario puede escribir la dirección a mano */ }
  }

  const handleUsarUbicacion = () => {
    setGpsError('')
    if (!('geolocation' in navigator)) {
      setGpsError('Tu navegador no soporta geolocalización.')
      return
    }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      pos => { setLat(pos.coords.latitude); setLng(pos.coords.longitude); reverseGeocode(pos.coords.latitude, pos.coords.longitude); setGpsLoading(false) },
      () => { setGpsError('No se pudo obtener tu ubicación. Tócala en el mapa.'); setGpsLoading(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const submitOrder = async (): Promise<number | undefined> => {
    setIsSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/pedidos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cliente_nombre: nombre || 'Cliente',
          cliente_nit: nit,
          cliente_email: email,
          cliente_telefono: telefono,
          cliente_direccion: direccion,
          cliente_lat: lat,
          cliente_lng: lng,
          tipo_entrega: tipoEntrega,
          codigo_descuento: codigoDescuento,
          metodo_pago: paymentMethod,
          items: cart.map(i => ({ nombre: i.name, precio: i.price, cantidad: i.quantity })),
          total,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al crear pedido')
      return data.data?.id as number | undefined
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Error al procesar el pedido')
      return undefined
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleConfirmDatos = async () => {
    if (!datosCompletos) return
    if (paymentMethod === 'qr') {
      setStep('qr')
    } else {
      setStep('confirming')
      const pedidoId = await submitOrder()
      if (!pedidoId) { setStep('datos'); return }
      setTimeout(() => onOrderComplete(pedidoId, tipoEntrega ?? undefined), 800)
    }
  }

  const handleQRDone = async () => {
    setStep('confirming')
    const pedidoId = await submitOrder()
    if (!pedidoId) { setStep('datos'); return }
    setTimeout(() => onOrderComplete(pedidoId, tipoEntrega ?? undefined), 800)
  }

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

        {/* Step indicators */}
        <div className="modal-steps">
          {['Entrega', 'Pago', 'Datos', 'Confirmar'].map((s, i) => {
            const currentStep = step === 'entrega' ? 0 : step === 'payment' ? 1 : step === 'datos' ? 2 : step === 'qr' ? 3 : 3
            return (
              <div key={s} className={`modal-step ${i <= currentStep ? 'active' : ''}`}>
                <div className="modal-step-dot">{i < currentStep ? '✓' : i + 1}</div>
                <span>{s}</span>
              </div>
            )
          })}
        </div>

        <AnimatePresence mode="wait">
          {/* ===== ENTREGA STEP ===== */}
          {step === 'entrega' && (
            <motion.div
              key="entrega"
              className="modal-content"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="modal-title">¿Cómo quieres tu pedido?</h2>
              <p className="modal-subtitle">Elige cómo deseas recibirlo</p>
              <div className="payment-methods">
                {[
                  { id: 'recojo' as TipoEntrega, label: 'Recoger en el local', sublabel: 'Pasa por tu pedido a la tienda', icon: Icons.home },
                  { id: 'delivery' as TipoEntrega, label: 'Delivery', sublabel: 'Te lo llevamos a tu ubicación', icon: Icons.truck },
                ].map(opt => (
                  <motion.button
                    key={opt.id}
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
              <motion.button
                className="modal-primary-btn"
                whileHover={tipoEntrega ? { scale: 1.02 } : {}}
                whileTap={tipoEntrega ? { scale: 0.98 } : {}}
                onClick={() => { if (tipoEntrega) setStep('payment') }}
                disabled={!tipoEntrega}
                style={{ opacity: tipoEntrega ? 1 : 0.5, cursor: tipoEntrega ? 'pointer' : 'not-allowed' }}
              >
                Continuar {Icons.arrowRight}
              </motion.button>
            </motion.div>
          )}

          {/* ===== PAYMENT STEP ===== */}
          {step === 'payment' && (
            <motion.div
              key="payment"
              className="modal-content"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="modal-title">Método de Pago</h2>
              <p className="modal-subtitle">Selecciona cómo deseas pagar</p>
              <div
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(255,92,25,0.08)', borderRadius: 10, padding: '8px 14px', marginBottom: 16, fontSize: 13, color: '#aaa' }}
              >
                <span>{tipoEntrega === 'delivery' ? '🛵 Delivery' : '🏪 Recoger en el local'}</span>
                <button type="button" onClick={() => setStep('entrega')} style={{ background: 'none', border: 'none', color: '#ff5c19', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Cambiar</button>
              </div>
              <div className="payment-methods">
                {[
                  { id: 'cash' as PaymentMethod, label: 'Efectivo', sublabel: tipoEntrega === 'delivery' ? 'Paga al recibir tu pedido' : 'Paga en el local', icon: Icons.cash },
                  { id: 'card' as PaymentMethod, label: 'Tarjeta', sublabel: 'Débito o crédito', icon: Icons.transfer },
                  { id: 'qr' as PaymentMethod, label: 'Código QR', sublabel: 'Escanea y paga al instante', icon: Icons.qr },
                ].map(method => (
                  <motion.button
                    key={method.id}
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
              <div className="modal-actions">
                <button className="modal-back-btn" onClick={() => setStep('entrega')}>← Volver</button>
                <motion.button
                  className="modal-primary-btn"
                  whileHover={paymentMethod ? { scale: 1.02 } : {}}
                  whileTap={paymentMethod ? { scale: 0.98 } : {}}
                  onClick={() => { if (paymentMethod) setStep('datos') }}
                  disabled={!paymentMethod}
                  style={{ opacity: paymentMethod ? 1 : 0.5, cursor: paymentMethod ? 'pointer' : 'not-allowed' }}
                >
                  Continuar {Icons.arrowRight}
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ===== DATOS STEP ===== */}
          {step === 'datos' && (
            <motion.div
              key="datos"
              className="modal-content"
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ duration: 0.3 }}
            >
              <h2 className="modal-title">Datos de Facturación</h2>
              <p className="modal-subtitle">Completa tus datos para emitir tu pedido</p>
              {clienteReconocido && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(31,169,113,0.12)', border: '1px solid rgba(31,169,113,0.35)', borderRadius: 10, padding: '8px 14px', marginBottom: 14, fontSize: 13, color: '#4caf50' }}>
                  ✓ ¡Hola de nuevo, <strong>{clienteReconocido}</strong>! Reconocimos tus datos.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
                {[
                  { id: 'nombre', label: 'Nombre o razón social', value: nombre, setter: setNombre, placeholder: 'Ej: Carlos Pérez', type: 'text', inputMode: 'text' as const, digitsOnly: false, maxLen: 0, required: true },
                  { id: 'nit', label: 'NIT / C.I. (solo números)', value: nit, setter: setNit, placeholder: 'Ej: 1234567', type: 'text', inputMode: 'numeric' as const, digitsOnly: true, maxLen: 0, required: true },
                  { id: 'email', label: 'Correo electrónico', value: email, setter: setEmail, placeholder: 'tu@correo.com', type: 'email', inputMode: 'email' as const, digitsOnly: false, maxLen: 0, required: true },
                  { id: 'tel', label: 'Celular de contacto (8 dígitos)', value: telefono, setter: setTelefono, placeholder: 'Ej: 70000000', type: 'tel', inputMode: 'numeric' as const, digitsOnly: true, maxLen: 8, required: true },
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

                {tipoEntrega === 'delivery' && (
                  <>
                    <div>
                      <label style={{ display: 'block', color: '#aaa', fontSize: 12, marginBottom: 6, fontWeight: 500 }}>
                        Dirección de entrega <span style={{ color: '#ff5c19' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={direccion}
                        onChange={e => setDireccion(e.target.value)}
                        placeholder="Ej: Av. Roca y Coronado #342"
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10, boxSizing: 'border-box',
                          background: 'rgba(255,255,255,0.06)', border: `1px solid ${direccion ? 'rgba(255,92,25,0.4)' : 'rgba(255,255,255,0.12)'}`,
                          color: '#fff', fontSize: 14, outline: 'none', transition: 'border-color 0.2s',
                        }}
                      />
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
                      <LocationPicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln); reverseGeocode(la, ln); }} />
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

              <div className="modal-total-box">
                <div className="modal-total-row">
                  <span>{tipoEntrega === 'delivery' ? 'Entrega estimada' : 'Listo para recoger'}</span>
                  <span className="modal-delivery-time">{Icons.clock} 30-45 min</span>
                </div>
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
              <div className="modal-actions">
                <button className="modal-back-btn" onClick={() => setStep('payment')}>← Volver</button>
                <motion.button
                  className="modal-primary-btn"
                  whileHover={datosCompletos && !isSubmitting ? { scale: 1.02 } : {}}
                  whileTap={datosCompletos && !isSubmitting ? { scale: 0.98 } : {}}
                  onClick={handleConfirmDatos}
                  disabled={!datosCompletos || isSubmitting}
                  style={{ opacity: datosCompletos && !isSubmitting ? 1 : 0.5, cursor: datosCompletos && !isSubmitting ? 'pointer' : 'not-allowed' }}
                >
                  {isSubmitting ? '⏳ Procesando...' : paymentMethod === 'qr' ? 'Ver Código QR' : 'Confirmar Pedido'} {!isSubmitting && Icons.arrowRight}
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
                <button className="modal-back-btn" onClick={() => setStep('datos')}>← Volver</button>
                <motion.button
                  className="modal-primary-btn"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleQRDone}
                >
                  Ya pagué ✓
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* ===== CONFIRMING STEP ===== */}
          {step === 'confirming' && (
            <motion.div
              key="confirming"
              className="modal-content confirming-content"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <motion.div
                className="confirming-icon"
                animate={{ rotate: 360 }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
              >
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                </svg>
              </motion.div>
              <h3>Confirmando pedido...</h3>
              <p>Por favor espera un momento</p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}

/* ===== Delivery Map (Leaflet / OpenStreetMap) ===== */

// Real route waypoints through Santa Cruz de la Sierra streets
const ROUTE_COORDS: [number, number][] = [
  [-17.7699, -63.1975], // Elevate Kitchen (origen)
  [-17.7712, -63.1945],
  [-17.7728, -63.1920],
  [-17.7745, -63.1890],
  [-17.7758, -63.1855],
  [-17.7770, -63.1820],
  [-17.7783, -63.1790],
  [-17.7800, -63.1760],
  [-17.7818, -63.1735], // Tu dirección (destino)
]

function DeliveryMap({ currentStep, totalSteps, driverPos }: { currentStep: number; totalSteps: number; driverPos?: [number, number] | null }) {
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<import('leaflet').Map | null>(null)
  const riderMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const routeLineRef = useRef<import('leaflet').Polyline | null>(null)
  const progressLineRef = useRef<import('leaflet').Polyline | null>(null)
  const originMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const destMarkerRef = useRef<import('leaflet').Marker | null>(null)
  const isDelivered = currentStep === totalSteps - 1

  // Get interpolated lat/lng for the rider along the route
  const getRiderLatLng = (step: number): [number, number] => {
    if (driverPos) return driverPos;
    const t = step / (totalSteps - 1)
    if (t <= 0) return ROUTE_COORDS[0]
    if (t >= 1) return ROUTE_COORDS[ROUTE_COORDS.length - 1]
    const scaled = t * (ROUTE_COORDS.length - 1)
    const i = Math.floor(scaled)
    const frac = scaled - i
    const a = ROUTE_COORDS[i]
    const b = ROUTE_COORDS[Math.min(i + 1, ROUTE_COORDS.length - 1)]
    return [
      a[0] + (b[0] - a[0]) * frac,
      a[1] + (b[1] - a[1]) * frac,
    ]
  }

  // How many route coords to show as "done" (orange)
  const getDoneCoords = (step: number): [number, number][] => {
    const t = step / (totalSteps - 1)
    const scaled = t * (ROUTE_COORDS.length - 1)
    const i = Math.floor(scaled)
    const rider = getRiderLatLng(step)
    return [...ROUTE_COORDS.slice(0, i + 1), rider]
  }

  // Initialize map once
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return

    const initMap = async () => {
      const container = mapRef.current
      // Synchronous guard against React StrictMode's double-mount: Leaflet stamps
      // the container with `_leaflet_id` once initialized.
      if (!container || (container as unknown as { _leaflet_id?: number })._leaflet_id) return
      const L = await import('leaflet')
      // Re-check after the async import in case the second mount already ran.
      if (leafletMapRef.current || (container as unknown as { _leaflet_id?: number })._leaflet_id) return

      const map = L.map(container, {
        center: [-17.7750, -63.1855],
        zoom: 14,
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
        attributionControl: false,
      })

      // Dark tile layer (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      // Full route (gray dashed)
      const fullLine = L.polyline(ROUTE_COORDS, {
        color: 'rgba(255,255,255,0.15)',
        weight: 4,
        dashArray: '8 10',
        lineCap: 'round',
      }).addTo(map)
      routeLineRef.current = fullLine

      // Progress route (orange)
      const progressLine = L.polyline(getDoneCoords(0), {
        color: '#ff5c19',
        weight: 5,
        lineCap: 'round',
      }).addTo(map)
      progressLineRef.current = progressLine

      // Origin marker
      const originIcon = L.divIcon({
        className: '',
        html: `<div class="lf-origin-marker"><div class="lf-origin-dot"></div><div class="lf-origin-label">Elevate Kitchen</div></div>`,
        iconSize: [120, 36],
        iconAnchor: [8, 8],
      })
      originMarkerRef.current = L.marker(ROUTE_COORDS[0], { icon: originIcon }).addTo(map)

      // Destination marker
      const destIcon = L.divIcon({
        className: '',
        html: `<div class="lf-dest-marker"><div class="lf-dest-pin"></div><div class="lf-dest-label">Tu dirección</div></div>`,
        iconSize: [100, 52],
        iconAnchor: [12, 40],
      })
      destMarkerRef.current = L.marker(ROUTE_COORDS[ROUTE_COORDS.length - 1], { icon: destIcon }).addTo(map)

      // Rider marker
      const riderIcon = L.divIcon({
        className: '',
        html: `<div class="lf-rider-marker"><div class="lf-rider-pulse"></div><div class="lf-rider-circle"><span>🚴</span></div><div class="lf-rider-label">Repartidor</div></div>`,
        iconSize: [60, 70],
        iconAnchor: [30, 50],
      })
      riderMarkerRef.current = L.marker(getRiderLatLng(0), { icon: riderIcon, zIndexOffset: 1000 }).addTo(map)

      leafletMapRef.current = map
      // The modal animates in with transform: scale(), so Leaflet measures the
      // container too early → gray tiles. Recompute size once mounted and again
      // after the entrance spring (~280-320ms) settles.
      map.whenReady(() => map.invalidateSize())
      setTimeout(() => map.invalidateSize(), 350)
    }

    initMap()

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
        riderMarkerRef.current = null
        routeLineRef.current = null
        progressLineRef.current = null
        originMarkerRef.current = null
        destMarkerRef.current = null
      }
    }
  }, [])

  // Update rider position and progress line when step changes
  useEffect(() => {
    if (!leafletMapRef.current) return

    const updateMap = async () => {
      const L = await import('leaflet')
      const riderLatLng = getRiderLatLng(currentStep)

      // Move rider marker
      if (riderMarkerRef.current) {
        riderMarkerRef.current.setLatLng(riderLatLng)

        // Update icon for delivered state
        const html = isDelivered
          ? `<div class="lf-rider-marker delivered"><div class="lf-rider-pulse delivered-pulse"></div><div class="lf-rider-circle delivered-circle"><span>✓</span></div><div class="lf-rider-label">¡Entregado!</div></div>`
          : `<div class="lf-rider-marker"><div class="lf-rider-pulse"></div><div class="lf-rider-circle"><span>🚴</span></div><div class="lf-rider-label">Repartidor</div></div>`

        const riderIcon = L.divIcon({
          className: '',
          html,
          iconSize: [60, 70],
          iconAnchor: [30, 50],
        })
        riderMarkerRef.current.setIcon(riderIcon)
        leafletMapRef.current!.panTo(riderLatLng, { animate: true, duration: 1 })
      }

      // Update progress line
      if (progressLineRef.current) {
        progressLineRef.current.setLatLngs(getDoneCoords(currentStep))
      }
    }

    updateMap()
  }, [currentStep, isDelivered, driverPos])

  const progress = currentStep / (totalSteps - 1)

  return (
    <div className="delivery-map">
      {/* Header */}
      <div className="delivery-map-header">
        <div className="delivery-map-header-dot" />
        <span>Seguimiento en tiempo real · Santa Cruz, Bolivia</span>
        <div className="delivery-map-live">LIVE</div>
      </div>

      {/* Leaflet Map Container */}
      <div ref={mapRef} className="leaflet-map-container" />

      {/* Footer progress bar */}
      <div className="delivery-map-footer">
        <div className="delivery-map-origin">
          <div className="delivery-map-origin-dot" />
          <span>Elevate Kitchen</span>
        </div>
        <div className="delivery-map-route-line">
          <motion.div
            className="delivery-map-route-fill"
            animate={{ width: `${progress * 100}%` }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
        <div className="delivery-map-dest">
          <span>Tu dirección</span>
          <div className="delivery-map-dest-dot" />
        </div>
      </div>
    </div>
  )
}

const PEDIDO_STORAGE_KEY = 'elevate_pedido_activo';

/* ===== Order Tracker ===== */
function OrderTracker({ onClose, pedidoId, tipoEntrega }: { onClose: () => void; pedidoId?: number; tipoEntrega?: TipoEntrega }) {

  const [currentStep, setCurrentStep] = useState(0)
  const [showConfetti, setShowConfetti] = useState(false)
  const [driverPos, setDriverPos] = useState<[number, number] | null>(null)
  const [isPickup, setIsPickup] = useState(tipoEntrega === 'recojo')
  const [codigo, setCodigo] = useState<string | null>(null)
  const fallbackRef = useRef(`#${Math.floor(Math.random() * 9000) + 1000}`)
  const orderNumber = pedidoId ? `#${pedidoId}` : fallbackRef.current

  const steps = isPickup ? PICKUP_STEPS : ORDER_STEPS
  const finalStep = steps.length - 1

  useEffect(() => {
    if (!pedidoId) {
      // Demo fallback if no pedidoId
      if (currentStep < finalStep) {
        const timer = setTimeout(() => setCurrentStep(prev => prev + 1), 3000)
        return () => clearTimeout(timer)
      }
      return;
    }

    let pollingInterval: NodeJS.Timeout;
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/pedidos/${pedidoId}`);
        const data = await res.json();
        if (data.data) {
          const { estado, driver_lat, driver_lng, tipo_entrega, codigo: cod } = data.data;
          const pickup = tipo_entrega === 'RECOJO';
          setIsPickup(pickup);
          if (cod) setCodigo(cod);

          let stepIndex = 0;
          let lastStep: number;
          if (pickup) {
            // Recojo: Preparando → Listo para recoger → Culminado
            if (estado === 'LISTO') stepIndex = 1;
            else if (estado === 'ENTREGADO' || estado === 'PAGADO') stepIndex = 2;
            else stepIndex = 0; // PENDIENTE / EN_PREPARACION
            lastStep = PICKUP_STEPS.length - 1;
          } else {
            // Delivery: Preparando → Repartidor en el local → En camino → Llegó → Entregado
            if (estado === 'EN_LOCAL') stepIndex = 1;
            else if (estado === 'EN_CAMINO') stepIndex = 2;
            else if (estado === 'LLEGO') stepIndex = 3;
            else if (estado === 'ENTREGADO' || estado === 'PAGADO') stepIndex = 4;
            else stepIndex = 0; // PENDIENTE / EN_PREPARACION / LISTO
            lastStep = ORDER_STEPS.length - 1;
            if (driver_lat && driver_lng) {
              setDriverPos([driver_lat, driver_lng]);
            }
          }

          setCurrentStep(stepIndex);

          if (stepIndex === lastStep) {
             clearInterval(pollingInterval);
          }
        }
      } catch (err) {
        console.error('Error fetching order status:', err);
      }
    };

    fetchStatus();
    pollingInterval = setInterval(fetchStatus, 5000);

    return () => clearInterval(pollingInterval);
  }, [pedidoId, currentStep]);

  useEffect(() => {
    if (currentStep === finalStep) {
      setShowConfetti(true)
      try { localStorage.removeItem(PEDIDO_STORAGE_KEY) } catch {}
      const t = setTimeout(() => setShowConfetti(false), 3000)
      return () => clearTimeout(t)
    }
  }, [currentStep, finalStep])

  const currentInfo = steps[currentStep] ?? steps[0]
  const estimatedTime = isPickup
    ? (currentStep === 0 ? '20 min' : currentStep === 1 ? '¡Listo!' : '✓')
    : (currentStep === 0 ? '40 min' : currentStep === 1 ? '30 min' : currentStep === 2 ? '15 min' : currentStep === 3 ? '¡Llegó!' : '✓')

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {showConfetti && <Confetti />}
      <motion.div
        className="order-tracker-modal"
        initial={{ scale: 0.85, opacity: 0, y: 40 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.85, opacity: 0, y: 40 }}
        transition={{ type: 'spring', stiffness: 280, damping: 25 }}
      >
        <div className="tracker-header">
          <div className="tracker-order-num">Pedido {orderNumber}</div>
          <div className="tracker-eta">
            {Icons.clock}
            <span>{estimatedTime}</span>
          </div>
        </div>

        {codigo && currentStep < finalStep && (
          <div style={{ margin: '0 0 14px', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,92,25,0.1)', border: '1px solid rgba(255,92,25,0.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>
              {isPickup ? 'Muestra este código para recoger tu pedido' : 'Código de tu pedido'}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 4, color: '#ff5c19' }}>{codigo}</div>
          </div>
        )}

        {/* Current status hero */}
        <div className="tracker-status-hero">
          <motion.div
            className={`tracker-status-icon ${currentStep === finalStep ? 'delivered' : ''}`}
            animate={currentStep < finalStep
              ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }
              : { scale: [1, 1.2, 1] }
            }
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            {currentInfo.icon}
          </motion.div>
          <h2 className="tracker-status-title">{currentInfo.label}</h2>
          <p className="tracker-status-sub">{currentInfo.sublabel}</p>
        </div>

        {/* Progress steps */}
        <div className="tracker-steps">
          {steps.map((step, i) => (
            <div key={i} className="tracker-step-row">
              <div className={`tracker-step-dot ${i <= currentStep ? 'done' : ''} ${i === currentStep ? 'current' : ''}`}>
                {i < currentStep ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : i === currentStep ? (
                  <motion.div
                    className="step-pulse"
                    animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                ) : null}
              </div>
              <div className={`tracker-step-info ${i <= currentStep ? 'done' : ''}`}>
                <span className="tracker-step-label">{step.label}</span>
                <span className="tracker-step-sub">{step.sublabel}</span>
              </div>
              {i < finalStep && (
                <div className="tracker-step-line-container">
                  <div className="tracker-step-line-bg" />
                  <motion.div
                    className="tracker-step-line-fill"
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: i < currentStep ? 1 : 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Delivery Map — solo para pedidos con repartidor */}
        {!isPickup && (
          <DeliveryMap currentStep={currentStep} totalSteps={ORDER_STEPS.length} driverPos={driverPos} />
        )}

        {currentStep === finalStep && (
          <motion.button
            className="tracker-done-btn"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
          >
            ¡Gracias por tu pedido! 🎉
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  )
}

/* ===== useShop hook: cart state + order flow, shared across pages ===== */
export function useShop() {
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [orderTrackerOpen, setOrderTrackerOpen] = useState(false)
  const [addedProductId, setAddedProductId] = useState<number | null>(null)
  const [currentPedidoId, setCurrentPedidoId] = useState<number | undefined>(undefined)
  const [currentTipoEntrega, setCurrentTipoEntrega] = useState<TipoEntrega | undefined>(undefined)

  // Restore active order from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PEDIDO_STORAGE_KEY)
      if (saved) {
        const id = Number(saved)
        if (!isNaN(id) && id > 0) {
          setCurrentPedidoId(id)
          setOrderTrackerOpen(true)
        }
      }
    } catch {}
  }, [])

  // Lock body scroll when overlays open
  useEffect(() => {
    if (cartOpen || checkoutOpen || orderTrackerOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [cartOpen, checkoutOpen, orderTrackerOpen])

  const cartCount = cart.reduce((acc, item) => acc + item.quantity, 0)

  const addToCart = useCallback((product: AddableProduct) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id)
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      }
      return [...prev, { id: product.id, name: product.name, price: product.price, quantity: 1, icon: product.icon, category: product.category }]
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

  const handleOrderComplete = (pedidoId?: number, tipoEntrega?: TipoEntrega) => {
    setCurrentPedidoId(pedidoId)
    setCurrentTipoEntrega(tipoEntrega)
    setCheckoutOpen(false)
    setCart([])
    if (pedidoId) {
      try { localStorage.setItem(PEDIDO_STORAGE_KEY, String(pedidoId)) } catch {}
    }
    setTimeout(() => setOrderTrackerOpen(true), 300)
  }

  const clearActivePedido = useCallback(() => {
    setCurrentPedidoId(undefined)
    setOrderTrackerOpen(false)
    try { localStorage.removeItem(PEDIDO_STORAGE_KEY) } catch {}
  }, [])

  return {
    cart,
    cartCount,
    addedProductId,
    addToCart,
    updateQty,
    removeItem,
    openCart,
    currentPedidoId,
    currentTipoEntrega,
    clearActivePedido,
    // internal state exposed for ShopOverlays
    cartOpen,
    setCartOpen,
    checkoutOpen,
    setCheckoutOpen,
    orderTrackerOpen,
    setOrderTrackerOpen,
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

      {/* ORDER TRACKER */}
      <AnimatePresence>
        {shop.orderTrackerOpen && (
          <OrderTracker
            onClose={shop.clearActivePedido}
            pedidoId={shop.currentPedidoId}
            tipoEntrega={shop.currentTipoEntrega}
          />
        )}
      </AnimatePresence>
    </>
  )
}
