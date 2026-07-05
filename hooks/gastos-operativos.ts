import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type MetodoPago = 'EFECTIVO' | 'QR';

export interface GastoOperativoPayload {
  concepto: string;
  categoria: string;
  monto: number;
  metodo_pago: MetodoPago;
  fecha: string;
  notas?: string;
}

export function useGastosOperativos(filtro: { metodo_pago?: MetodoPago; q?: string }) {
  return useQuery({
    queryKey: ['admin-finanzas', 'gastos-operativos', filtro],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filtro.metodo_pago) params.set('metodo_pago', filtro.metodo_pago);
      if (filtro.q) params.set('q', filtro.q);
      const res = await apiClient.get(`/api/admin/gastos-operativos?${params.toString()}`);
      return res.data;
    },
  });
}

export function useRegistrarGastoOperativo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GastoOperativoPayload) => (await apiClient.post('/api/admin/gastos-operativos', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-finanzas', 'gastos-operativos'] }),
  });
}

export function useEliminarGastoOperativo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/admin/gastos-operativos?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-finanzas', 'gastos-operativos'] }),
  });
}
