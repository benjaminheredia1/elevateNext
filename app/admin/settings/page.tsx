'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function SettingsPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  useEffect(() => {
    fetch('/api/configuracion')
      .then(r => r.json())
      .then(data => {
        if (data.data) {
          setConfig(data.data);
        } else {
          setConfig({ sucursal_lat: -17.7710, sucursal_lng: -63.1900, sucursal_nombre: 'Sucursal Principal' });
        }
        setLoading(false);
      })
      .catch(() => {
        setConfig({ sucursal_lat: -17.7710, sucursal_lng: -63.1900, sucursal_nombre: 'Sucursal Principal' });
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!config || !mapRef.current || leafletMapRef.current) return;

    const initMap = async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      const container = mapRef.current;
      if (container && (container as any)._leaflet_id) {
        (container as any)._leaflet_id = null;
      }

      const map = L.map(container!, {
        center: [config.sucursal_lat, config.sucursal_lng],
        zoom: 14,
      });

      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
      }).addTo(map);

      leafletMapRef.current = map;

      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#ff5c19;width:30px;height:30px;border-radius:50%;border:4px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 0 10px rgba(0,0,0,0.5);"><span style="font-size:16px;">🏢</span></div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      markerRef.current = L.marker([config.sucursal_lat, config.sucursal_lng], { 
        icon,
        draggable: true 
      }).addTo(map);

      markerRef.current.on('dragend', (e: any) => {
        const { lat, lng } = e.target.getLatLng();
        setConfig((prev: any) => ({ ...prev, sucursal_lat: lat, sucursal_lng: lng }));
      });
      
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng;
        markerRef.current.setLatLng([lat, lng]);
        setConfig((prev: any) => ({ ...prev, sucursal_lat: lat, sucursal_lng: lng }));
      });
    };

    initMap();
  }, [config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) alert('Configuración guardada exitosamente');
    } catch (err) {
      console.error(err);
      alert('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: '#fff' }}>Cargando configuración...</div>;

  return (
    <div style={{ padding: 20 }}>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 20 }}>Configuración General</h1>
      
      <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 20 }}>
        <h2 style={{ color: '#fff', fontSize: 18, marginBottom: 16 }}>Ubicación de la Sucursal Principal</h2>
        <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>
          Arrastra el marcador 🏢 o haz clic en el mapa para establecer el punto desde donde los repartidores recogerán los pedidos.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', color: '#888', fontSize: 12, marginBottom: 8, textTransform: 'uppercase' }}>Nombre de la Sucursal</label>
          <input 
            type="text" 
            value={config.sucursal_nombre}
            onChange={e => setConfig({ ...config, sucursal_nombre: e.target.value })}
            style={{ width: '100%', maxWidth: 400, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff' }}
          />
        </div>

        <div style={{ height: 400, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 20 }}>
          <div ref={mapRef} style={{ width: '100%', height: '100%', background: '#111' }} />
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={saving}
          style={{
            background: '#ff5c19', color: '#fff', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer'
          }}
        >
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </motion.button>
      </div>
    </div>
  );
}
