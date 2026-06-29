'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRegistrarGasto } from '@/hooks/caja';

type Metodo = 'EFECTIVO' | 'QR' | 'TARJETA';

function parseMoney(value: string): number {
  return Number(Number(value || '0').toFixed(2));
}

export default function GastoCajaPage() {
  const router = useRouter();
  const registrar = useRegistrarGasto();
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState<Metodo>('EFECTIVO');
  const [categoria, setCategoria] = useState('Insumos');
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
      setMessage('Gasto registrado.');
      router.push('/caja/movimientos');
    } catch (error: unknown) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      setMessage(status === 409 ? 'Abre caja antes de registrar gastos.' : 'No se pudo registrar el gasto.');
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1>Gasto operativo</h1>
          <p>Registra egresos del turno.</p>
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
            <select value={categoria} onChange={e => setCategoria(e.target.value)}>
              <option value="Insumos">Insumos</option>
              <option value="Servicios">Servicios</option>
              <option value="Otros">Otros</option>
            </select>
          </div>
        </div>
        {message && <p className="form-hint" style={{ marginTop: 14 }}>{message}</p>}
        <div className="admin-modal-footer" style={{ paddingInline: 0, paddingBottom: 0 }}>
          <button className="admin-btn ghost" type="button" onClick={() => router.push('/caja')}>Cancelar</button>
          <button className="admin-btn primary" type="submit" disabled={registrar.isPending}>
            {registrar.isPending ? 'Registrando...' : 'Registrar gasto'}
          </button>
        </div>
      </form>
    </div>
  );
}
