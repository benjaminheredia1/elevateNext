'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegistrarIngreso } from '@/hooks/caja';

type Metodo = 'EFECTIVO' | 'QR' | 'TARJETA';

function parseMoney(value: string): number {
  return Number(Number(value || '0').toFixed(2));
}

export default function IngresoCajaPage() {
  const router = useRouter();
  const registrar = useRegistrarIngreso();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<Metodo>('EFECTIVO');
  const [categoria, setCategoria] = useState('');
  const [message, setMessage] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    const value = parseMoney(monto);
    if (value <= 0) {
      setMessage('El monto debe ser mayor a 0.');
      return;
    }
    try {
      await registrar.mutateAsync({ concepto: concepto.trim(), monto: value, metodo_pago: metodoPago, categoria: categoria.trim() || undefined });
      setMessage('Ingreso registrado.');
      setConcepto('');
      setMonto('');
      setCategoria('');
      router.push('/caja/movimientos');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setMessage(status === 409 ? 'Abre caja antes de registrar ingresos.' : 'No se pudo registrar el ingreso.');
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Ingreso extra</h1>
          <p>Registra ingresos no operativos del turno.</p>
        </div>
      </div>
      <form className="dash-card span-8" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-group full">
            <label>Concepto</label>
            <input value={concepto} onChange={e => setConcepto(e.target.value)} maxLength={200} required />
          </div>
          <div className="form-group">
            <label>Monto</label>
            <input type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Método</label>
            <select value={metodoPago} onChange={e => setMetodoPago(e.target.value as Metodo)}>
              <option value="EFECTIVO">Efectivo</option>
              <option value="QR">QR</option>
              <option value="TARJETA">Tarjeta</option>
            </select>
          </div>
          <div className="form-group full">
            <label>Categoría</label>
            <input value={categoria} onChange={e => setCategoria(e.target.value)} maxLength={100} />
          </div>
        </div>
        {message && <p className="form-hint" style={{ marginTop: 14 }}>{message}</p>}
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-btn ghost" type="button" onClick={() => router.push('/caja')}>Cancelar</button>
          <button className="admin-btn primary" type="submit" disabled={registrar.isPending}>
            {registrar.isPending ? 'Registrando...' : 'Registrar ingreso'}
          </button>
        </div>
      </form>
    </div>
  );
}
