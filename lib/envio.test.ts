import { describe, it, expect } from 'vitest';
import { cotizarEnvio, distanciaLineaRecta, distanciaRecorrido, type TarifaEnvio } from './envio';

/** Tarifa por defecto del sistema: Bs 8 hasta 2,5 km y Bs 2,50 por km extra. */
const TARIFA: TarifaEnvio = {
  envio_base: 8,
  envio_km_incluidos: 2.5,
  envio_por_km: 2.5,
  envio_maximo: 25,
  envio_radio_km: 12,
};

// Equipetrol y un punto ~2 km al sur, en Santa Cruz.
const LOCAL = { lat: -17.7600, lng: -63.1998 };

describe('distancia', () => {
  it('mide la línea recta en km', () => {
    // Un grado de latitud son ~111 km.
    const unGrado = distanciaLineaRecta(LOCAL, { lat: LOCAL.lat + 1, lng: LOCAL.lng });
    expect(unGrado).toBeGreaterThan(110);
    expect(unGrado).toBeLessThan(112);
  });

  it('el mismo punto da cero', () => {
    expect(distanciaLineaRecta(LOCAL, LOCAL)).toBe(0);
  });

  it('corrige la línea recta por el rodeo de las calles', () => {
    const destino = { lat: -17.7780, lng: -63.1998 };
    const recta = distanciaLineaRecta(LOCAL, destino);
    // El recorrido siempre es mayor que la recta: cobrar la recta es cobrar de menos.
    expect(distanciaRecorrido(LOCAL, destino)).toBeCloseTo(recta * 1.3, 5);
  });
});

describe('cotización del envío', () => {
  it('dentro de los km incluidos cobra solo la base', () => {
    // ~300 m de la puerta del local.
    const cerca = { lat: -17.7621, lng: -63.1998 };
    const q = cotizarEnvio(LOCAL, cerca, TARIFA);

    expect(q.distancia_km).toBeLessThan(2.5);
    expect(q.costo).toBe(8);
    expect(q.dentroDeCobertura).toBe(true);
  });

  it('cobra por km entero lo que pasa de la base', () => {
    // 4,5 km de recorrido → 2 km enteros por encima de los 2,5 incluidos.
    const q = cotizarEnvio({ lat: 0, lng: 0 }, { lat: 0.03114, lng: 0 }, TARIFA);
    expect(q.distancia_km).toBeCloseTo(4.5, 1);
    expect(q.costo).toBe(8 + 2 * 2.5);
  });

  it('respeta el tope por lejos que sea', () => {
    const lejos = { lat: LOCAL.lat - 0.5, lng: LOCAL.lng };
    expect(cotizarEnvio(LOCAL, lejos, TARIFA).costo).toBe(25);
  });

  it('avisa cuando queda fuera del radio de reparto', () => {
    const lejos = { lat: LOCAL.lat - 0.2, lng: LOCAL.lng };
    const q = cotizarEnvio(LOCAL, lejos, TARIFA);

    expect(q.distancia_km).toBeGreaterThan(12);
    expect(q.dentroDeCobertura).toBe(false);
  });

  it('sin radio ni tope cobra la escala completa', () => {
    const q = cotizarEnvio({ lat: 0, lng: 0 }, { lat: 0.0692, lng: 0 }, {
      ...TARIFA, envio_maximo: null, envio_radio_km: null,
    });
    expect(q.dentroDeCobertura).toBe(true);
    expect(q.distancia_km).toBeCloseTo(10, 0);
    // 10 km: 2,5 incluidos + 8 km redondeados hacia arriba.
    expect(q.costo).toBe(8 + 8 * 2.5);
  });
});
