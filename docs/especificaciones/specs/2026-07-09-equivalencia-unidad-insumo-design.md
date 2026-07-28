# Diseño: Equivalencia de unidad por insumo

## Contexto

Requerimiento: "Es necesario que el botón de unidad no solo despliegue las categorías [opciones], permita especificar la unidad de medida (por ejemplo, mililitros) y mostrando esta información en pantalla." Referencia visual: al crear/editar un insumo, además de la unidad de medida principal, un campo adicional para registrar a cuánto equivale una unidad en otra medida (ej. 1 "unidad" de pan = 300 gr, 1 "unidad" de tomate = 20 gr).

## Decisiones (de la conversación con el usuario)

- Aplica a **todas** las unidades, sin excepción (no solo a unidades de conteo como "UNIDAD").
- La unidad base de la equivalencia la elige el usuario libremente (select, misma lista del catálogo de Unidades) — no se infiere automáticamente.
- Uso: **solo informativo por ahora**. No dispara conversiones ni afecta cálculos de stock/recetas/costos.
- Se muestra como **columna nueva en la tabla de Insumos** (pestaña "Insumos" del inventario).
- Se guarda como **atributo opcional en el propio modelo `Insumo`** (no como tabla aparte) — decisión final tras evaluar la alternativa de tabla separada.

## Modelo de datos

Dos columnas nuevas, nullable, en `Insumo`:

```prisma
model Insumo {
  // ...campos existentes...
  equivalencia_unidad   String?
  equivalencia_cantidad Float?
}
```

Ambas nulas por defecto — un insumo puede no tener equivalencia registrada. Si se llena una, la otra es requerida (regla de validación en frontend y backend).

## Backend

- `POST /api/insumo` y `PUT /api/insumo/[id]` (`app/api/insumo/route.ts`, `app/api/insumo/[id]/route.ts`): aceptan `equivalencia_unidad` (string u null) y `equivalencia_cantidad` (number u null) junto al resto de campos ya destructurados del body. Se guardan tal cual (sin lógica extra) en el `data` de `create`/`update`.
- `GET /api/insumo`: no requiere cambios — al ser columnas del mismo modelo, `findMany` ya las devuelve.
- Validación mínima en el handler: si viene uno de los dos campos sin el otro, se ignora el par (queda `null`/`null`) en vez de fallar — la validación fuerte vive en el frontend, consistente con el resto del formulario de insumo que tampoco usa zod hoy.

## Frontend (`components/admin/AdminInsumos.tsx`)

- `interface Insumo`: agrega `equivalencia_unidad: string | null` y `equivalencia_cantidad: number | null`.
- `FormState`: agrega `equivalencia_unidad: string` y `equivalencia_cantidad: string`.
- En los modales "Nuevo insumo" y "Editar insumo": nuevo bloque "Equivalencia (opcional)" con un `select` de unidad (reutiliza `unidadesParaSelect`, igual que el campo "Unidad" existente) y un input numérico de cantidad.
- Validación en `submitModal`: si se llenó uno de los dos campos y el otro está vacío, se muestra error y no se envía la petición.
- Al enviar: si ambos campos están vacíos, se manda `equivalencia_unidad: null, equivalencia_cantidad: null`; si ambos tienen valor, se mandan tal cual.
- Tabla de insumos: nueva columna "Equivalencia" (entre "Categoría" y "Nivel"), mostrando `{cantidad} {unidad}` (ej. "300 GR") o "—" si no está definida.

## Fuera de alcance

- Cualquier conversión automática de stock, receta o costo basada en esta equivalencia — queda para una fase futura si se decide usarla operativamente.
- Migrar el campo a una tabla separada — se evaluó y se descartó a favor de columnas simples en `Insumo`.

## Análisis de impacto

- No hay ningún schema `zod` que valide la forma completa de `Insumo` para creación/edición (`app/api/insumo/route.ts` y `[id]/route.ts` destructuran campos manualmente) — agregar dos campos opcionales no rompe validación existente.
- `GET /api/insumo` no usa `select` explícito (trae el registro completo), así que los nuevos campos aparecen automáticamente sin tocar ese handler.
- Otros consumidores de `Insumo` (`insumos-mixtos`, `recetas`, `admin/insumos/{compra,merma,conteo,baja,reactivar}`, `lib/server/dto/inventario.dto.ts`) no seleccionan ni validan estos campos — no se ven afectados por ser nullable.
- Migración de base de datos: dos `ALTER TABLE ... ADD COLUMN` nullables, sin default forzado — no requiere backfill ni rompe filas existentes.
