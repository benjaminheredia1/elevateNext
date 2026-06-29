'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAbrirCaja, useTurnoActivo } from '@/hooks/caja';

function parseMoney(value: string): number {
  return Number(Number(value || '0').toFixed(2));
}

export default function AperturaCajaPage() {
  const router = useRouter();
  const { data: turno, isLoading } = useTurnoActivo();
  const abrirCaja = useAbrirCaja();
  const [aperturaEfectivo, setAperturaEfectivo] = useState('0.00');
  const [aperturaQr, setAperturaQr] = useState('0.00');
  const [observaciones, setObservaciones] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!isLoading && turno) {
      setMessage('Ya existe un turno abierto. Volviendo al dashboard...');
      const t = setTimeout(() => router.push('/caja'), 900);
      return () => clearTimeout(t);
    }
  }, [isLoading, turno, router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    const apertura_efectivo = parseMoney(aperturaEfectivo);
    const apertura_qr = parseMoney(aperturaQr);
    if (apertura_efectivo < 0 || apertura_qr < 0) {
      setMessage('Los montos no pueden ser negativos.');
      return;
    }
    try {
      await abrirCaja.mutateAsync({ apertura_efectivo, apertura_qr, observaciones: observaciones.trim() || undefined });
      setMessage('Caja abierta correctamente.');
      router.push('/caja');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setMessage('Ya existe un turno abierto. Volviendo al dashboard...');
        setTimeout(() => router.push('/caja'), 900);
      } else {
        setMessage('No se pudo abrir caja.');
      }
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Apertura de caja</h1>
          <p>Registra los saldos iniciales del turno.</p>
        </div>
      </div>

      <form className="dash-card span-8" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Efectivo inicial</label>
            <input type="number" min="0" step="0.01" value={aperturaEfectivo} onChange={e => setAperturaEfectivo(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>QR inicial</label>
            <input type="number" min="0" step="0.01" value={aperturaQr} onChange={e => setAperturaQr(e.target.value)} required />
          </div>
          <div className="form-group full">
            <label>Observaciones</label>
            <textarea rows={4} maxLength={500} value={observaciones} onChange={e => setObservaciones(e.target.value)} />
          </div>
        </div>
        {message && <p className="form-hint" style={{ marginTop: 14 }}>{message}</p>}
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-btn ghost" type="button" onClick={() => router.push('/caja')}>Cancelar</button>
          <button className="admin-btn primary" type="submit" disabled={abrirCaja.isPending || !!turno}>
            {abrirCaja.isPending ? 'Abriendo...' : 'Abrir caja'}
          </button>
        </div>
      </form>
    </div>
  );
}
