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
   * Si el handler acepta que la clave de contexto no viaje. La sucursal sí
   * —sin ella el servidor resuelve la principal, que es como funcionaba el
   * negocio antes de multi-sucursal—; el Centro no: su DTO exige `centro_id`
   * entero y positivo. El núcleo lo consulta antes de escribir para no mandar
   * un body que sabe que va a volver 422.
   */
  contextoOpcional: boolean;
  /**
   * Si la columna "Cobertura" —cuántos días dura el stock al ritmo de consumo—
   * tiene sentido en este ámbito. La sucursal sí la mide (`uso_diario_promedio`
   * sale de lo que se vende ahí). El Centro no: su pregunta equivalente es el
   * rinde, "con este bruto puedo producir N unidades", y vive en la pestaña
   * Producción bajo el rótulo "Alcanza para". Mostrar las dos juntas, una de
   * ellas siempre vacía, invita a leerlas como si fueran lo mismo.
   */
  mideCobertura: boolean;
  /**
   * Si el ámbito puede comprarle a un proveedor. Solo el Centro: desde el corte
   * la sucursal no compra, recibe traslados. El botón sale del panel por esta
   * bandera y no por un `if` con el id del ámbito.
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
  contextoOpcional: true,
  mideCobertura: true,
  permiteCompra: false,
};

export const AMBITO_CENTRO: AmbitoInventario = {
  id: 'centro',
  listarUrl: contextoId => `/api/admin/centros-produccion/${contextoId}/insumos`,
  compraUrl: '/api/admin/centros-produccion/compra',
  mermaUrl: '/api/admin/centros-produccion/merma',
  conteoUrl: '/api/admin/centros-produccion/conteo',
  umbralesUrl: '/api/admin/centros-produccion/umbrales',
  // ⚠️ Este handler TODAVÍA NO EXISTE: MovimientoCentro se escribe pero no se
  // expone por HTTP. Hasta que la pantalla del Centro lo cree, pedirlo devuelve
  // 404 y la pestaña Movimientos del Centro se ve vacía. La tabla de stock NO
  // se ve afectada: el núcleo pide stock y kardex por separado justamente para
  // que este 404 no se lea como "el Centro no tiene insumos".
  kardexUrl: contextoId => `/api/admin/centros-produccion/${contextoId}/movimientos`,
  claveContexto: 'centro_id',
  contextoOpcional: false,
  mideCobertura: false,
  permiteCompra: true,
};
