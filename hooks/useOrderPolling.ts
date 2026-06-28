'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface NuevoPedido {
  id: number;
  cliente_nombre: string | null;
  total: number;
  created_at: string;
}

export function useOrderPolling(
  onNuevosPedidos: (pedidos: NuevoPedido[]) => void,
  intervalMs = 15000
) {
  const ultimoIdRef = useRef<number>(0);
  const ultimaVerificacionRef = useRef<string>(new Date().toISOString());

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`/api/pedidos?desde=${ultimaVerificacionRef.current}&limit=20`);
      if (!res.ok) return;
      const data = await res.json();
      const pedidos: NuevoPedido[] = data.data ?? [];
      const nuevos = pedidos.filter(p => p.id > ultimoIdRef.current);
      if (nuevos.length > 0) {
        ultimoIdRef.current = Math.max(...nuevos.map(p => p.id));
        ultimaVerificacionRef.current = new Date().toISOString();
        onNuevosPedidos(nuevos);
      }
    } catch {
      // Silent fail — network error won't crash the admin
    }
  }, [onNuevosPedidos]);

  // Initialize: get current max order ID to avoid false notifications on load
  useEffect(() => {
    async function init() {
      try {
        const res = await fetch('/api/pedidos?limit=1');
        if (!res.ok) return;
        const data = await res.json();
        if (data.data?.[0]?.id) {
          ultimoIdRef.current = data.data[0].id;
        }
      } catch { /* silent */ }
    }
    init();
  }, []);

  useEffect(() => {
    const interval = setInterval(poll, intervalMs);
    return () => clearInterval(interval);
  }, [poll, intervalMs]);
}

export function useAlertasPolling(
  onAlertas: (criticos: number, advertencia: number) => void,
  intervalMs = 30000
) {
  const fetch_alertas = useCallback(async () => {
    try {
      const res = await fetch('/api/alertas');
      if (!res.ok) return;
      const data = await res.json();
      onAlertas(data.data?.criticos?.length ?? 0, data.data?.advertencia?.length ?? 0);
    } catch { /* silent */ }
  }, [onAlertas]);

  useEffect(() => {
    fetch_alertas(); // initial fetch
    const interval = setInterval(fetch_alertas, intervalMs);
    return () => clearInterval(interval);
  }, [fetch_alertas, intervalMs]);
}
