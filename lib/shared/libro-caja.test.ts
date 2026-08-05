import { describe, it, expect } from 'vitest';
import { armarLibro, conceptoConNumeroTurno, type MovimientoLibro, type PedidoSinCobro } from './libro-caja';

function mov(over: Partial<MovimientoLibro> = {}): MovimientoLibro {
  return {
    id: 1,
    concepto: 'Venta #2393',
    tipo: 'VENTA',
    metodo_pago: 'EFECTIVO',
    monto: 32,
    created_at: '2026-08-04T12:10:00.000Z',
    transaccion: { id: 2393, numero_turno: 9 },
    ...over,
  };
}

function fiado(over: Partial<PedidoSinCobro> = {}): PedidoSinCobro {
  return {
    id: 2390,
    numero_turno: 8,
    total: 28,
    es_cortesia: false,
    cliente_nombre: 'Ana',
    created_at: '2026-08-04T12:04:00.000Z',
    ...over,
  };
}

describe('conceptoConNumeroTurno', () => {
  it('cambia el id global por el número del turno', () => {
    expect(conceptoConNumeroTurno(mov())).toBe('Venta #9 (global #2393)');
  });

  it('deja intacto el movimiento manual, que no tiene venta detrás', () => {
    const manual = mov({ concepto: 'Compra de hielo', tipo: 'GASTO', transaccion: null });
    expect(conceptoConNumeroTurno(manual)).toBe('Compra de hielo');
  });

  it('no toca la venta sin número de turno (pedido web viejo)', () => {
    const sinNumero = mov({ transaccion: { id: 2393, numero_turno: null } });
    expect(conceptoConNumeroTurno(sinNumero)).toBe('Venta #2393');
  });

  it('reescribe las dos partes de un pago mixto', () => {
    const mixto = mov({ concepto: 'Venta #2393 (mixto, efectivo)' });
    expect(conceptoConNumeroTurno(mixto)).toBe('Venta #9 (global #2393) (mixto, efectivo)');
  });
});

describe('armarLibro', () => {
  it('intercala los fiados por hora para que la secuencia no salte', () => {
    const libro = armarLibro([mov()], [fiado()]);
    expect(libro.map(e => e.clase)).toEqual(['MOVIMIENTO', 'SIN_COBRO']);
    expect(libro[1].concepto).toBe('Fiado #8 (global #2390) · Ana');
  });

  it('marca la cortesía como tal', () => {
    const [entrada] = armarLibro([], [fiado({ es_cortesia: true, cliente_nombre: null })]);
    expect(entrada.clase === 'SIN_COBRO' && entrada.etiqueta).toBe('Cortesía');
    expect(entrada.concepto).toBe('Cortesía #8 (global #2390)');
  });

  it('ordena de más reciente a más antiguo', () => {
    const viejo = mov({ id: 1, created_at: '2026-08-04T10:00:00.000Z' });
    const nuevo = mov({ id: 2, created_at: '2026-08-04T13:00:00.000Z' });
    const libro = armarLibro([viejo, nuevo], [fiado({ created_at: '2026-08-04T11:30:00.000Z' })]);
    expect(libro.map(e => e.key)).toEqual(['mov-2', 'ped-2390', 'mov-1']);
  });

  it('sin pedidos sin cobro devuelve solo los movimientos', () => {
    expect(armarLibro([mov()])).toHaveLength(1);
  });
});
