'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface Sucursal {
  id: number;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  maps_url: string | null;
  lat: number | null;
  lng: number | null;
  activa: boolean;
  usuarios: number;
  ventas: number;
  turnos: number;
  cuentas: { id: number; tipo: string; saldo: number }[];
  created_at: string;
  // Tarifa de delivery del local.
  envio_base: number;
  envio_km_incluidos: number;
  envio_por_km: number;
  envio_maximo: number | null;
  envio_radio_km: number | null;
}

export interface SucursalPayload {
  id?: number;
  nombre: string;
  direccion?: string;
  telefono?: string;
  maps_url?: string;
  lat?: number;
  lng?: number;
  // Tarifa de delivery: sin valor quedan los defaults del sistema. `null` en el
  // tope y el radio significa "sin límite".
  envio_base?: number;
  envio_km_incluidos?: number;
  envio_por_km?: number;
  envio_maximo?: number | null;
  envio_radio_km?: number | null;
}

/** `todas` incluye las desactivadas (pantalla de administración). */
export function useSucursales(todas = false) {
  return useQuery({
    queryKey: ['admin', 'sucursales', todas],
    queryFn: async (): Promise<Sucursal[]> =>
      (await apiClient.get(`/api/admin/sucursales${todas ? '?todas=1' : ''}`)).data?.items ?? [],
  });
}

export function useGuardarSucursal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: SucursalPayload) =>
      id
        ? (await apiClient.put(`/api/admin/sucursales/${id}`, body)).data
        : (await apiClient.post('/api/admin/sucursales', body)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sucursales'] }),
  });
}

export function useEstadoSucursal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, activa }: { id: number; activa: boolean }) =>
      (await apiClient.patch(`/api/admin/sucursales/${id}`, { activa })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'sucursales'] }),
  });
}
