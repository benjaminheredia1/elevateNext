'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ProtectedRoute } from '@/lib/Guard';
import CajaSidebar, { NAV_ITEMS } from '@/components/caja/CajaSidebar';
import '../admin.css';
import './caja.css';
import 'primeicons/primeicons.css';

/** Título de la sección actual: match exacto y, si no, el prefijo más largo. */
function sectionTitle(pathname: string) {
  const exact = NAV_ITEMS.find(item => item.to === pathname);
  if (exact) return exact.label;

  const match = NAV_ITEMS
    .filter(item => !item.end && (pathname === item.to || pathname.startsWith(`${item.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];

  return match?.label ?? 'Caja';
}

export default function CajaLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Cerrar el drawer al navegar, para que no quede abierto sobre la nueva
  // sección. Se ajusta en render (no en un efecto) para no encadenar renders.
  const [rutaPrevia, setRutaPrevia] = useState(pathname);
  if (rutaPrevia !== pathname) {
    setRutaPrevia(pathname);
    setSidebarOpen(false);
  }

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sidebarOpen]);

  return (
    <ProtectedRoute redirectTo="/login" roles={['CAJERO', 'ADMIN', 'DUENO']}>
      <div className="admin-layout">
        <CajaSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={`admin-main ${sidebarOpen ? 'is-locked' : ''}`}>
          <header className="admin-topbar caja-topbar">
            <button
              type="button"
              className="admin-menu-btn"
              aria-label="Abrir menú"
              aria-expanded={sidebarOpen}
              aria-controls="caja-sidebar"
              onClick={() => setSidebarOpen(true)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <span className="caja-topbar-title">{sectionTitle(pathname)}</span>
          </header>
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
