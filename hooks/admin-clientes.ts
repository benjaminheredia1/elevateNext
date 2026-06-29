import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export function useAdminClientes(q = '', mes = '') {
  return useQuery({
    queryKey: ['admin', 'clientes', q, mes],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (mes) params.set('mes', mes);
      const qs = params.toString();
      return (await apiClient.get(`/api/admin/clientes${qs ? `?${qs}` : ''}`)).data;
    },
  });
}
