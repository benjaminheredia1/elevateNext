'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import AdminPanel from '@/components/admin/AdminPanel';
import apiClient from '@/hooks/api';

type EstadoWhatsapp = 'DESCONECTADO' | 'ESPERANDO_QR' | 'CONECTADO';

interface GrupoWhatsapp {
  jid: string;
  nombre: string;
  participantes: number;
}

interface EstadoResponse {
  estado: EstadoWhatsapp;
  qrDataUrl: string | null;
  numero: string | null;
  ultimoError: string | null;
  pendientes: number;
  grupo: { jid: string; nombre: string | null } | null;
}

const BADGE: Record<EstadoWhatsapp, { texto: string; color: string; fondo: string }> = {
  CONECTADO: { texto: 'Conectado', color: '#16a34a', fondo: 'rgba(22,163,74,0.12)' },
  ESPERANDO_QR: { texto: 'Esperando escaneo', color: '#d97706', fondo: 'rgba(217,119,6,0.12)' },
  DESCONECTADO: { texto: 'Desconectado', color: '#dc2626', fondo: 'rgba(220,38,38,0.12)' },
};

function mensajeDeError(error: unknown, porDefecto: string): string {
  if (axios.isAxiosError(error)) {
    return (error.response?.data as { error?: string } | undefined)?.error ?? porDefecto;
  }
  return porDefecto;
}

export default function WhatsappPage() {
  const [estado, setEstado] = useState<EstadoResponse | null>(null);
  const [grupos, setGrupos] = useState<GrupoWhatsapp[]>([]);
  const [seleccion, setSeleccion] = useState('');
  const [cargando, setCargando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  // Evita recargar los grupos en cada poll una vez que ya se listaron.
  const gruposCargados = useRef(false);

  const consultarEstado = useCallback(async () => {
    const res = await apiClient.get('/api/admin/whatsapp');
    const data: EstadoResponse = res.data?.data;
    setEstado(data);
    setSeleccion((actual) => actual || data?.grupo?.jid || '');
    return data;
  }, []);

  const cargarGrupos = useCallback(async () => {
    try {
      const res = await apiClient.get('/api/admin/whatsapp/grupos');
      setGrupos(res.data?.data ?? []);
      gruposCargados.current = true;
    } catch (error) {
      setAviso(mensajeDeError(error, 'No se pudieron cargar los grupos.'));
    }
  }, []);

  useEffect(() => {
    async function cargaInicial() {
      try {
        await consultarEstado();
      } catch {
        setAviso('No se pudo consultar el estado de WhatsApp.');
      } finally {
        setCargando(false);
      }
    }
    cargaInicial();
  }, [consultarEstado]);

  // Mientras la sesión no esté abierta hay que refrescar seguido: el QR se
  // genera de forma asíncrona y caduca cada ~20s (Baileys emite uno nuevo).
  useEffect(() => {
    const intervalo = window.setInterval(
      () => {
        consultarEstado().catch(() => {});
      },
      estado?.estado === 'CONECTADO' ? 15000 : 3000,
    );
    return () => window.clearInterval(intervalo);
  }, [consultarEstado, estado?.estado]);

  useEffect(() => {
    if (estado?.estado === 'CONECTADO' && !gruposCargados.current) {
      cargarGrupos();
    }
    if (estado?.estado !== 'CONECTADO') {
      gruposCargados.current = false;
    }
  }, [estado?.estado, cargarGrupos]);

  const conectar = async () => {
    setConectando(true);
    setAviso('');
    try {
      await apiClient.post('/api/admin/whatsapp');
      await consultarEstado();
    } catch (error) {
      setAviso(mensajeDeError(error, 'No se pudo iniciar la conexión.'));
    } finally {
      setConectando(false);
    }
  };

  const cerrarSesion = async () => {
    setAviso('');
    try {
      await apiClient.delete('/api/admin/whatsapp');
      setGrupos([]);
      gruposCargados.current = false;
      await consultarEstado();
      setAviso('Sesión cerrada. Para volver a usarlo hay que escanear el QR de nuevo.');
    } catch (error) {
      setAviso(mensajeDeError(error, 'No se pudo cerrar la sesión.'));
    }
  };

  const guardarGrupo = async () => {
    const grupo = grupos.find((g) => g.jid === seleccion);
    if (!grupo) return;
    setGuardando(true);
    setAviso('');
    try {
      await apiClient.put('/api/admin/whatsapp/grupos', { jid: grupo.jid, nombre: grupo.nombre });
      await consultarEstado();
      setAviso(`Listo: los pedidos nuevos se avisan a "${grupo.nombre}".`);
    } catch (error) {
      setAviso(mensajeDeError(error, 'No se pudo guardar el grupo.'));
    } finally {
      setGuardando(false);
    }
  };

  const reintentarCola = async () => {
    setAviso('');
    try {
      const res = await apiClient.post('/api/admin/whatsapp/cola');
      const { enviados, pendientes } = res.data?.data ?? {};
      await consultarEstado();
      setAviso(
        pendientes > 0
          ? `Se enviaron ${enviados}; quedan ${pendientes} en espera (WhatsApp sigue sin responder).`
          : `Cola vacía: se enviaron ${enviados} aviso(s) atrasado(s).`,
      );
    } catch (error) {
      setAviso(mensajeDeError(error, 'No se pudo reintentar la cola.'));
    }
  };

  const enviarPrueba = async () => {
    setAviso('');
    try {
      const res = await apiClient.post('/api/admin/whatsapp/prueba');
      setAviso(`Mensaje de prueba enviado:\n${res.data?.data?.preview ?? ''}`);
    } catch (error) {
      setAviso(mensajeDeError(error, 'No se pudo enviar la prueba.'));
    }
  };

  if (cargando) {
    return (
      <AdminPanel>
        <div className="empty-state">
          <h4>Cargando WhatsApp</h4>
          <p>Consultando el estado de la sesión.</p>
        </div>
      </AdminPanel>
    );
  }

  const actual = estado?.estado ?? 'DESCONECTADO';
  const badge = BADGE[actual];
  const grupoGuardado = estado?.grupo;
  const pendientes = estado?.pendientes ?? 0;

  return (
    <AdminPanel>
      <div className="admin-settings">
        <div className="admin-page-header">
          <div>
            <h1>WhatsApp</h1>
            <p>Avisa cada pedido nuevo al grupo que elijas</p>
          </div>
          <span
            style={{
              alignSelf: 'center',
              padding: '6px 14px',
              borderRadius: 999,
              fontWeight: 600,
              fontSize: '0.82rem',
              color: badge.color,
              background: badge.fondo,
            }}
          >
            {badge.texto}
          </span>
        </div>

        {aviso && (
          <div className="empty-state" style={{ padding: '14px 18px', marginBottom: 18 }}>
            <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{aviso}</p>
          </div>
        )}

        {pendientes > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              flexWrap: 'wrap',
              padding: '14px 18px',
              marginBottom: 18,
              borderRadius: 12,
              color: '#92400e',
              background: 'rgba(217,119,6,0.12)',
              border: '1px solid rgba(217,119,6,0.35)',
            }}
          >
            <span style={{ fontWeight: 600 }}>
              {pendientes} aviso{pendientes === 1 ? '' : 's'} en espera. No se perdieron: salen solos
              apenas WhatsApp vuelva.
            </span>
            <button className="admin-btn secondary" onClick={reintentarCola} type="button">
              Reintentar ahora
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(320px, .8fr)', gap: 18, alignItems: 'start' }}>
          <section className="settings-section">
            <h3>Sesión</h3>

            {actual === 'CONECTADO' && (
              <>
                <p className="form-hint">
                  Vinculado al número <strong>{estado?.numero ?? 'desconocido'}</strong>. La sesión se
                  mantiene abierta mientras el servidor siga encendido.
                </p>
                <button className="admin-btn secondary" onClick={cerrarSesion} type="button" style={{ marginTop: 12 }}>
                  Cerrar sesión
                </button>
              </>
            )}

            {actual === 'ESPERANDO_QR' && (
              <>
                <p className="form-hint">
                  En el celular: <strong>WhatsApp → Ajustes → Dispositivos vinculados → Vincular
                  dispositivo</strong>, y escaneá este código.
                </p>
                {estado?.qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={estado.qrDataUrl}
                    alt="Código QR para vincular WhatsApp"
                    width={320}
                    height={320}
                    style={{ display: 'block', margin: '16px 0', borderRadius: 12, border: '1px solid var(--line)' }}
                  />
                ) : (
                  <div className="empty-state" style={{ padding: '32px 0' }}>
                    <p>Generando el código…</p>
                  </div>
                )}
                <p className="form-hint">El código se renueva solo cada pocos segundos.</p>
              </>
            )}

            {actual === 'DESCONECTADO' && (
              <>
                <p className="form-hint">
                  No hay ninguna sesión abierta. Al conectar aparece un QR para vincular el WhatsApp
                  del negocio.
                </p>
                {estado?.ultimoError && (
                  <p className="form-hint" style={{ color: '#dc2626' }}>{estado.ultimoError}</p>
                )}
                <button
                  className="admin-btn primary"
                  onClick={conectar}
                  disabled={conectando}
                  type="button"
                  style={{ marginTop: 12 }}
                >
                  {conectando ? 'Conectando…' : 'Conectar WhatsApp'}
                </button>
              </>
            )}
          </section>

          <section className="settings-section">
            <h3>Grupo destino</h3>
            <p className="form-hint">
              {grupoGuardado
                ? `Actualmente se avisa a "${grupoGuardado.nombre ?? grupoGuardado.jid}".`
                : 'Todavía no se eligió grupo: los pedidos no se están avisando.'}
            </p>

            {actual !== 'CONECTADO' ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <p>Conectá WhatsApp para ver tus grupos.</p>
              </div>
            ) : (
              <>
                <label className="form-group full" style={{ marginTop: 12 }}>
                  <span>Grupo o chat</span>
                  <select value={seleccion} onChange={(event) => setSeleccion(event.target.value)}>
                    <option value="">— Elegir —</option>
                    {grupos.map((grupo) => (
                      <option key={grupo.jid} value={grupo.jid}>
                        {grupo.nombre} ({grupo.participantes})
                      </option>
                    ))}
                  </select>
                  <span className="form-hint">
                    {grupos.length === 0
                      ? 'El número vinculado no participa en ningún grupo.'
                      : 'Solo aparecen los grupos donde está el número vinculado.'}
                  </span>
                </label>

                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                  <button
                    className="admin-btn primary"
                    onClick={guardarGrupo}
                    disabled={guardando || !seleccion}
                    type="button"
                  >
                    {guardando ? 'Guardando…' : 'Guardar grupo'}
                  </button>
                  <button className="admin-btn secondary" onClick={cargarGrupos} type="button">
                    Actualizar lista
                  </button>
                  <button
                    className="admin-btn secondary"
                    onClick={enviarPrueba}
                    disabled={!grupoGuardado}
                    type="button"
                  >
                    Enviar prueba
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </AdminPanel>
  );
}
