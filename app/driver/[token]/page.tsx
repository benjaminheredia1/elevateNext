'use client';

import { useState, useEffect, use, useRef } from 'react';
import { motion } from 'framer-motion';

export default function DriverPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  
  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [driverNombre, setDriverNombre] = useState('');
  const [error, setError] = useState('');
  const [locationStatus, setLocationStatus] = useState('Esperando acceso al GPS...');
  
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);

  const fetchPedido = async () => {
    try {
      const res = await fetch(`/api/pedidos/driver/${token}`);
      if (!res.ok) throw new Error('Pedido no encontrado o link inválido');
      const data = await res.json();
      setPedido(data.data);
      if (data.data.driver_nombre && data.data.estado !== 'ENTREGADO' && data.data.estado !== 'CANCELADO') {
        startTracking();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedido();
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [token]);

  // Leaflet Map Init
  useEffect(() => {
    if (!pedido || !pedido.driver_nombre || pedido.estado === 'ENTREGADO') return;
    if (!mapRef.current || leafletMapRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      const container = mapRef.current;
      if (container && (container as any)._leaflet_id) {
        (container as any)._leaflet_id = null;
      }

      // Default to Santa Cruz center
      const initialLat = pedido.driver_lat || -17.7710;
      const initialLng = pedido.driver_lng || -63.1900;

      let config = null;
      try {
        const res = await fetch('/api/configuracion');
        const data = await res.json();
        config = data.data;
      } catch (e) {}

      const map = L.map(container!, {
        zoomControl: false,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map);

      leafletMapRef.current = map;

      // Ensure GPS tracking is active now that the map is ready
      if (watchIdRef.current === null) {
        startTracking();
      }

      const boundsPoints: [number, number][] = [];

      // Restaurant Marker
      if (config) {
        const restIcon = L.divIcon({
          className: '',
          html: `<div style="background:#ff5c19;width:30px;height:30px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.5);"><span style="font-size:16px;">🏢</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([config.sucursal_lat, config.sucursal_lng], { icon: restIcon }).addTo(map);
        boundsPoints.push([config.sucursal_lat, config.sucursal_lng]);
      }

      // Client Marker
      if (pedido.cliente_lat && pedido.cliente_lng) {
        const clientIcon = L.divIcon({
          className: '',
          html: `<div style="background:#10b981;width:30px;height:30px;border-radius:50%;border:3px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.5);"><span style="font-size:16px;">🏠</span></div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        });
        L.marker([pedido.cliente_lat, pedido.cliente_lng], { icon: clientIcon }).addTo(map);
        boundsPoints.push([pedido.cliente_lat, pedido.cliente_lng]);
      }

      // Driver Marker
      const driverIcon = L.divIcon({
        className: '',
        html: `<div style="background:#3b82f6;width:24px;height:24px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 10px rgba(0,0,0,0.5);"></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      markerRef.current = L.marker([initialLat, initialLng], { icon: driverIcon }).addTo(map);
      boundsPoints.push([initialLat, initialLng]);

      if (boundsPoints.length > 0) {
        const bounds = L.latLngBounds(boundsPoints);
        map.fitBounds(bounds, { padding: [30, 30] });
      } else {
        map.setView([initialLat, initialLng], 15);
      }
    };

    initMap();
  }, [pedido]);

  const handleUpdate = async (payload: any) => {
    try {
      const res = await fetch(`/api/pedidos/driver/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Error al actualizar el pedido');
      fetchPedido();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const startTracking = () => {
    if (!('geolocation' in navigator)) {
      setLocationStatus('Tu navegador no soporta GPS.');
      return;
    }

    setLocationStatus('Obteniendo ubicación...');
    
    if (watchIdRef.current === null) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setLocationStatus(`📍 GPS Activo`);
          
          if (leafletMapRef.current && markerRef.current) {
            markerRef.current.setLatLng([latitude, longitude]);
            leafletMapRef.current.setView([latitude, longitude]);
          }

          fetch(`/api/pedidos/driver/${token}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lng: longitude })
          }).catch(console.error);
        },
        (error) => {
          console.error(error);
          setLocationStatus('⚠️ Activa la ubicación de tu teléfono.');
        },
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
      );
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#fff' }}>Cargando...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{error}</div>;
  if (!pedido) return null;

  const isAccepted = !!pedido.driver_nombre;

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'Inter, sans-serif', padding: 20 }}>
      <div style={{ maxWidth: 500, margin: '0 auto' }}>
        
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#ff5c19', margin: 0 }}>Elevate Delivery</h1>
          <p style={{ color: '#888', margin: '4px 0 0' }}>Pedido #{pedido.id} • {pedido.estado}</p>
        </div>

        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20, marginBottom: 20 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Cliente</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>{pedido.cliente_nombre || 'Sin nombre'}</div>
            <div style={{ fontSize: 14, color: '#ccc' }}>📞 {pedido.cliente_telefono}</div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>Dirección</div>
            <div style={{ fontSize: 15, background: 'rgba(255,92,25,0.1)', color: '#ff5c19', padding: '10px 12px', borderRadius: 8, marginTop: 4 }}>
              📍 {pedido.cliente_direccion || 'No especificada'}
            </div>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 16 }}>
            <div style={{ fontSize: 12, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Cobrar: Bs. {pedido.total}</div>
            {pedido.transaccionesDetalles_id.map((item: any) => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#ccc' }}>
                <span>{item.cantidad}x {item.producto.nombre}</span>
              </div>
            ))}
          </div>
        </div>

        {!isAccepted ? (
          <form onSubmit={e => { e.preventDefault(); handleUpdate({ driver_nombre: driverNombre || 'Repartidor' }); }} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input 
              type="text" placeholder="Tu nombre" 
              value={driverNombre} onChange={e => setDriverNombre(e.target.value)} required
              style={{ width: '100%', padding: '14px', borderRadius: 10, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 16 }}
            />
            <motion.button
              whileTap={{ scale: 0.98 }} type="submit"
              style={{ width: '100%', padding: '16px', background: '#ff5c19', color: '#fff', border: 'none', borderRadius: 12, fontSize: 16, fontWeight: 700 }}
            >
              Aceptar Asignación
            </motion.button>
          </form>
        ) : pedido.estado !== 'ENTREGADO' && pedido.estado !== 'CANCELADO' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ height: 250, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div ref={mapRef} style={{ width: '100%', height: '100%', background: '#111' }} />
            </div>
            
            <div style={{ textAlign: 'center', fontSize: 12, color: '#888' }}>
              {locationStatus}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {pedido.estado !== 'EN_CAMINO' && (
                <motion.button
                  whileTap={{ scale: 0.98 }} onClick={() => handleUpdate({ estado: 'EN_CAMINO' })}
                  style={{ flex: 1, padding: '14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700 }}
                >
                  🚙 Recogido (En Camino)
                </motion.button>
              )}
              
              <motion.button
                whileTap={{ scale: 0.98 }} onClick={() => { if(confirm('¿Confirmar entrega?')) handleUpdate({ estado: 'ENTREGADO' }) }}
                style={{ flex: 1, padding: '14px', background: '#10b981', color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700 }}
              >
                ✅ Entregado
              </motion.button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 16, color: '#10b981' }}>
            <h3 style={{ margin: '0 0 8px' }}>🎉 ¡Pedido Finalizado!</h3>
            <p style={{ margin: 0, fontSize: 14 }}>{pedido.estado}</p>
          </div>
        )}
      </div>
    </div>
  );
}
