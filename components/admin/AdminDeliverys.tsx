'use client';

import { useEffect, useRef, useState } from 'react'
import { initialDrivers, driverStatusMap, type Driver } from './adminData'

export default function AdminDeliverys() {
  const [drivers, setDrivers] = useState<Driver[]>([])
  const mapRef = useRef<HTMLDivElement>(null)
  const leafletMapRef = useRef<import('leaflet').Map | null>(null)
  const markersRef = useRef<{ [id: number]: import('leaflet').Marker }>({})

  useEffect(() => {
    const fetchDrivers = async () => {
      try {
        const res = await fetch('/api/pedidos?estado=EN_CAMINO');
        const data = await res.json();
        
        if (data.data) {
          const activeDrivers = data.data.map((p: any) => ({
            id: p.id,
            name: p.driver_nombre || 'Repartidor ' + p.id,
            initials: (p.driver_nombre || 'R')[0].toUpperCase(),
            phone: p.cliente_telefono || 'N/A', // just using order phone for now
            status: 'onroute',
            rating: 5.0,
            lat: p.driver_lat || -17.7710,
            lng: p.driver_lng || -63.1900,
          }));
          setDrivers(activeDrivers);
        }
      } catch (err) {
        console.error(err);
      }
    };

    fetchDrivers();
    const t = setInterval(fetchDrivers, 5000);
    return () => clearInterval(t);
  }, [])

  // Inicializar Leaflet
  useEffect(() => {
    if (!mapRef.current || leafletMapRef.current) return

    const initMap = async () => {
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')

      const container = mapRef.current;
      if (container && (container as any)._leaflet_id) {
        (container as any)._leaflet_id = null;
      }

      const map = L.map(mapRef.current!, {
        center: [-17.7710, -63.1900], // Centro de Santa Cruz
        zoom: 14,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map)

      leafletMapRef.current = map
      updateMarkers(L)
    }

    initMap()

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove()
        leafletMapRef.current = null
        markersRef.current = {}
      }
    }
  }, [])

  // Actualizar marcadores cuando drivers cambian
  const updateMarkers = async (L?: any) => {
    if (!leafletMapRef.current) return
    const Leaflet = L || await import('leaflet')

    drivers.forEach(d => {
      if (d.status === 'offline') {
        if (markersRef.current[d.id]) {
          leafletMapRef.current!.removeLayer(markersRef.current[d.id])
          delete markersRef.current[d.id]
        }
        return
      }

      const isRoute = d.status === 'onroute'
      const html = `
        <div class="admin-map-marker ${isRoute ? 'route' : 'available'}">
          <div class="marker-pulse"></div>
          <div class="marker-core">${d.initials}</div>
        </div>
      `
      const icon = Leaflet.divIcon({
        className: '',
        html,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      })

      if (markersRef.current[d.id]) {
        markersRef.current[d.id].setLatLng([d.lat, d.lng])
        markersRef.current[d.id].setIcon(icon)
      } else {
        const marker = Leaflet.marker([d.lat, d.lng], { icon }).addTo(leafletMapRef.current!)
        marker.bindPopup(`<b>${d.name}</b><br/>${driverStatusMap[d.status].label}`)
        markersRef.current[d.id] = marker
      }
    })
  }

  useEffect(() => {
    updateMarkers()
  }, [drivers])

  return (
    <div className="admin-deliverys">
      <div className="admin-page-header">
        <div>
          <h1>Deliverys</h1>
          <p>Rastreo y asignación de repartidores</p>
        </div>
        <div className="delivery-stats-row">
          <div className="d-stat">
            <span className="d-stat-val">{drivers.filter(d => d.status === 'onroute').length}</span>
            <span className="d-stat-label">En Ruta</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val">{drivers.filter(d => d.status === 'available').length}</span>
            <span className="d-stat-label">Disponibles</span>
          </div>
        </div>
      </div>

      <div className="delivery-grid">
        {/* Drivers List */}
        <div className="drivers-sidebar">
          <h3>Flota Activa</h3>
          <div className="drivers-list">
            {drivers.map(driver => {
              const s = driverStatusMap[driver.status]
              return (
                <div key={driver.id} className={`driver-card ${driver.status}`}>
                  <div className="driver-avatar">{driver.initials}</div>
                  <div className="driver-info">
                    <span className="driver-name">{driver.name}</span>
                    <span className="driver-phone">{driver.phone}</span>
                  </div>
                  <div className="driver-meta">
                    <span className="driver-badge" style={{ color: s.color, background: s.bg }}>{s.label}</span>
                    <div className="driver-rating">⭐ {driver.rating}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Big Map */}
        <div className="delivery-map-view">
          <div className="map-view-header">
            <span>Mapa en tiempo real</span>
            <div className="map-live-indicator">● LIVE</div>
          </div>
          <div ref={mapRef} className="admin-leaflet-container" />
        </div>
      </div>
    </div>
  )
}
