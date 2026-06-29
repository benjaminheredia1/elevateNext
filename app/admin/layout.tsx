'use client';

import { ProtectedRoute } from '@/lib/Guard';
import '../admin.css';
import 'primeicons/primeicons.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute redirectTo="/login" roles={['DUENO', 'ADMIN']}>
      {children}
    </ProtectedRoute>
  );
}
