'use client';

import AdminPanel from '@/components/admin/AdminPanel';
import AdminOrders from '@/components/admin/AdminOrders';

export default function AdminOrdersPage() {
  return (
    <AdminPanel>
      <AdminOrders readOnly />
    </AdminPanel>
  );
}
