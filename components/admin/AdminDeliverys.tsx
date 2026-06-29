'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import apiClient from '@/hooks/api';
import { driverStatusMap, type DriverStatus } from './adminData';

interface PedidoEnCamino {
  id: number;
  cliente_nombre: string | null;
  cliente_telefono: string | null;
  driver_nombre: string | null;
  driver_lat: number | null;
  driver_lng: number | null;
}

interface DriverView {
  id: number;
  name: string;
  initials: string;
  phone: string;
  status: DriverStatus;
  rating: number;
  currentOrder: string;
  lat: number | null;
  lng: number | null;
}

interface SucursalConfig {
  sucursal_lat: number;
  sucursal_lng: number;
  sucursal_nombre: string;
}

const DEFAULT_CENTER: [number, number] = [-17.7710, -63.1900];

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0]?.slice(0, 2) || 'R').toUpperCase();
}

export default function AdminDeliverys() {
  const [drivers, setDrivers] = useState<DriverView[]>([]);
  const [loading, setLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [storeConfig, setStoreConfig] = useState<SucursalConfig | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const initStartedRef = useRef(false);
  const leafletMapRef = useRef<import('leaflet').Map | null>(null);
  const markersRef = useRef<Record<number, import('leaflet').Marker>>({});
  const storeMarkerRef = useRef<import('leaflet').Marker | null>(null);

  const fetchDrivers = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/pedidos?estado=EN_CAMINO');
      const rows = (res.data?.data ?? []) as PedidoEnCamino[];
      setDrivers(rows.map(pedido => {
        const name = pedido.driver_nombre || `Repartidor pedido #${pedido.id}`;
        return {
          id: pedido.id,
          name,
          initials: initials(name),
          phone: pedido.cliente_telefono ?? 'Sin teléfono',
          status: 'onroute',
          rating: 5.0,
          currentOrder: `#${pedido.id}`,
          lat: typeof pedido.driver_lat === 'number' ? pedido.driver_lat : null,
          lng: typeof pedido.driver_lng === 'number' ? pedido.driver_lng : null,
        };
      }));
    } catch (err) {
      console.error(err);
      setDrivers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDrivers();
    const interval = window.setInterval(fetchDrivers, 5000);
    return () => window.clearInterval(interval);
  }, [fetchDrivers]);

  // Load store config once
  useEffect(() => {
    fetch('/api/configuracion')
      .then(r => r.json())
      .then(res => { if (res.data) setStoreConfig(res.data); })
      .catch(() => {});
  }, []);

  // Initialize map (with default center — store marker added in separate effect)
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current || initStartedRef.current) return;
    initStartedRef.current = true;
    let disposed = false;

    const initMap = async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (disposed || !mapRef.current) return;

      if ((mapRef.current as HTMLDivElement & { _leaflet_id?: number })._leaflet_id) {
        delete (mapRef.current as HTMLDivElement & { _leaflet_id?: number })._leaflet_id;
      }

      const map = L.map(mapRef.current, {
        center: DEFAULT_CENTER,
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      leafletMapRef.current = map;
      setMapReady(true);

      const invalidate = () => map.invalidateSize();
      window.requestAnimationFrame(invalidate);
      window.setTimeout(invalidate, 120);
      window.addEventListener('resize', invalidate);
      map.once('unload', () => window.removeEventListener('resize', invalidate));
    };

    initMap();

    return () => {
      disposed = true;
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
        markersRef.current = {};
        storeMarkerRef.current = null;
      }
      initStartedRef.current = false;
      setMapReady(false);
    };
  }, []);

  // Add/update restaurant marker when map is ready and config is available
  useEffect(() => {
    if (!mapReady || !leafletMapRef.current || !storeConfig) return;

    const addStoreMarker = async () => {
      const L = await import('leaflet');
      const map = leafletMapRef.current;
      if (!map) return;

      const pos: [number, number] = [storeConfig.sucursal_lat, storeConfig.sucursal_lng];

      const storeIcon = L.divIcon({
        className: '',
        html: `<div style="background:#ff5c19;width:36px;height:36px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);font-size:18px;">🏢</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      if (storeMarkerRef.current) {
        storeMarkerRef.current.setLatLng(pos);
      } else {
        const marker = L.marker(pos, { icon: storeIcon, zIndexOffset: -100 }).addTo(map);
        marker.bindPopup(`<b>${storeConfig.sucursal_nombre}</b><br/>Restaurante`);
        storeMarkerRef.current = marker;
        map.setView(pos, map.getZoom());
      }
    };

    addStoreMarker();
  }, [mapReady, storeConfig]);

  useEffect(() => {
    if (!mapReady || !leafletMapRef.current) return;

    const syncMarkers = async () => {
      const L = await import('leaflet');
      const map = leafletMapRef.current;
      if (!map) return;

      const activeIds = new Set(drivers.map(driver => driver.id));
      Object.entries(markersRef.current).forEach(([id, marker]) => {
        if (!activeIds.has(Number(id))) {
          map.removeLayer(marker);
          delete markersRef.current[Number(id)];
        }
      });

      const located = drivers.filter(driver => typeof driver.lat === 'number' && typeof driver.lng === 'number');

      for (const driver of drivers) {
        if (typeof driver.lat !== 'number' || typeof driver.lng !== 'number') {
          if (markersRef.current[driver.id]) {
            map.removeLayer(markersRef.current[driver.id]);
            delete markersRef.current[driver.id];
          }
          continue;
        }

        const html = `
          <div class="admin-map-marker route">
            <div class="marker-pulse"></div>
            <div class="marker-core">${driver.initials}</div>
          </div>
        `;
        const icon = L.divIcon({
          className: '',
          html,
          iconSize: [40, 40],
          iconAnchor: [20, 20],
        });
        const position: [number, number] = [driver.lat, driver.lng];

        if (markersRef.current[driver.id]) {
          markersRef.current[driver.id].setLatLng(position);
          markersRef.current[driver.id].setIcon(icon);
        } else {
          const marker = L.marker(position, { icon }).addTo(map);
          marker.bindPopup(`<b>${driver.name}</b><br/>Pedido ${driver.currentOrder}`);
          markersRef.current[driver.id] = marker;
        }
      }

      const storePos: [number, number] = storeConfig
        ? [storeConfig.sucursal_lat, storeConfig.sucursal_lng]
        : DEFAULT_CENTER;

      if (located.length > 0) {
        const allPoints: [number, number][] = [...located.map(d => [d.lat!, d.lng!] as [number, number]), storePos];
        const bounds = L.latLngBounds(allPoints);
        map.fitBounds(bounds.pad(0.18), { maxZoom: 15, animate: true });
      } else {
        map.setView(storePos, 14);
      }

      window.requestAnimationFrame(() => map.invalidateSize());
    };

    syncMarkers();
  }, [drivers, mapReady, storeConfig]);

  const locatedCount = drivers.filter(driver => typeof driver.lat === 'number' && typeof driver.lng === 'number').length;

  return (
    <div className="admin-deliverys">
      <div className="admin-page-header">
        <div>
          <h1>Deliverys</h1>
          <p>Rastreo y asignación de repartidores</p>
        </div>
        <div className="delivery-stats-row">
          <div className="d-stat">
            <span className="d-stat-val">{drivers.length}</span>
            <span className="d-stat-label">En ruta</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val">{locatedCount}</span>
            <span className="d-stat-label">Con GPS</span>
          </div>
        </div>
      </div>

      <div className="delivery-grid">
        <div className="drivers-sidebar">
          <h3>Flota Activa</h3>
          <div className="drivers-list">
            {loading ? (
              <div className="empty-state">
                <h4>Cargando flota</h4>
                <p>Consultando pedidos en camino.</p>
              </div>
            ) : drivers.length === 0 ? (
              <div className="empty-state">
                <h4>No hay repartidores en ruta</h4>
                <p>Los pedidos en camino aparecerán aquí.</p>
              </div>
            ) : (
              drivers.map(driver => {
                const status = driverStatusMap[driver.status];
                const hasGps = typeof driver.lat === 'number' && typeof driver.lng === 'number';
                return (
                  <div key={driver.id} className={`driver-card ${driver.status}`}>
                    <div className="driver-avatar">{driver.initials}</div>
                    <div className="driver-info">
                      <span className="driver-name">{driver.name}</span>
                      <span className="driver-phone">{hasGps ? `Pedido ${driver.currentOrder}` : 'Esperando GPS'}</span>
                    </div>
                    <div className="driver-meta">
                      <span className="driver-badge" style={{ color: status.color, background: status.bg }}>{status.label}</span>
                      <div className="driver-rating">{driver.rating.toFixed(1)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="delivery-map-view">
          <div className="map-view-header">
            <span>Mapa en tiempo real</span>
            <div className="map-live-indicator">● LIVE</div>
          </div>
          <div ref={mapRef} className="admin-leaflet-container" />
        </div>
      </div>
    </div>
  );
}
