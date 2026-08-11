import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export type RolUsuario = 'DUENO' | 'ADMIN' | 'CAJERO' | 'CLIENTE';

export interface UsuarioPayload {
  id?: number;
  nombre: string;
  apellido_paterno: string;
  apellido_materno: string;
  email: string;
  username?: string | null;
  password?: string;
  rol: RolUsuario;
  activo?: boolean;
  /** Sucursal principal: la del cajero, y la que el admin ve por defecto. */
  sucursal_id?: number | null;
  /** Alcance del admin: todas las sucursales que puede administrar. */
  sucursal_ids?: number[];
  /** Solo de lectura, lo devuelve el listado para pintar la tabla. */
  sucursales?: { id: number; nombre: string }[];
}

export function useAdminUsuarios() {
  return useQuery({
    queryKey: ['admin', 'usuarios'],
    queryFn: async () => (await apiClient.get('/api/admin/usuarios')).data,
  });
}

export function useGuardarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UsuarioPayload) => {
      if (payload.id) return (await apiClient.put('/api/admin/usuarios', payload)).data;
      return (await apiClient.post('/api/admin/usuarios', payload)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  });
}

export function useDesactivarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await apiClient.delete(`/api/admin/usuarios?id=${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'usuarios'] }),
  });
}
