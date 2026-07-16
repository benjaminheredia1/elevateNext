import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface Privilegio {
  id: number;
  nombre: string;
  descripcion?: string | null;
  porcentaje: number;
  activo: boolean;
}

export interface PrivilegioPayload {
  id?: number;
  nombre: string;
  descripcion?: string;
  porcentaje: number;
  activo?: boolean;
}

export function usePrivilegios(incluirInactivos = false) {
  return useQuery({
    queryKey: ['admin', 'privilegios', incluirInactivos],
    queryFn: async () => (await apiClient.get(`/api/admin/privilegios${incluirInactivos ? '?incluirInactivos=true' : ''}`)).data as Privilegio[],
  });
}

export function useGuardarPrivilegio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: PrivilegioPayload) => {
      if (payload.id) return (await apiClient.put('/api/admin/privilegios', payload)).data;
      return (await apiClient.post('/api/admin/privilegios', payload)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'privilegios'] }),
  });
}

export function useEliminarPrivilegio() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/admin/privilegios?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'privilegios'] }),
  });
}

export function useCrearCliente() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { nombre: string; telefono?: string; nit?: string; email?: string; direccion?: string }) =>
      (await apiClient.post('/api/admin/clientes', payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clientes'] }),
  });
}

