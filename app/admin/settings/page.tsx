'use client';

import { useEffect, useRef, useState } from 'react';
import AdminPanel from '@/components/admin/AdminPanel';
import apiClient from '@/hooks/api';

interface BusinessConfig {
  id?: number;
  sucursal_lat: number;
  sucursal_lng: number;
  sucursal_nombre: string;
}

interface AlertConfig {
  whatsapp_habilitado: boolean;
  destinatarios: string[];
  hora_silencio_desde: string;
  hora_silencio_hasta: string;
  intervalo_minimo_min: number;
  plantilla_mensaje: string;
}

interface AlertLog {
  id: number;
  enviado_at: string;
  canal: string;
  insumo_ids: number[];
  estado: string;
  preview: string;
}

const DEFAULT_BUSINESS: BusinessConfig = {
  sucursal_lat: -17.7710,
  sucursal_lng: -63.1900,
  sucursal_nombre: 'Sucursal Principal',
};

const DEFAULT_ALERTS: AlertConfig = {
  whatsapp_habilitado: false,
  destinatarios: [],
  hora_silencio_desde: '22:00',
  hora_silencio_hasta: '07:00',
  intervalo_minimo_min: 60,
  plantilla_mensaje: 'Elevate - Alerta de inventario: {count} insumos bajo umbral.\n{list}',
};

export default function SettingsPage() {
  const [business, setBusiness] = useState<BusinessConfig>(DEFAULT_BUSINESS);
  const [alerts, setAlerts] = useState<AlertConfig>(DEFAULT_ALERTS);
  const [recipients, setRecipients] = useState('');
  const [logs, setLogs] = useState<AlertLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [notice, setNotice] = useState('');
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [businessRes, alertsRes, logsRes] = await Promise.all([
          apiClient.get('/api/configuracion'),
          apiClient.get('/api/admin/configuracion-alertas'),
          apiClient.get('/api/admin/alertas'),
        ]);
        const loadedBusiness = businessRes.data?.data ?? DEFAULT_BUSINESS;
        const loadedAlerts = alertsRes.data?.data ?? DEFAULT_ALERTS;
        setBusiness(loadedBusiness);
        setAlerts(loadedAlerts);
        setRecipients((loadedAlerts.destinatarios ?? []).join(', '));
        setLogs(logsRes.data?.data?.historial ?? []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (loading || !mapRef.current || mapInstance.current) return;
    let disposed = false;

    async function initMap() {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (disposed || !mapRef.current) return;

      if ((mapRef.current as HTMLDivElement & { _leaflet_id?: number })._leaflet_id) {
        delete (mapRef.current as HTMLDivElement & { _leaflet_id?: number })._leaflet_id;
      }

      const map = L.map(mapRef.current, {
        center: [business.sucursal_lat, business.sucursal_lng],
        zoom: 14,
      });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        className: '',
        html: '<div style="background:#FF5C19;width:30px;height:30px;border-radius:50%;border:4px solid #fff;box-shadow:0 4px 14px rgba(20,52,42,.28);"></div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      const marker = L.marker([business.sucursal_lat, business.sucursal_lng], { icon, draggable: true }).addTo(map);
      marker.on('dragend', event => {
        const { lat, lng } = (event.target as import('leaflet').Marker).getLatLng();
        setBusiness(prev => ({ ...prev, sucursal_lat: lat, sucursal_lng: lng }));
      });
      map.on('click', event => {
        marker.setLatLng(event.latlng);
        setBusiness(prev => ({ ...prev, sucursal_lat: event.latlng.lat, sucursal_lng: event.latlng.lng }));
      });

      mapInstance.current = map;
      markerRef.current = marker;
      window.requestAnimationFrame(() => map.invalidateSize());
      window.setTimeout(() => map.invalidateSize(), 120);
    }

    initMap();
    return () => {
      disposed = true;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
        markerRef.current = null;
      }
    };
  }, [business.sucursal_lat, business.sucursal_lng, loading]);

  const saveBusiness = async () => {
    setSavingBusiness(true);
    setNotice('');
    try {
      const res = await apiClient.post('/api/configuracion', business);
      setBusiness(res.data?.data ?? business);
      setNotice('Datos del negocio guardados.');
    } catch (err) {
      console.error(err);
      setNotice('No se pudo guardar la configuración.');
    } finally {
      setSavingBusiness(false);
    }
  };

  const saveAlerts = async () => {
    setSavingAlerts(true);
    setNotice('');
    try {
      const payload: AlertConfig = {
        ...alerts,
        destinatarios: recipients.split(',').map(item => item.trim()).filter(Boolean),
      };
      const res = await apiClient.put('/api/admin/configuracion-alertas', payload);
      setAlerts(res.data?.data ?? payload);
      setRecipients((res.data?.data?.destinatarios ?? payload.destinatarios).join(', '));
      setNotice('Alertas guardadas.');
    } catch (err) {
      console.error(err);
      setNotice('No se pudo guardar la configuración de alertas.');
    } finally {
      setSavingAlerts(false);
    }
  };

  const sendTestAlert = async () => {
    setNotice('');
    try {
      const res = await apiClient.post('/api/admin/alertas/enviar');
      const logsRes = await apiClient.get('/api/admin/alertas');
      setLogs(logsRes.data?.data?.historial ?? []);
      setNotice(res.data?.message ?? 'Alerta procesada.');
    } catch (err) {
      console.error(err);
      setNotice('No se pudo procesar la alerta.');
    }
  };

  if (loading) {
    return (
      <AdminPanel>
        <div className="empty-state"><h4>Cargando configuración</h4><p>Consultando datos del negocio y alertas.</p></div>
      </AdminPanel>
    );
  }

  return (
    <AdminPanel>
      <div className="admin-settings">
        <div className="admin-page-header">
          <div>
            <h1>Configuración</h1>
            <p>Alertas de inventario por WhatsApp y datos del negocio</p>
          </div>
        </div>

        {notice && <div className="empty-state" style={{ padding: '14px 18px', marginBottom: 18 }}><p style={{ margin: 0 }}>{notice}</p></div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(320px, .75fr)', gap: 18, alignItems: 'start' }}>
          <div>
            <section className="settings-section">
              <h3>Alertas de WhatsApp</h3>
              <p className="form-hint">Avisos agrupados cuando uno o más insumos cruzan su punto de reorden.</p>

              <label className="switch" style={{ marginBottom: 18 }}>
                <input
                  type="checkbox"
                  checked={alerts.whatsapp_habilitado}
                  onChange={event => setAlerts(prev => ({ ...prev, whatsapp_habilitado: event.target.checked }))}
                />
                <span className="switch-track" />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{alerts.whatsapp_habilitado ? 'Activado' : 'Desactivado'}</span>
              </label>

              <div className="form-grid">
                <label className="form-group full">
                  <span>Destinatarios</span>
                  <input value={recipients} onChange={event => setRecipients(event.target.value)} placeholder="+59170000000, +59171111111" />
                  <span className="form-hint">Números separados por coma.</span>
                </label>
                <label className="form-group">
                  <span>Intervalo mínimo</span>
                  <input type="number" min={1} value={alerts.intervalo_minimo_min} onChange={event => setAlerts(prev => ({ ...prev, intervalo_minimo_min: Number(event.target.value) }))} />
                </label>
                <label className="form-group">
                  <span>Zona horaria</span>
                  <input value="America/La_Paz" readOnly />
                </label>
                <label className="form-group">
                  <span>Silencio desde</span>
                  <input type="time" value={alerts.hora_silencio_desde} onChange={event => setAlerts(prev => ({ ...prev, hora_silencio_desde: event.target.value }))} />
                </label>
                <label className="form-group">
                  <span>Silencio hasta</span>
                  <input type="time" value={alerts.hora_silencio_hasta} onChange={event => setAlerts(prev => ({ ...prev, hora_silencio_hasta: event.target.value }))} />
                </label>
                <label className="form-group full">
                  <span>Plantilla del mensaje</span>
                  <textarea rows={5} value={alerts.plantilla_mensaje} onChange={event => setAlerts(prev => ({ ...prev, plantilla_mensaje: event.target.value }))} />
                  <span className="form-hint">Variables disponibles: {'{count}'}, {'{list}'}.</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button className="admin-btn primary" onClick={saveAlerts} disabled={savingAlerts} type="button">{savingAlerts ? 'Guardando...' : 'Guardar configuración'}</button>
                <button className="admin-btn secondary" onClick={sendTestAlert} type="button">Enviar prueba</button>
              </div>
            </section>

            <section className="settings-section">
              <h3>Datos del negocio</h3>
              <p className="form-hint">Valores base para operación, mapas y reportes.</p>
              <div className="form-grid">
                <label className="form-group">
                  <span>Nombre</span>
                  <input value="Elevate" readOnly />
                </label>
                <label className="form-group">
                  <span>Moneda</span>
                  <input value="Bs." readOnly />
                </label>
                <label className="form-group">
                  <span>Sucursal</span>
                  <input value={business.sucursal_nombre} onChange={event => setBusiness(prev => ({ ...prev, sucursal_nombre: event.target.value }))} />
                </label>
                <label className="form-group">
                  <span>Latitud</span>
                  <input type="number" step="0.000001" value={business.sucursal_lat} onChange={event => setBusiness(prev => ({ ...prev, sucursal_lat: Number(event.target.value) }))} />
                </label>
                <label className="form-group">
                  <span>Longitud</span>
                  <input type="number" step="0.000001" value={business.sucursal_lng} onChange={event => setBusiness(prev => ({ ...prev, sucursal_lng: Number(event.target.value) }))} />
                </label>
              </div>
              <div style={{ height: 360, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--line)', margin: '16px 0' }}>
                <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
              </div>
              <button className="admin-btn primary" onClick={saveBusiness} disabled={savingBusiness} type="button">{savingBusiness ? 'Guardando...' : 'Guardar datos del negocio'}</button>
            </section>
          </div>

          <section className="settings-section">
            <h3>Registro de alertas</h3>
            <p className="form-hint">{logs.length} alertas registradas.</p>
            {logs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>Aún no se han disparado alertas de inventario.</p>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="alert-log-item">
                  <span className={`alert-log-badge ${log.estado}`}>{log.estado}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--slate)', marginBottom: 4 }}>
                      {new Date(log.enviado_at).toLocaleString('es-BO')} · {log.insumo_ids.length} insumo(s)
                    </div>
                    <pre className="alert-log-preview">{log.preview}</pre>
                  </div>
                </div>
              ))
            )}
          </section>
        </div>
      </div>
    </AdminPanel>
  );
}
