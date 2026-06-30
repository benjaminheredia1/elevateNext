'use client';

import { ProtectedRoute } from '@/lib/Guard';
import CajaSidebar from '@/components/caja/CajaSidebar';
import '../admin.css';
import './caja.css';
import 'primeicons/primeicons.css';

export default function CajaLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute redirectTo="/login" roles={['CAJERO', 'ADMIN', 'DUENO']}>
      <div className="admin-layout">
        <CajaSidebar />
        <main className="admin-main">
          <div className="admin-content">{children}</div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
