'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import ConfirmDialog from '@/components/ConfirmDialog';
import AlertPopup from '@/components/AlertPopup';
import MethodPill from '@/components/ui/MethodPill';
import MoneyText from '@/components/ui/MoneyText';
import EmptyState from '@/components/ui/EmptyState';
import { useRegistrarVenta } from '@/hooks/caja';

type Metodo = 'EFECTIVO' | 'QR' | 'TARJETA';

interface Producto {
  id: number;
  nombre: string;
  descripcion?: string | null;
  precio: number;
  disponible: boolean;
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
  const [cart, setCart] = useState<CartItem[]>([]);
  const [metodoPago, setMetodoPago] = useState<Metodo>('EFECTIVO');
  const [esCortesia, setEsCortesia] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alert, setAlert] = useState<{ title: string; description: string; type: 'success' | 'error' | 'warning' } | null>(null);

  useEffect(() => {
    fetch('/api/productos')
      .then(res => res.json())
      .then(body => setProductos((body.data ?? []).filter((p: Producto) => p.disponible)))
      .catch(() => setAlert({ title: 'Error', description: 'No se pudieron cargar productos.', type: 'error' }))
      .finally(() => setLoading(false));
  }, []);

  const filtrados = productos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()));
  const total = useMemo(() => cart.reduce((sum, item) => sum + item.precio * item.cantidad, 0), [cart]);

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
      const venta = await registrarVenta.mutateAsync({
        items: cart.map(item => ({ producto_id: item.id, cantidad: item.cantidad })),
        metodo_pago: metodoPago,
        es_cortesia: esCortesia,
      });
      setConfirmOpen(false);
      setCart([]);
      setEsCortesia(false);
      setAlert({ title: 'Venta registrada', description: `Venta #${venta.id} creada correctamente.`, type: 'success' });
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
        title="Confirmar venta"
        description={`Total informativo: Bs ${total.toFixed(2)} · Método: ${metodoPago}${esCortesia ? ' · Cortesía' : ''}`}
        confirmLabel="Cobrar"
        isLoading={registrarVenta.isPending}
      />

      <div className="admin-page-header">
        <div>
          <h1>Venta</h1>
          <p>POS rápido de mostrador. El total real se recalcula en servidor.</p>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dash-card span-8">
          <div className="admin-search" style={{ width: '100%', marginBottom: 18 }}>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto..." />
          </div>
          {loading ? (
            <div style={{ minHeight: 220 }} />
          ) : filtrados.length === 0 ? (
            <EmptyState title="Sin productos" hint="No hay productos disponibles para venta." />
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
            <div className="review-stat">
              <div className="review-stat-label">Total informativo</div>
              <div className="review-stat-val"><MoneyText value={total} /></div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['EFECTIVO', 'QR', 'TARJETA'] as Metodo[]).map(metodo => (
                <button key={metodo} className={`cat-filter-btn ${metodoPago === metodo ? 'active' : ''}`} type="button" onClick={() => setMetodoPago(metodo)}>
                  <MethodPill metodo={metodo} />
                </button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)' }}>
              <input type="checkbox" checked={esCortesia} onChange={e => setEsCortesia(e.target.checked)} />
              Cortesía <span className="dim">(no suma a ingresos)</span>
            </label>
            <button className="admin-btn primary" type="button" disabled={cart.length === 0 || registrarVenta.isPending} onClick={() => setConfirmOpen(true)}>
              Cobrar
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
