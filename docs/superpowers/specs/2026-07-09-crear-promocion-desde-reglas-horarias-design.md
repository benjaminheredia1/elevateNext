# Diseño: Crear promoción directamente desde Reglas Horarias

## Contexto

Requerimiento: "En el módulo de promociones, se implementará una modificación que permita no solo editar y crear la regla, sino también crear la promoción directamente desde esta misma sección, incluyendo la posibilidad de activarla con su respectivo límite de tiempo."

## Investigación del estado actual

- `POST /api/promociones` (`app/api/promociones/route.ts`) ya existe y crea una `PromocionesDescuentos` (`nombre`, `valor`) — pero **ninguna pantalla del admin lo usa**. `components/admin/ReglasHorarias.tsx` solo hace `GET /api/promociones` para poblar un `<select>`, y si no hay promociones creadas, muestra "Sin promociones disponibles: Crea una promoción antes de asignarle un horario" — sin decir dónde. No existe ningún otro lugar en el código que llame a `POST /api/promociones`.
- `PromocionesDescuentos.valor` es un `String` libre, ya interpretado en `lib/server/productos/precio.ts:64-69`: si contiene `%` es porcentaje, si no, es un monto fijo restado del precio.
- `ReglasHorarias` (fecha_inicio/fecha_fin) ES el mecanismo de "activar con límite de tiempo" que ya existe — no hay que inventar nada nuevo, solo permitir crearla en el mismo paso que la promoción.
- El mockup de referencia (PDF) muestra un botón "+ Promo" junto a "Nueva regla" en el header de esta pantalla.

## Decisión de alcance

- Sin cambios de schema — se usa `POST /api/promociones` (ya existe) y `POST /api/reglas-horarias` (ya existe).
- No se toca la vinculación promoción↔producto (`PromocionProducto`) — el requerimiento no la menciona, y el endpoint existente tampoco la crea; queda igual que hoy (fuera de alcance).
- Nuevo modal "Nueva promoción" en `components/admin/ReglasHorarias.tsx`, accesible con un botón "+ Promo" junto a "Nueva regla":
  - Campos: Nombre, Valor (con hint: "Ej. 10% o 5 (monto fijo)").
  - Checkbox "Activar ahora con un límite de tiempo" — al marcarlo, aparecen los mismos campos Inicio/Fin (datetime-local) que ya usa `NuevaReglaModal`.
  - Al guardar: `POST /api/promociones` para crear la promoción; si el checkbox estaba marcado, encadena `POST /api/reglas-horarias` con el id de la promoción recién creada y las fechas ingresadas.
  - Si el checkbox NO está marcado, la promoción queda creada sin regla horaria (disponible luego en el `<select>` de "Nueva regla", como ya funciona hoy).

## Fuera de alcance

- Vincular la promoción a productos específicos (`PromocionProducto`) — no lo pide el requerimiento ni lo soporta el endpoint actual.
- Editar una promoción existente (el requerimiento dice "crear", no "editar" — "editar y crear la regla" se refiere a la regla horaria, que ya se puede crear; no hay edición de reglas hoy tampoco, y no se agrega en este cambio).
