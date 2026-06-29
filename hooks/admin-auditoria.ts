import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type RolFiltro = 'DUENO' | 'ADMIN' | 'CAJERO' | 'CLIENTE' | '';

export function useAuditoria(q = '', rol: RolFiltro = '', page = 1) {
  return useQuery({
    queryKey: ['admin', 'auditoria', q, rol, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (rol) params.set('rol', rol);
      params.set('page', String(page));
      return (await apiClient.get(`/api/admin/auditoria?${params}`)).data;
    },
  });
}
