'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useOrderPolling, useAlertasPolling, type NuevoPedido } from '@/hooks/useOrderPolling';

/* ============================
   ICONS
============================= */
const Icons = {
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  products: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  orders: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  delivery: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>,
  category: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L2 7l11 5 11-5z"/><path d="M2 17l11 5 11-5"/><path d="M2 12l11 5 11-5"/></svg>,
  horarios: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  insumos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2"/><path d="M18 15h3a1 1 0 01.97 1.24l-2 8A1 1 0 0119 25h-3.5a1 1 0 01-.97-.76L13 15h5z"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  menu: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>,
  bell: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  alert: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  x: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  settings: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
};

const NAV_ITEMS = [
  { to: '/admin', label: 'Dashboard', icon: Icons.dashboard, end: true, alertKey: 'dashboard' },
  { to: '/admin/products', label: 'Productos', icon: Icons.products },
  { to: '/admin/orders', label: 'Pedidos', icon: Icons.orders, alertKey: 'orders' },
  { to: '/admin/deliverys', label: 'Deliverys', icon: Icons.delivery },
  { to: '/admin/insumos', label: 'Insumos', icon: Icons.insumos, alertKey: 'insumos' },
  { to: '/admin/category', label: 'Categorías', icon: Icons.category },
  { to: '/admin/reglasHorarias', label: 'Horarios', icon: Icons.horarios },
  { to: '/admin/settings', label: 'Configuración', icon: Icons.settings },
];

/* ============================
   TOAST NOTIFICATION
============================= */
interface Toast {
  id: number;
  type: 'order' | 'alert';
  title: string;
  message: string;
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: number) => void }) {
  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{
              background: toast.type === 'order'
                ? 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
                : 'linear-gradient(135deg, #2d1515 0%, #1e1e1e 100%)',
              border: `1px solid ${toast.type === 'order' ? 'rgba(255,92,25,0.4)' : 'rgba(255,50,50,0.4)'}`,
              borderRadius: 12,
              padding: '12px 16px',
              minWidth: 280,
              maxWidth: 340,
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              cursor: 'pointer',
              position: 'relative',
            }}
            onClick={() => onRemove(toast.id)}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <span style={{ color: toast.type === 'order' ? '#ff5c19' : '#ff4444', marginTop: 2 }}>
                {toast.type === 'order' ? Icons.orders : Icons.alert}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{toast.title}</div>
                <div style={{ color: '#aaa', fontSize: 12 }}>{toast.message}</div>
              </div>
              <span style={{ color: '#555', flexShrink: 0 }}>{Icons.x}</span>
            </div>
            <motion.div
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 6, ease: 'linear' }}
              style={{
                position: 'absolute', bottom: 0, left: 0,
                height: 2,
                background: toast.type === 'order' ? '#ff5c19' : '#ff4444',
                borderRadius: '0 0 0 12px',
              }}
              onAnimationComplete={() => onRemove(toast.id)}
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ============================
   MAIN COMPONENT
============================= */
export default function AdminPanel({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newOrdersCount, setNewOrdersCount] = useState(0);
  const [insumosAlerta, setInsumosAlerta] = useState(0);
  const pathname = usePathname();
  const router = useRouter();

  const addToast = (toast: Omit<Toast, 'id'>) => {
    const id = Date.now();
    setToasts(prev => [...prev.slice(-4), { ...toast, id }]); // max 5 toasts
  };

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Poll for new orders
  useOrderPolling(useCallback((nuevos: NuevoPedido[]) => {
    setNewOrdersCount(prev => prev + nuevos.length);
    nuevos.forEach(pedido => {
      addToast({
        type: 'order',
        title: `🛍️ Nuevo Pedido #${pedido.id}`,
        message: `${pedido.cliente_nombre ?? 'Cliente'} — Bs. ${pedido.total}`,
      });
    });
  }, []));

  // Poll for critical insumos
  useAlertasPolling(useCallback((criticos, advertencia) => {
    const total = criticos + advertencia;
    if (total > insumosAlerta && insumosAlerta > 0) {
      addToast({
        type: 'alert',
        title: '⚠️ Alerta de Insumos',
        message: `${criticos} insumo(s) crítico(s) — ${advertencia} en advertencia`,
      });
    }
    setInsumosAlerta(total);
  }, [insumosAlerta]));

  const handleNavClick = (path: string) => {
    setSidebarOpen(false);
    if (path === '/admin/orders') setNewOrdersCount(0);
  };

  return (
    <div className="admin-layout">
      <ToastContainer toasts={toasts} onRemove={removeToast} />

      {sidebarOpen && (
        <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <img src="/elevate.png" alt="Elevate" className="admin-logo" />
          <span className="admin-badge">Admin</span>
        </div>

        <nav className="admin-nav">
          {NAV_ITEMS.map(item => {
            const isActive = item.end ? pathname === item.to : pathname.startsWith(item.to);
            const badgeCount =
              item.alertKey === 'orders' ? newOrdersCount
              : item.alertKey === 'insumos' ? insumosAlerta
              : item.alertKey === 'dashboard' ? (insumosAlerta > 0 ? insumosAlerta : 0)
              : 0;

            return (
              <Link
                key={item.to}
                href={item.to}
                className={`admin-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => handleNavClick(item.to)}
                style={{ position: 'relative' }}
              >
                {item.icon}
                <span>{item.label}</span>
                {badgeCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: item.alertKey === 'insumos' ? '#ff4444' : '#ff5c19',
                      color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700,
                      minWidth: 18, height: 18, display: 'flex', alignItems: 'center',
                      justifyContent: 'center', padding: '0 4px',
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </motion.span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user">
            <div className="admin-user-avatar">AD</div>
            <div className="admin-user-info">
              <span className="admin-user-name">Admin</span>
              <span className="admin-user-role">Administrador</span>
            </div>
          </div>
          <button
            onClick={() => { localStorage.removeItem('token'); router.push('/login'); }}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(255,68,68,0.1)', border: '1px solid rgba(255,68,68,0.2)',
              color: '#ff6b6b', fontSize: 13, fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            {Icons.logout} Cerrar sesión
          </button>
          <Link href="/" className="admin-nav-link" style={{ marginTop: 4 }}>
            {Icons.logout}
            <span>Volver a tienda</span>
          </Link>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <button className="admin-menu-btn" onClick={() => setSidebarOpen(true)}>
            {Icons.menu}
          </button>
          <div className="admin-topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Live indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#888' }}>
              <motion.div
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ade80' }}
              />
              En vivo
            </div>

            {/* Bell with badge */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setNewOrdersCount(0)}
                style={{
                  background: 'transparent', border: 'none', color: newOrdersCount > 0 ? '#ff5c19' : '#888',
                  cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
                  transition: 'color 0.2s',
                }}
              >
                <motion.div
                  animate={newOrdersCount > 0 ? { rotate: [-10, 10, -10, 10, 0] } : {}}
                  transition={{ duration: 0.5, repeat: newOrdersCount > 0 ? 3 : 0 }}
                >
                  {Icons.bell}
                </motion.div>
              </button>
              {newOrdersCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    position: 'absolute', top: -4, right: -4,
                    background: '#ff5c19', color: '#fff', borderRadius: '50%',
                    fontSize: 10, fontWeight: 700, width: 16, height: 16,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {newOrdersCount > 9 ? '9+' : newOrdersCount}
                </motion.span>
              )}
            </div>

            <span className="admin-date">
              {new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
          </div>
        </header>

        <div className="admin-content">{children}</div>
      </main>
    </div>
  );
}
