import { describe, it, expect } from 'vitest';
import { AMBITO_SUCURSAL, AMBITO_CENTRO } from './ambitos';

describe('ambitos de inventario', () => {
  it('cada ambito apunta a sus propios endpoints', () => {
    expect(AMBITO_SUCURSAL.listarUrl(1)).toContain('/api/insumo');
    expect(AMBITO_CENTRO.listarUrl(1)).toContain('/api/admin/centros-produccion/1');
    expect(AMBITO_SUCURSAL.compraUrl).not.toBe(AMBITO_CENTRO.compraUrl);
    expect(AMBITO_SUCURSAL.mermaUrl).not.toBe(AMBITO_CENTRO.mermaUrl);
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

  it('la sucursal ya no compra insumos; el Centro si', () => {
    // Desde el corte la sucursal no le compra a proveedores: recibe del Centro.
    // El boton de compra sale del panel por esta bandera, no por un `if` con el
    // id del ambito.
    expect(AMBITO_SUCURSAL.permiteCompra).toBe(false);
    expect(AMBITO_CENTRO.permiteCompra).toBe(true);
  });

  it('la cobertura en dias solo se mide en la sucursal', () => {
    // El Centro contesta "para cuanto me alcanza" con el rinde, en unidades
    // producibles, no con dias de un consumo diario que no mide.
    expect(AMBITO_SUCURSAL.mideCobertura).toBe(true);
    expect(AMBITO_CENTRO.mideCobertura).toBe(false);
  });

  it('solo la sucursal puede operar sin contexto', () => {
    // Sin sucursal el servidor resuelve la principal; el DTO del Centro, en
    // cambio, exige centro_id entero y positivo.
    expect(AMBITO_SUCURSAL.contextoOpcional).toBe(true);
    expect(AMBITO_CENTRO.contextoOpcional).toBe(false);
  });
});
