# Implementation Plan — Unidad de medida con cantidad integrada en `/admin/insumos`

## Pedido del cliente

> "Es necesario que el botón de unidad no solo despliegue las categorías registradas, sino que también permita especificar la unidad de medida (por ejemplo, mililitros) junto con la cantidad correspondiente, mostrando esta información en pantalla."

En el mockup: al seleccionar la unidad (ej. `lt`) aparece, pegado debajo del selector, un campo **"Cantidad (litros)"** con sufijo `L`.

## Estado actual (base ya existente)

El commit `ec1e452` (feat: equivalencia de unidad opcional en insumos) ya dejó lista la mayor parte del backend y datos:

- **Schema** ([prisma/schema.prisma:294-296](prisma/schema.prisma#L294-L296)): `Insumo.equivalencia_unidad: String?` y `Insumo.equivalencia_cantidad: Float?` — informativos, no afectan stock ni recetas.
- **API**: POST/PUT de insumos ya persisten ambos campos (el componente ya los envía en [AdminInsumos.tsx:370](components/admin/AdminInsumos.tsx#L370) y [:384](components/admin/AdminInsumos.tsx#L384)).
- **Validación**: ya existe la regla "ambos o ninguno" ([AdminInsumos.tsx:356-359](components/admin/AdminInsumos.tsx#L356-L359)).
- **Tabla**: ya hay una columna que muestra la equivalencia ([AdminInsumos.tsx:590](components/admin/AdminInsumos.tsx#L590)).

**El gap es de UX**: los campos hoy están al final del formulario como "Cantidad equivalente" / "Unidad equivalente", desconectados del selector de Unidad. El cliente no los encuentra ni entiende su relación con la unidad. Hay que integrarlos al control de Unidad como muestra el mockup.

## Alcance

Solo frontend: `components/admin/AdminInsumos.tsx` (+ estilos si hace falta una clase nueva). **No se toca schema ni API** (restricción de DB compartida: solo cambios aditivos y puntuales).

---

## Cambio 1 — Bloque "Unidad" integrado en el modal (crear y editar)

**Archivos/zonas:** `AdminInsumos.tsx`, modal `crear` (~líneas 735-762) y modal `editar` (~líneas 768-794). Ambos comparten la misma estructura; extraer el bloque a un fragmento/función local para no duplicarlo.

**Concepto clave — cuándo tiene sentido el contenido por unidad:**

La equivalencia expresa *cuánto contiene una unidad contable*: `1 UNIDAD (caja de leche) = 946 ml`, `1 UNIDAD (pan) = 300 g`, `1 botella = 500 ml`. Si la unidad principal ya es una medida (lt, ml, kg, gr), la equivalencia es redundante (`1 lt = 1000 ml` no aporta) o contradictoria (`1 lt = 500 ml` es un sinsentido). El mockup del cliente (Unidad `lt` → "Cantidad (litros) 1.00") refleja que cuentan envases de 1 litro: su unidad real es contable (botella/unidad) con contenido de 1 L.

Por eso el panel se muestra **solo cuando la unidad principal es contable** (no es lt/ml/kg/gr):

```
Unidad
┌─────────────────────────────┐
│ UNIDAD                    ▼ │   ← select de unidades registradas (igual que hoy) + botón "+ Nueva"
└─────────────────────────────┘
┌─────────────────────────────┐
│ Contenido por unidad (opc.) │   ← panel anidado, solo si la unidad es contable
│  Unidad de medida: [ml ▼]   │   ← select: ml, lt, gr, kg (medidas)
│  Cantidad (mililitros): 500 │   ← input numérico con label y sufijo dinámicos
└─────────────────────────────┘
```

Detección de unidad de medida vs contable con una lista local: `const UNIDADES_MEDIDA = ['ML', 'LT', 'GR', 'KG'];` — cualquier otra unidad registrada (UNIDAD, botella, caja, bolsa, etc.) se considera contable y muestra el panel. Si la unidad principal es de medida, el panel se oculta (y al guardar se limpian los campos de equivalencia si estaban llenos, para no dejar datos incoherentes).

**Implementación:**

1. Eliminar los dos campos sueltos del final ("Cantidad equivalente" / "Unidad equivalente") y su hint.
2. Debajo del selector de Unidad, renderizar un sub-panel (mismo `form-group`, borde resaltado como en el mockup), **visible solo si la unidad principal es contable**, con:
   - Select **"Unidad de medida"** → opciones de medida (ml, lt, gr, kg) + opción "—" (sin especificar). Mapea a `form.equivalencia_unidad`.
   - Input **"Cantidad ({label})"** con sufijo → mapea a `form.equivalencia_cantidad`. Solo visible cuando hay unidad de medida elegida.
3. Label y sufijo dinámicos según la unidad de medida seleccionada, con un mapa local y fallback al nombre tal cual:

```tsx
const UNIDAD_LABELS: Record<string, { label: string; sufijo: string }> = {
  ML: { label: 'mililitros', sufijo: 'ml' },
  LT: { label: 'litros', sufijo: 'L' },
  GR: { label: 'gramos', sufijo: 'g' },
  KG: { label: 'kilogramos', sufijo: 'kg' },
  UNIDAD: { label: 'unidades', sufijo: 'u.' },
};
const medidaInfo = (u: string) =>
  UNIDAD_LABELS[u.toUpperCase()] ?? { label: u.toLowerCase(), sufijo: u.toLowerCase() };
```

4. El input con sufijo: wrapper `position: relative` con `<span>` absoluto a la derecha (como muestra el mockup con la "L"), o reutilizar un patrón de input-con-sufijo si ya existe en el CSS del admin.
5. Hint dentro del panel: `Ej.: 1 {form.unidad_medida} de este insumo = {cantidad} {sufijo}. No afecta stock ni recetas.`

**Sin cambios de lógica:** el estado del form (`equivalencia_unidad`, `equivalencia_cantidad`), la validación "ambos o ninguno" y el payload al API quedan como están — solo se reubica y re-etiqueta la UI.

---

## Cambio 2 — Mostrar la información en pantalla (tabla)

**Archivo/zona:** columna de equivalencia en la tabla ([AdminInsumos.tsx:590](components/admin/AdminInsumos.tsx#L590)).

Hoy muestra `300 GR`. Cambiar el formato para que se lea como relación completa y con el label amigable:

```tsx
<td>
  {insumo.equivalencia_cantidad != null && insumo.equivalencia_unidad
    ? `1 ${insumo.unidad_medida} = ${number(insumo.equivalencia_cantidad)} ${medidaInfo(insumo.equivalencia_unidad).sufijo}`
    : '—'}
</td>
```

Resultado en pantalla: `1 UNIDAD = 946 ml`, `1 botella = 500 ml`. Verificar que el header de esa columna diga algo claro (ej. "Contenido").

---

## Cambio 3 — Limpieza al cambiar de unidad

Si el usuario llena el contenido y luego cambia la Unidad principal a una de medida (lt, ml, kg, gr), limpiar `equivalencia_unidad`/`equivalencia_cantidad` del form (el panel se oculta y no deben quedar datos huérfanos que se guarden sin verse). Al volver a una unidad contable, el panel reaparece vacío.

---

## Fuera de alcance (explícito)

- Conversiones automáticas de stock o recetas usando la equivalencia (sigue siendo informativa, como define el schema).
- Cambios en `prisma/schema.prisma` o en las rutas API de insumos.
- Catálogo de unidades: se sigue gestionando desde el modal de unidades existente ("+ Nueva").

## Verificación

1. `npm run dev` → `/admin/insumos` → "Nuevo insumo".
2. Seleccionar Unidad `UNIDAD` (o `botella`): debe aparecer el panel anidado de contenido.
3. Elegir medida `ml` y cantidad `500`: el input dice "Cantidad (mililitros)" con sufijo `ml`; al cambiar a `lt`, pasa a "Cantidad (litros)" y sufijo `L`.
4. Seleccionar Unidad `lt` o `kg`: el panel NO debe aparecer (y si tenía datos, se limpian).
5. Guardar con cantidad y sin unidad de medida (o al revés) → debe mostrar el error de validación existente.
6. Guardar completo → la fila del insumo muestra `1 UNIDAD = 500 ml` en la columna de contenido.
7. Editar ese insumo → el panel carga los valores guardados correctamente.
8. Crear un insumo sin especificar contenido → guarda bien y la columna muestra `—` (campo opcional intacto).
