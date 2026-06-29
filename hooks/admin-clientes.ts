import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export function useAdminClientes(q = '') {
  return useQuery({
    queryKey: ['admin', 'clientes', q],
    queryFn: async () => (await apiClient.get(`/api/admin/clientes${q ? `?q=${encodeURIComponent(q)}` : ''}`)).data,
  });
}
