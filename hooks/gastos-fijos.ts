import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type Frecuencia = 'MENSUAL' | 'QUINCENAL' | 'SEMANAL' | 'ANUAL';

export interface GastoFijoPayload {
  id?: number;
  concepto: string;
  categoria: string;
  monto: number;
  frecuencia: Frecuencia;
  activo?: boolean;
}

export function useGastosFijos() {
  return useQuery({
    queryKey: ['admin-finanzas', 'gastos-fijos'],
    queryFn: async () => (await apiClient.get('/api/admin/gastos-fijos')).data,
  });
}

export function useGuardarGastoFijo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: GastoFijoPayload) => {
      if (payload.id) return (await apiClient.put('/api/admin/gastos-fijos', payload)).data;
      return (await apiClient.post('/api/admin/gastos-fijos', payload)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-finanzas', 'gastos-fijos'] }),
  });
}

export function useEliminarGastoFijo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/admin/gastos-fijos?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-finanzas', 'gastos-fijos'] }),
  });
}
