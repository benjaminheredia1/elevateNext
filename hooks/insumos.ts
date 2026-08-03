import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface ProductoEnRevision {
  id: number;
  nombre: string;
  estado_publicacion: string;
  en_revision: boolean;
  revision_desde: string | null;
  motivo_revision: string | null;
  insumo_causa_revision_id: number | null;
}

export interface ResultadoBajaInsumo {
  insumo: {
    id: number;
    nombre: string;
    activo: boolean;
    fecha_baja: string;
    motivo_baja: string;
  };
  productosEnRevision: number;
  productos: Array<{ id: number; nombre: string }>;
}

export function useDarDeBajaInsumo() {
  const qc = useQueryClient();
  return useMutation({
    // La baja es siempre de una sucursal: el servidor rechaza el pedido sin ella.
    mutationFn: async ({ id, motivo, sucursalId }: { id: number; motivo: string; sucursalId: number }) => {
      const res = await apiClient.patch(`/api/insumo/${id}/baja`, { motivo, sucursal_id: sucursalId });
      return res.data as ResultadoBajaInsumo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] });
      qc.invalidateQueries({ queryKey: ['productos-en-revision'] });
    },
  });
}

export function useProductosEnRevision(sucursalId?: number) {
  return useQuery({
    queryKey: ['productos-en-revision', sucursalId ?? null],
    queryFn: async () => {
      const res = await apiClient.get(`/api/productos/en-revision${sucursalId ? `?sucursal=${sucursalId}` : ''}`);
      return res.data.data as ProductoEnRevision[];
    },
  });
}

export function useResolverProductoEnRevision() {
  const qc = useQueryClient();
  return useMutation({
    // La revisión se resuelve en el local donde se abrió.
    mutationFn: async ({ id, sucursalId }: { id: number; sucursalId: number }) => {
      const res = await apiClient.patch(`/api/productos/${id}/resolver-revision`, { sucursal_id: sucursalId });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos-en-revision'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
    },
  });
}

export interface ResultadoReactivarInsumo {
  insumo: {
    id: number;
    nombre: string;
    activo: boolean;
    fecha_baja: null;
    motivo_baja: null;
  };
  productosResueltos: number;
}

export function useReactivarInsumo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, sucursalId }: { id: number; sucursalId: number }) => {
      const res = await apiClient.patch(`/api/insumo/${id}/reactivar`, { sucursal_id: sucursalId });
      return res.data as ResultadoReactivarInsumo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] });
      qc.invalidateQueries({ queryKey: ['productos-en-revision'] });
    },
  });
}
