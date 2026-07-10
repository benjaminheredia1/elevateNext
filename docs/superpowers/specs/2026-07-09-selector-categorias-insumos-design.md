# Diseño: Selector de categorías (checkboxes) en Inventario

## Contexto

Requerimiento del documento "Requerimientos Adicionales Elevate": en el módulo de Inventario, agregar un botón de categorías que permita, además de buscar por nombre, seleccionar categorías específicas para filtrar la lista de insumos (checkboxes, no solo texto libre).

## Estado actual

`Insumo.categoria_insumo` es un campo de texto libre (`String?`, no hay una tabla `Categoria` para insumos — esa tabla existe solo para productos del menú). Hoy el único filtro por categoría es indirecto: el buscador de texto (`search`) hace match contra `nombre` O `categoria_insumo` como substring.

## Decisión de alcance

- Sin cambios de schema ni backend — es un filtro 100% client-side sobre datos ya cargados (`insumos`, ya en memoria).
- Las opciones del selector se derivan dinámicamente de los valores distintos de `categoria_insumo` presentes en los insumos cargados (ordenados alfabéticamente), no de un catálogo nuevo.
- Comportamiento por defecto: sin categorías marcadas = sin filtro (se muestran todos los insumos). Marcar una o más categorías reduce la lista a solo esas. "Limpiar selección" desmarca todo (vuelve a mostrar todos).
- Este filtro se combina (AND) con el buscador de texto y con el filtro de estado de stock (Todos/OK/Bajo/Crítico/Agotado) ya existentes.

## Implementación

En `components/admin/AdminInsumos.tsx`:
- Nuevo estado: `selectedCategorias: string[]` (vacío = sin filtro), `categoriaMenuOpen: boolean`.
- Derivado: `categoriasDisponibles` — valores únicos no vacíos de `categoria_insumo` entre los insumos cargados, ordenados alfabéticamente.
- `filtered` (ya existente) gana una condición adicional: si `selectedCategorias` no está vacío, solo pasan los insumos cuyo `categoria_insumo` esté en esa lista.
- UI: botón "Categorías" junto al buscador (dentro de `admin-filters`), que al hacer click despliega un panel con un checkbox por categoría disponible + "Limpiar selección". El botón muestra un badge con la cantidad seleccionada cuando hay alguna.
- Sin persistencia — el filtro se resetea al recargar la página (como el resto de los filtros de esta vista).

## Fuera de alcance

- No se crea una tabla/catálogo de categorías para insumos (seguiría siendo texto libre).
- No se toca el filtro de estado de stock existente ni el buscador de texto.
