'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/hooks/api';
import type { LocalRecibo } from '@/lib/recibo/tipos';

interface LocalConId extends LocalRecibo {
  id: number;
}

/**
 * Encabezado del local para el recibo: nombre, dirección y teléfono.
 *
 * Sale de `/api/sucursales`, que ya expone exactamente esos tres campos para la
 * tienda pública y no pide rol —el cajero también lo puede leer—, así que no
 * hace falta cargarlos en cada payload de venta. Se cachea media hora: son
 * datos que cambian una vez al año y el ticket no puede esperar una consulta.
 */
export function useLocalesRecibo() {
  const { data } = useQuery({
    queryKey: ['recibo', 'locales'],
    queryFn: async (): Promise<LocalConId[]> => (await apiClient.get('/api/sucursales')).data?.data ?? [],
    staleTime: 30 * 60 * 1000,
  });

  const localDe = useCallback(
    (id?: number | null): LocalRecibo | null => {
      if (!data?.length) return null;
      // Sin id (o con uno desconocido) se cae al único local cuando hay uno
      // solo: es el caso del negocio de una sola sucursal, donde el dato es
      // inequívoco. Con varios, mejor imprimir sin encabezado que con el ajeno.
      const encontrado = id != null ? data.find(l => l.id === id) : undefined;
      if (encontrado) return encontrado;
      return data.length === 1 ? data[0] : null;
    },
    [data],
  );

  return { localDe };
}
