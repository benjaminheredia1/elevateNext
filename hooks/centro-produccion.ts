'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/hooks/api';

export interface CentroProduccion {
  id: number;
  nombre: string;
  direccion: string | null;
  activo: boolean;
  created_at: string;
}

export interface ItemStockCentro {
  // El endpoint devuelve ademas `id` (el mismo numero que `insumo_id`) y los
  // campos de ficha que necesita el panel compartido; aca se declara solo lo
  // que consumen Produccion y Envios.
  insumo_id: number;
  centro_id: number;
  nombre: string;
  unidad_medida: string;
  categoria_insumo: string | null;
  proveedor: string | null;
  stock_actual: number;
  costo_promedio: number;
  stock_minimo: number;
  punto_critico: number;
  activo: boolean;
  nivel: 'ok' | 'bajo' | 'critico' | 'baja';
  /** Si la fila es un producto terminado o insumo bruto. */
  es_producto: boolean;
  producto_id: number | null;
  /** ELABORADO = el Centro lo produce; el resto lo compra. */
  producto_tipo: string | null;
}

export function useCentrosProduccion() {
  return useQuery({
    queryKey: ['centros-produccion'],
    queryFn: async (): Promise<CentroProduccion[]> =>
      (await apiClient.get('/api/admin/centros-produccion')).data?.items ?? [],
  });
}

export function useCrearCentro() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { nombre: string; direccion?: string }) =>
      (await apiClient.post('/api/admin/centros-produccion', input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['centros-produccion'] }),
  });
}

export function useInventarioCentro(centroId: number | null) {
  return useQuery({
    queryKey: ['centro-produccion', 'inventario', centroId],
    enabled: centroId != null,
    queryFn: async (): Promise<ItemStockCentro[]> =>
      (await apiClient.get(`/api/admin/centros-produccion/${centroId}/insumos`)).data?.items ?? [],
  });
}

export function useAltaInsumoCentro(centroId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      nombre: string; unidad_medida: string; stock_inicial: number;
      costo_unitario: number; stock_minimo: number; punto_critico: number;
      // Ficha del catálogo: la misma que tenía el alta de sucursal antes del
      // corte. Solo se escribe cuando el insumo se crea.
      categoria_insumo?: string; proveedor?: string;
      equivalencia_unidad?: string; equivalencia_cantidad?: number;
    }) => (await apiClient.post(`/api/admin/centros-produccion/${centroId}/insumos`, input)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', centroId] }),
  });
}

interface AccionCentroBase {
  centro_id: number;
  insumo_id: number;
  /**
   * Clave de idempotencia. Viaja como cabecera `Idempotency-Key`, no en el
   * cuerpo. La genera la pantalla al ABRIR el formulario y no al enviarlo: si
   * se generara al enviar, cada reintento traería una clave distinta, el
   * servidor vería dos operaciones diferentes y la protección no existiría.
   */
  idempotency_key?: string;
}

function useAccionCentro<T extends AccionCentroBase>(url: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: T) => {
      const { idempotency_key, ...body } = input;
      return (await apiClient.post(url, body, {
        headers: idempotency_key ? { 'Idempotency-Key': idempotency_key } : undefined,
      })).data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', variables.centro_id] });
    },
  });
}

export function useCompraCentro() {
  return useAccionCentro<AccionCentroBase & { cantidad: number; costo_unitario: number; nota?: string }>(
    '/api/admin/centros-produccion/compra',
  );
}

export function useMermaCentro() {
  return useAccionCentro<AccionCentroBase & { cantidad: number; descripcion: string }>(
    '/api/admin/centros-produccion/merma',
  );
}

export function useConteoCentro() {
  return useAccionCentro<AccionCentroBase & { nuevo_stock: number; descripcion?: string }>(
    '/api/admin/centros-produccion/conteo',
  );
}

export function useBajaInsumoCentro() {
  return useAccionCentro<AccionCentroBase & { motivo: string }>(
    '/api/admin/centros-produccion/baja',
  );
}

export function useReactivarInsumoCentro() {
  return useAccionCentro<AccionCentroBase>(
    '/api/admin/centros-produccion/reactivar',
  );
}

export function useEditarUmbralesCentro() {
  return useAccionCentro<AccionCentroBase & { stock_minimo: number; punto_critico: number }>(
    '/api/admin/centros-produccion/umbrales',
  );
}

// ── Fase 2: producción ─────────────────────────────────────────────

export interface ItemRecetaCentro {
  insumo_id: number;
  cantidad_utilizada: number;
  nombre: string;
  unidad_medida: string;
  costo_promedio: number;
  stock_actual: number;
}

export interface RindeProducto {
  producto_id: number;
  nombre: string;
  unidades_posibles: number;
  costo_unitario: number;
  insumos: ItemRecetaCentro[];
}

/** Rinde de todos los productos con receta de producción en el centro. */
export function useRindeCentro(centroId: number | null) {
  return useQuery({
    queryKey: ['centro-produccion', 'rinde', centroId],
    enabled: centroId != null,
    queryFn: async (): Promise<RindeProducto[]> =>
      (await apiClient.get(`/api/admin/centros-produccion/recetas?centro_id=${centroId}`)).data?.items ?? [],
  });
}

export function useDefinirRecetaCentro(centroId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      producto_id: number;
      lineas: { insumo_id: number; cantidad_utilizada: number }[];
    }) => (await apiClient.post('/api/admin/centros-produccion/recetas', { centro_id: centroId, ...input })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'rinde', centroId] });
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', centroId] });
    },
  });
}

export function useRegistrarProduccion(centroId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      producto_id: number; cantidad: number; nota?: string; idempotency_key?: string;
    }) => {
      const { idempotency_key, ...body } = input;
      return (await apiClient.post('/api/admin/centros-produccion/produccion',
        { centro_id: centroId, ...body },
        { headers: idempotency_key ? { 'Idempotency-Key': idempotency_key } : undefined },
      )).data;
    },
    onSuccess: () => {
      // Producir mueve las dos caras del inventario del centro: baja el insumo
      // bruto y sube el terminado, así que se refrescan ambas vistas.
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'rinde', centroId] });
      qc.invalidateQueries({ queryKey: ['centro-produccion', 'inventario', centroId] });
    },
  });
}
