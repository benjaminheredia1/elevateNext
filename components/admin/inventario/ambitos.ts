/**
 * El inventario de la sucursal y el del Centro de Producción son la misma
 * tabla sobre datos de distinto dueño. Cada ámbito describe a qué endpoints
 * apunta el núcleo compartido, para que el núcleo no tenga que preguntarse
 * nunca en cuál de los dos está corriendo.
 *
 * Lo que NO es común —selector de sucursal, consolidado del negocio, copiar
 * insumos entre locales, baja y reactivación por local— vive fuera del núcleo,
 * en el marco de cada pantalla. La regla que trazó ese límite: si el Centro
 * necesitara un `if (ambito.id === 'centro')` para que una pieza tenga
 * sentido, esa pieza no es compartida.
 *
 * Las URLs de acá están copiadas de los handlers reales, no del plan.
 */
export interface AmbitoInventario {
  id: 'sucursal' | 'centro';
  /** Lista de insumos con su stock en este ámbito. */
  listarUrl: (contextoId: number) => string;
  compraUrl: string;
  mermaUrl: string;
  conteoUrl: string;
  /** Edición de los niveles de alerta (mínimo y punto crítico). */
  umbralesUrl: string;
  /** Kardex: los movimientos de inventario del ámbito. */
  kardexUrl: (contextoId: number) => string;
  /**
   * Nombre con el que cada handler espera recibir el contexto en el body.
   * Los DTOs de compra/merma/conteo son idénticos campo por campo salvo en
   * esta clave, así que alcanza con parametrizarla para que el núcleo arme un
   * solo body para los dos ámbitos.
   */
  claveContexto: 'sucursal_id' | 'centro_id';
  /**
   * Si el ámbito puede comprarle a un proveedor. Hoy los dos pueden; la
   * sucursal lo pierde recién cuando el Centro sea el único origen de
   * mercadería y la mudanza de stock ya esté hecha.
   */
  permiteCompra: boolean;
}

export const AMBITO_SUCURSAL: AmbitoInventario = {
  id: 'sucursal',
  // `incluir_inactivos=1` porque el panel también muestra y reactiva los dados
  // de baja. Sin `sucursal` el endpoint devuelve el agregado del negocio, que
  // es justo lo que el panel llama "consolidado": por eso contextoId 0 —"todas
  // las sucursales"— sale de la URL en vez de viajar como sucursal=0.
  listarUrl: contextoId => `/api/insumo?incluir_inactivos=1${contextoId ? `&sucursal=${contextoId}` : ''}`,
  compraUrl: '/api/admin/insumos/compra',
  mermaUrl: '/api/admin/insumos/merma',
  conteoUrl: '/api/admin/insumos/conteo',
  // La sucursal no tiene un endpoint solo de umbrales: sus niveles de alerta
  // viajan dentro de la ficha del insumo, con `PUT /api/insumo/{id}`.
  umbralesUrl: '/api/insumo',
  // El kardex de sucursal no filtra por local: devuelve los últimos 50
  // movimientos del negocio. Se deja tal cual —cambiarlo sería otra tarea—,
  // por eso el contexto no se usa.
  kardexUrl: () => '/api/insumo/movimiento',
  claveContexto: 'sucursal_id',
  permiteCompra: true,
};

export const AMBITO_CENTRO: AmbitoInventario = {
  id: 'centro',
  listarUrl: contextoId => `/api/admin/centros-produccion/${contextoId}/insumos`,
  compraUrl: '/api/admin/centros-produccion/compra',
  mermaUrl: '/api/admin/centros-produccion/merma',
  conteoUrl: '/api/admin/centros-produccion/conteo',
  umbralesUrl: '/api/admin/centros-produccion/umbrales',
  // ⚠️ Este handler todavía no existe: MovimientoCentro se escribe pero no se
  // expone por HTTP. La pantalla del Centro (tarea siguiente) tiene que
  // crearlo antes de usar la pestaña de movimientos.
  kardexUrl: contextoId => `/api/admin/centros-produccion/${contextoId}/movimientos`,
  claveContexto: 'centro_id',
  permiteCompra: true,
};
