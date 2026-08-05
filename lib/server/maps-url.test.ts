import { describe, it, expect } from 'vitest';
import { coordenadasDesdeUrlMaps, esEnlaceCorto, coordenadasParaGuardar } from './maps-url';

describe('coordenadas desde un enlace de Google Maps', () => {
  it('prefiere la ubicación del lugar (!3d!4d) sobre el centro de la cámara (@)', () => {
    // Enlace real de la sucursal, ya expandido: la cámara y el lugar difieren
    // en unos metros y el que vale es el del lugar.
    const url = 'https://www.google.com/maps/place/Fitbull+gym+Center/@-17.7529208,-63.1748314,83m/data=!3m1!1e3!4m6!3m5!1s0x93f1e72213bb32d5:0x1111d4f507f8d584!8m2!3d-17.7530123!4d-63.1747647';
    expect(coordenadasDesdeUrlMaps(url)).toEqual({ lat: -17.7530123, lng: -63.1747647 });
  });

  it('usa el centro de la cámara cuando el enlace no trae el lugar', () => {
    const url = 'https://www.google.com/maps/@-17.7529208,-63.1748314,17z';
    expect(coordenadasDesdeUrlMaps(url)).toEqual({ lat: -17.7529208, lng: -63.1748314 });
  });

  it('lee el par lat,lng de ?q=, que es como arma el link la propia tienda', () => {
    const url = 'https://www.google.com/maps?q=-17.788821624259754,-63.13940705186849';
    expect(coordenadasDesdeUrlMaps(url)).toEqual({ lat: -17.788821624259754, lng: -63.13940705186849 });
  });

  it('no inventa coordenadas cuando el enlace no las tiene', () => {
    // Búsqueda por nombre: no hay punto que sacar.
    expect(coordenadasDesdeUrlMaps('https://www.google.com/maps/search/fitbull+gym')).toBeNull();
    // Enlace corto sin expandir: las coordenadas están del otro lado de la redirección.
    expect(coordenadasDesdeUrlMaps('https://maps.app.goo.gl/P1tn2jApL9xsuNmj9')).toBeNull();
    expect(coordenadasDesdeUrlMaps(null)).toBeNull();
    expect(coordenadasDesdeUrlMaps('')).toBeNull();
  });

  it('descarta valores imposibles y la isla nula', () => {
    // (0,0) es el Atlántico: siempre es un error de parseo, nunca un local.
    expect(coordenadasDesdeUrlMaps('https://www.google.com/maps?q=0,0')).toBeNull();
    expect(coordenadasDesdeUrlMaps('https://www.google.com/maps/@-999,500,17z')).toBeNull();
  });

  it('reconoce los enlaces cortos, que son los que hay que expandir', () => {
    expect(esEnlaceCorto('https://maps.app.goo.gl/P1tn2jApL9xsuNmj9')).toBe(true);
    expect(esEnlaceCorto('https://www.google.com/maps/place/x/@-17.75,-63.17,17z')).toBe(false);
    expect(esEnlaceCorto('no es una url')).toBe(false);
  });
});

describe('qué coordenadas se guardan', () => {
  it('lo cargado a mano gana: no se pisa con lo del enlace', async () => {
    const guardadas = await coordenadasParaGuardar({
      lat: -17.5,
      lng: -63.5,
      maps_url: 'https://www.google.com/maps?q=-17.75,-63.17',
    });
    expect(guardadas).toEqual({ lat: -17.5, lng: -63.5 });
  });

  it('sin coordenadas escritas, salen del enlace', async () => {
    const guardadas = await coordenadasParaGuardar({
      maps_url: 'https://www.google.com/maps?q=-17.75,-63.17',
    });
    expect(guardadas).toEqual({ lat: -17.75, lng: -63.17 });
  });

  it('una latitud sin su longitud no alcanza: se completa desde el enlace', async () => {
    const guardadas = await coordenadasParaGuardar({
      lat: -17.5,
      maps_url: 'https://www.google.com/maps?q=-17.75,-63.17',
    });
    expect(guardadas).toEqual({ lat: -17.75, lng: -63.17 });
  });

  it('sin nada utilizable guarda vacío, no un cero que rompería la cotización', async () => {
    expect(await coordenadasParaGuardar({})).toEqual({ lat: null, lng: null });
    expect(await coordenadasParaGuardar({
      maps_url: 'https://www.google.com/maps/search/fitbull',
    })).toEqual({ lat: null, lng: null });
  });
});
