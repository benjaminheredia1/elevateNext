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
    mutationFn: async ({ id, motivo }: { id: number; motivo: string }) => {
      const res = await apiClient.patch(`/api/insumo/${id}/baja`, { motivo });
      return res.data as ResultadoBajaInsumo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] });
      qc.invalidateQueries({ queryKey: ['productos-en-revision'] });
    },
  });
}

export function useProductosEnRevision() {
  return useQuery({
    queryKey: ['productos-en-revision'],
    queryFn: async () => {
      const res = await apiClient.get('/api/productos/en-revision');
      return res.data.data as ProductoEnRevision[];
    },
  });
}

export function useResolverProductoEnRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await apiClient.patch(`/api/productos/${id}/resolver-revision`);
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
    mutationFn: async (id: number) => {
      const res = await apiClient.patch(`/api/insumo/${id}/reactivar`);
      return res.data as ResultadoReactivarInsumo;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['insumos'] });
      qc.invalidateQueries({ queryKey: ['productos-en-revision'] });
    },
  });
}
