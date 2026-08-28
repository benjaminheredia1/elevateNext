import { describe, it, expect } from 'vitest';
import { AMBITO_SUCURSAL, AMBITO_CENTRO } from './ambitos';

describe('ambitos de inventario', () => {
  it('cada ambito apunta a sus propios endpoints', () => {
    expect(AMBITO_SUCURSAL.listarUrl(1)).toContain('/api/insumo');
    expect(AMBITO_CENTRO.listarUrl(1)).toContain('/api/admin/centros-produccion/1');
    expect(AMBITO_SUCURSAL.compraUrl).not.toBe(AMBITO_CENTRO.compraUrl);
    expect(AMBITO_SUCURSAL.mermaUrl).not.toBe(AMBITO_CENTRO.mermaUrl);
  });

  it('en esta fase los dos ambitos permiten comprar', () => {
    // La sucursal lo pierde recien en la Task 10, con la mudanza ya hecha.
    expect(AMBITO_SUCURSAL.permiteCompra).toBe(true);
    expect(AMBITO_CENTRO.permiteCompra).toBe(true);
  });

  it('el consolidado de sucursales lista sin filtrar por local', () => {
    // contextoId 0 = "todas": es como el panel pide el agregado del negocio.
    expect(AMBITO_SUCURSAL.listarUrl(0)).not.toContain('sucursal=');
    expect(AMBITO_SUCURSAL.listarUrl(7)).toContain('sucursal=7');
  });

  it('cada ambito nombra su contexto con la clave que espera su handler', () => {
    expect(AMBITO_SUCURSAL.claveContexto).toBe('sucursal_id');
    expect(AMBITO_CENTRO.claveContexto).toBe('centro_id');
  });
});
