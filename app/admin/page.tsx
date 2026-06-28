'use client';

import AdminPanel from '@/components/admin/AdminPanel';
import AdminDashboard from '@/components/admin/AdminDashboard';

export default function AdminPage() {
  return (
    <AdminPanel>
      <AdminDashboard />
    </AdminPanel>
  );
}
