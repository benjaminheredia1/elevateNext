'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/auth';
import { useTurnoActivo } from '@/hooks/caja';
import StatusBadge from '@/components/ui/StatusBadge';

const Icons = {
  dashboard: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  venta: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>,
  movimientos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7h18"/><path d="M3 12h18"/><path d="M3 17h18"/></svg>,
  ingreso: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>,
  gasto: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>,
  cierre: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 10h8"/><path d="M8 14h5"/></svg>,
  historial: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/><path d="M12 7v5l3 2"/></svg>,
  deudores: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 11l-3 3-2-2"/></svg>,
  pedidos: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  entregar: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12l5 5L20 7"/></svg>,
  logout: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>,
};

const NAV_ITEMS = [
  { to: '/caja', label: 'Dashboard', icon: Icons.dashboard, end: true },
  { to: '/caja/pedidos', label: 'Pedidos', icon: Icons.pedidos },
  { to: '/caja/entregar', label: 'Entregar', icon: Icons.entregar },
  { to: '/caja/venta', label: 'Venta', icon: Icons.venta },
  { to: '/caja/movimientos', label: 'Movimientos', icon: Icons.movimientos },
  { to: '/caja/ingreso', label: 'Ingreso', icon: Icons.ingreso },
  { to: '/caja/gasto', label: 'Gasto', icon: Icons.gasto },
  { to: '/caja/cierre', label: 'Cierre', icon: Icons.cierre },
  { to: '/caja/deudores', label: 'Deudores', icon: Icons.deudores },
  { to: '/caja/historial', label: 'Historial', icon: Icons.historial },
];

export default function CajaSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { data: turno, isLoading } = useTurnoActivo();

  const logout = () => {
    useAuth.logout();
    router.push('/login');
  };

  return (
    <>
      {sidebarOpen && <div className="admin-sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <img src="/elevate.png" alt="Elevate" className="admin-logo" />
          <span className="admin-badge">Caja</span>
        </div>

        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ color: 'var(--slate)', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Turno</div>
          {isLoading ? (
            <StatusBadge status="cerrado" label="Verificando" />
          ) : turno ? (
            <StatusBadge status="abierto" label="Abierto" />
          ) : (
            <StatusBadge status="cerrado" label="Sin turno" />
          )}
        </div>

        <nav className="admin-nav">
          <div style={{ color: 'var(--slate)', fontSize: 11, fontWeight: 800, letterSpacing: 1.2, padding: '0 14px 8px' }}>CAJA</div>
          {NAV_ITEMS.map(item => {
            const isActive = item.end ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                href={item.to}
                className={`admin-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setSidebarOpen(false)}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <div className="admin-user">
            <div className="admin-user-avatar">CJ</div>
            <div className="admin-user-info">
              <span className="admin-user-name">Cajero</span>
              <span className="admin-user-role">Cajero</span>
            </div>
          </div>
          <button className="admin-btn ghost" style={{ justifyContent: 'center', color: 'var(--danger)' }} onClick={logout}>
            {Icons.logout} Cerrar sesión
          </button>
        </div>
      </aside>

    </>
  );
}
