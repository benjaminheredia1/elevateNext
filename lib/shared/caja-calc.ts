// Un cajón físico nunca puede tener menos de 0bs. Si el esperado (apertura + movimientos)
// queda negativo, es porque se gastó dinero que la caja nunca tuvo (deuda), no un sobrante.
export function calcularDiferencia(esperado: number, real: number): number {
  return esperado < 0 ? esperado + real : real - esperado;
}

export function estadoDiferencia(diff: number): { status: 'cuadra' | 'sobrante' | 'faltante'; label: string } {
  if (diff === 0) return { status: 'cuadra', label: 'Cuadra exacto' };
  if (diff > 0) return { status: 'sobrante', label: 'Sobrante' };
  return { status: 'faltante', label: 'Faltante' };
}
