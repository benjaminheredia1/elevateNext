import { describe, it, expect } from 'vitest';
import {
  costoPorDistancia,
  cotizarEnvio,
  distanciaLineaRecta,
  distanciaRecorrido,
  RECARGO_LLUVIA,
  type LimitesEnvio,
} from './envio';

/** Lo que decide cada local: hasta dónde reparte y si le pone tope al cobro. */
const LIMITES: LimitesEnvio = {
  envio_maximo: null,
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

describe('tarifario por tramos', () => {
  it('cobra cada tramo por su borde', () => {
    // El borde de arriba pertenece al tramo; el siguiente decimal ya es el que sigue.
    const bordes: [number, number][] = [
      [0, 10], [2, 10], [2.1, 12], [3, 12], [3.1, 15], [5, 15],
      [5.1, 18], [6, 18], [6.1, 20], [7, 20], [7.1, 22], [8, 22],
      [8.1, 25], [9, 25], [9.1, 27], [10, 27], [10.1, 30], [11, 30],
      [11.1, 32], [12, 32],
    ];
    for (const [km, esperado] of bordes) {
      expect(costoPorDistancia(km), `${km} km`).toBe(esperado);
    }
  });

  it('pasado el último tramo suma Bs 3 por km entero', () => {
    expect(costoPorDistancia(12.1)).toBe(35); // 32 + 1 km
    expect(costoPorDistancia(13)).toBe(35);
    expect(costoPorDistancia(13.5)).toBe(38); // 32 + 2 km
    expect(costoPorDistancia(20)).toBe(32 + 8 * 3);
  });
});

describe('cotización del envío', () => {
  it('cobra el primer tramo cerca del local', () => {
    // ~300 m de la puerta del local.
    const cerca = { lat: -17.7621, lng: -63.1998 };
    const q = cotizarEnvio(LOCAL, cerca, LIMITES);

    expect(q.distancia_km).toBeLessThan(2);
    expect(q.costo).toBe(10);
    expect(q.dentroDeCobertura).toBe(true);
  });

  it('cotiza según la distancia de recorrido, no la línea recta', () => {
    // 4,5 km de recorrido (3,46 en línea recta) → tramo de 3,1 a 5 km.
    const q = cotizarEnvio({ lat: 0, lng: 0 }, { lat: 0.03114, lng: 0 }, LIMITES);
    expect(q.distancia_km).toBeCloseTo(4.5, 1);
    expect(q.costo).toBe(15);
  });

  it('respeta el tope por lejos que sea', () => {
    const lejos = { lat: LOCAL.lat - 0.5, lng: LOCAL.lng };
    expect(cotizarEnvio(LOCAL, lejos, { ...LIMITES, envio_maximo: 40 }).costo).toBe(40);
  });

  it('avisa cuando queda fuera del radio de reparto', () => {
    const lejos = { lat: LOCAL.lat - 0.2, lng: LOCAL.lng };
    const q = cotizarEnvio(LOCAL, lejos, LIMITES);

    expect(q.distancia_km).toBeGreaterThan(12);
    expect(q.dentroDeCobertura).toBe(false);
  });

  it('sin radio ni tope cobra la escala completa', () => {
    const q = cotizarEnvio({ lat: 0, lng: 0 }, { lat: 0.0692, lng: 0 }, {});
    expect(q.dentroDeCobertura).toBe(true);
    expect(q.distancia_km).toBeCloseTo(10, 0);
    expect(q.costo).toBe(27);
  });

  it('la lluvia suma su recargo sobre el tarifario, sin quedar bajo el tope', () => {
    const destino = { lat: 0.03114, lng: 0 };
    const seco = cotizarEnvio({ lat: 0, lng: 0 }, destino, LIMITES);
    const lluvia = cotizarEnvio({ lat: 0, lng: 0 }, destino, LIMITES, { lluvia: true });
    expect(lluvia.costo).toBe(seco.costo + RECARGO_LLUVIA);

    // El tope acota la distancia, no el recargo del viaje bajo lluvia.
    const conTope = cotizarEnvio({ lat: 0, lng: 0 }, destino, { envio_maximo: 12 }, { lluvia: true });
    expect(conTope.costo).toBe(12 + RECARGO_LLUVIA);
  });
});
