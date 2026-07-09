# Guía del Usuario Final — Elevate

**Sistema de gestión de comida saludable: tienda online, punto de venta (POS), caja, inventario y contabilidad.**

> Versión del documento: 1.0 · Dirigido a: dueños, administradores, cajeros, repartidores y clientes.
> Alcance: cubre **todas** las funcionalidades operativas del sistema de principio a fin.

---

## Tabla de contenido

1. [¿Qué es Elevate?](#1-qué-es-elevate)
2. [Conceptos clave (glosario operativo)](#2-conceptos-clave-glosario-operativo)
3. [Acceso al sistema y seguridad](#3-acceso-al-sistema-y-seguridad)
4. [Roles y matriz de permisos](#4-roles-y-matriz-de-permisos)
5. [Rol CLIENTE — La tienda online](#5-rol-cliente--la-tienda-online)
6. [Rol REPARTIDOR — Enlace de entrega (sin login)](#6-rol-repartidor--enlace-de-entrega-sin-login)
7. [Rol CAJERO — Panel de Caja](#7-rol-cajero--panel-de-caja)
8. [Roles ADMIN y DUEÑO — Panel de Administración](#8-roles-admin-y-dueño--panel-de-administración)
9. [Flujos de extremo a extremo](#9-flujos-de-extremo-a-extremo)
10. [Reglas de negocio que debes conocer](#10-reglas-de-negocio-que-debes-conocer)
11. [Preguntas frecuentes y resolución de problemas](#11-preguntas-frecuentes-y-resolución-de-problemas)
12. [Apéndice A — Diccionario de estados](#apéndice-a--diccionario-de-estados)

---

## 1. ¿Qué es Elevate?

Elevate es una plataforma integral para operar un negocio de comida saludable. Reúne, en un solo sistema, cuatro grandes áreas:

- **Venta al público (online):** un catálogo web donde el cliente arma su pedido, elige entrega a domicilio o recojo y paga.
- **Punto de venta / Caja (POS):** el cajero cobra ventas presenciales, entrega pedidos web, abre y cierra su turno de caja y concilia el efectivo.
- **Operación de cocina y logística:** seguimiento del pedido en tiempo real (preparación → camino → entregado) y rastreo GPS del repartidor.
- **Back office (administración):** productos, inventario con recetas, promociones, clientes, finanzas (caja, flujo, contabilidad, cuentas por cobrar/pagar, gastos, activos) y auditoría.

El sistema está diseñado para que **cada persona vea únicamente lo que necesita según su rol**, y para que cada movimiento de dinero e inventario quede **registrado y auditado**.

---

## 2. Conceptos clave (glosario operativo)

Antes de usar el sistema conviene entender el vocabulario, porque las pantallas lo usan constantemente.

### 2.1 Estado del pedido (cumplimiento)

Describe *dónde está* el pedido en su ciclo de vida, independientemente de si ya se pagó:

| Estado | Significado |
|---|---|
| `PENDIENTE` | Recién creado, aún no se empieza a preparar. |
| `EN_PREPARACION` | En cocina. **Aquí se descuenta el stock automáticamente.** |
| `LISTO` | Terminado, esperando ser recogido/despachado. |
| `EN_LOCAL` | El repartidor llegó al local a recoger. |
| `EN_CAMINO` | El repartidor salió con el pedido hacia el cliente. |
| `LLEGO` | El repartidor llegó al domicilio del cliente. |
| `ENTREGADO` | El cliente ya recibió el pedido. |
| `PAGADO` | Cerrado y cobrado (venta de mostrador). |
| `CANCELADO` | Anulado. |

### 2.2 Estado de pago (independiente del anterior)

El pago se rastrea **por separado** del cumplimiento, porque un pedido puede estar entregado pero no cobrado (fiado), o pagado pero no entregado (pago online anticipado):

| Estado de pago | Significado |
|---|---|
| `PENDIENTE` | Aún no se cobra (p. ej. recojo que paga en mostrador). |
| `PAGADO` | Ya ingresó el dinero. |
| `COD_PENDIENTE` | *Cash on delivery*: el repartidor cobra en efectivo al entregar. |
| `REEMBOLSADO` | Se devolvió el dinero. |

> **Regla de oro:** el *estado del pedido* y el *estado de pago* son dos dimensiones distintas. Siempre mira ambas.

### 2.3 Canal y tipo de entrega

- **Canal de venta:** `WEB` (pedido a domicilio por la tienda), `PICKUP` (recojo pedido por la web), `SALON` (venta presencial en mostrador).
- **Tipo de entrega:** `DELIVERY` (a domicilio) o `RECOJO` (el cliente pasa por el local).

### 2.4 Turno de caja

La **caja** funciona por *turnos*. El cajero **abre** su turno declarando el efectivo y el QR con que empieza, opera durante su jornada, y al final **cierra** contando el dinero real. El sistema calcula la **diferencia** entre lo esperado y lo real (cuadre). Solo puede haber **un turno abierto por sucursal** a la vez.

### 2.5 Cuentas financieras

Cada sucursal tiene cuentas por método de pago: **Efectivo**, **QR**, **Tarjeta**, **Banco**. Cada venta o gasto mueve el saldo de la cuenta correspondiente. Esto permite saber cuánto dinero hay en cada canal.

### 2.6 Fiado (venta a crédito)

Una venta **fiada** entrega el producto pero deja el pago pendiente: se crea una **Cuenta por Cobrar** a nombre de un **cliente registrado** (no puede ser anónimo ni cortesía). El dinero **no** entra a la caja hasta que el cliente pague la deuda.

### 2.7 Cortesía

Venta marcada como **cortesía**: se entrega el producto sin cobro y **no impacta la caja** (regalo, degustación, compensación). Descuenta stock igual que cualquier venta.

### 2.8 Privilegios (descuentos por cliente)

Un **privilegio** es un descuento porcentual asignado a un cliente (p. ej. "Socio VIP −15%"). Cuando ese cliente compra, el sistema aplica automáticamente **el privilegio activo de mayor porcentaje**. El descuento reduce el total cobrado (y, si es fiado, también reduce la deuda).

### 2.9 Marcas

El catálogo soporta **múltiples marcas** (p. ej. `elevate`, `fitbull`). Un producto puede pertenecer a una o varias marcas, y la tienda pública tiene una vista de menú por marca (`/menu/[marca]`).

### 2.10 Insumos, recetas y stock

- **Insumo:** materia prima (harina, pollo, envases…), con stock actual, stock mínimo, punto crítico y unidad de medida.
- **Insumo mixto:** insumo compuesto por otros insumos (una preparación intermedia).
- **Receta:** define qué insumos y cuánto consume cada producto. Es la base del **descuento automático de stock**.
- **Producto de reventa:** producto que no se elabora, sino que se vende tal cual (se mapea directo a un insumo).

---

## 3. Acceso al sistema y seguridad

### 3.1 Inicio de sesión

- La pantalla de acceso está en **`/login`**.
- Puedes ingresar con tu **correo o tu nombre de usuario** + contraseña.
- Tras iniciar sesión, el sistema te lleva automáticamente a tu área según tu rol:
  - **Dueño / Administrador →** `/admin` (Panel de Administración).
  - **Cajero →** `/caja` (Panel de Caja).
  - **Cliente →** `/` (Tienda).
- Si tu usuario está **inactivo**, no podrás entrar (mensaje "Usuario inactivo").

### 3.2 Seguridad de la sesión

- La sesión usa un **token JWT** firmado que se guarda en tu navegador y acompaña cada petición.
- El token **expira** por tiempo; si expira deberás iniciar sesión de nuevo.
- Las contraseñas se almacenan **cifradas** (hash bcrypt); nadie —ni el administrador— puede verlas en texto plano.
- Cada acceso registra tu **último acceso**.

### 3.3 Cierre de sesión

- En el panel (Admin o Caja) usa **"Cerrar sesión"** en el pie del menú lateral. Esto borra tu token del navegador y te devuelve a `/login`.

> **Buena práctica:** cierra sesión al terminar tu turno, sobre todo en equipos compartidos del local.

---

## 4. Roles y matriz de permisos

El sistema define cuatro roles con base de datos (`DUENO`, `ADMIN`, `CAJERO`, `CLIENTE`) más el **Repartidor**, que **no tiene cuenta**: opera a través de un enlace único y temporal.

| Rol | Dónde trabaja | Para qué sirve |
|---|---|---|
| **DUEÑO** (`DUENO`) | Panel de Administración `/admin` | Control total: operación, catálogo, inventario, finanzas, usuarios y auditoría. Máxima autoridad del negocio. |
| **ADMIN** (`ADMIN`) | Panel de Administración `/admin` | Mismas capacidades operativas que el dueño sobre el back office. |
| **CAJERO** (`CAJERO`) | Panel de Caja `/caja` | Opera el día a día: cobra ventas, entrega pedidos, gestiona su turno de caja y cobra fiados. |
| **CLIENTE** (`CLIENTE`) | Tienda `/` | Compra por la web. |
| **Repartidor** | Enlace `/driver/[token]` | Acepta la entrega, comparte su GPS y avanza los estados de la entrega. Sin login. |

### 4.1 Diferencia entre Dueño y Administrador

Funcionalmente, **Dueño y Administrador comparten los mismos permisos** en el back office: ambos pueden gestionar productos, inventario, finanzas, usuarios y auditoría. La distinción es **jerárquica/organizativa** (el Dueño es la autoridad última del negocio), no una restricción técnica de módulos. Se recomienda reservar la cuenta de Dueño para el propietario y usar cuentas de Administrador para el personal de confianza que administra el sistema.

### 4.2 Qué puede hacer el Cajero fuera de su panel

Aunque el cajero trabaja en `/caja`, tiene permiso para algunas acciones puntuales del dominio administrativo:

- **Registrar un fiado** (crear cuenta por cobrar asociada a una venta).
- **Consultar marcas** (para operar el catálogo en el POS).
- **Operar el ciclo de vida de los pedidos** (cambiar estados, asignar repartidor). Admin/Dueño pueden intervenir por excepción.

Todo lo demás del back office (inventario, contabilidad, usuarios, configuración, etc.) es exclusivo de **Dueño/Admin**.

---

## 5. Rol CLIENTE — La tienda online

La tienda pública (`/`) es la cara visible del negocio. **No requiere cuenta** para comprar.

### 5.1 Explorar el catálogo

- El cliente ve los productos **publicados** y **disponibles**, con foto, descripción, precio y, si aplica, información nutricional (calorías, proteína).
- Existe una vista de **menú por marca** en `/menu/[marca]` (por ejemplo `/menu/elevate` o `/menu/fitbull`).
- Si un producto tiene una **promoción activa** según las reglas horarias vigentes, el precio mostrado ya refleja el **descuento**.

### 5.2 Armar el pedido

1. El cliente agrega productos al carrito y ajusta cantidades.
2. Elige el **tipo de entrega**:
   - **Delivery (a domicilio):** debe indicar dirección y ubicación en el mapa.
   - **Recojo (pickup):** pasará por el local.
3. Completa sus **datos de contacto**: nombre, teléfono y, opcionalmente, correo y NIT (para factura).
4. Elige el **método de pago**: Efectivo, QR, Tarjeta o Transferencia (Banco).

### 5.3 Control de stock al comprar

- Al confirmar, el sistema **verifica el stock real** (según recetas e insumos). Si algún producto se agotó o no alcanza para la cantidad pedida, el pedido **se rechaza** con un mensaje claro indicando qué producto falta.
- Esto evita vender lo que la cocina no puede producir.

### 5.4 Estado de pago inicial según cómo pague

El sistema decide el estado de pago inicial automáticamente:

| Método de pago | Tipo de entrega | Estado de pago inicial | Explicación |
|---|---|---|---|
| QR o Tarjeta | Cualquiera | `PAGADO` | Se considera pagado (provisional, hasta integrar una pasarela real de pagos). |
| Efectivo | Delivery | `COD_PENDIENTE` | El repartidor cobra al entregar. |
| Efectivo | Recojo | `PENDIENTE` | Paga en el mostrador al recoger. |

### 5.5 Código de retiro

- Cada pedido genera un **código único de retiro** (5 caracteres legibles, sin letras ambiguas). El cliente lo presenta en el mostrador (recojo) para que el cajero identifique y entregue su pedido.

### 5.6 Seguimiento

- Cuando el pedido va en **delivery**, el cliente puede seguir al repartidor en un mapa en tiempo real (posición GPS, local y destino).

---

## 6. Rol REPARTIDOR — Enlace de entrega (sin login)

El repartidor **no inicia sesión**. El cajero o administrador genera un **enlace único** por pedido (`/driver/[token]`) y se lo envía (por ejemplo, por WhatsApp).

### 6.1 Aceptar la asignación

1. El repartidor abre el enlace y ve los datos del pedido: cliente, teléfono, dirección, productos y **monto a cobrar**.
2. Ingresa su **nombre** y pulsa **"Aceptar Asignación"**. Desde ese momento queda registrado como el repartidor del pedido.

### 6.2 Compartir ubicación (GPS)

- Al aceptar, la página pide permiso de **ubicación**. El navegador del teléfono envía la posición continuamente (`watchPosition`), actualizando `driver_lat`/`driver_lng` del pedido.
- Un mapa muestra tres puntos: **🏢 local**, **🏠 cliente** y **🔵 repartidor** en movimiento.
- El estado del GPS se muestra en pantalla ("📍 GPS Activo", o advertencias si no se concede permiso).

### 6.3 Avanzar la entrega

El repartidor pulsa botones que hacen avanzar el estado, en este orden:

1. **🏪 Llegué al local** → `EN_LOCAL`
2. **🚙 Recogí el pedido (En camino)** → `EN_CAMINO`
3. **📍 Llegué al destino** → `LLEGO`
4. **✅ Entregado** (con confirmación) → `ENTREGADO`

Al llegar a `ENTREGADO` o `CANCELADO`, el seguimiento se detiene y se muestra la pantalla de "Pedido Finalizado".

> **Nota sobre el cobro:** si el pedido era efectivo contra entrega (`COD_PENDIENTE`), el cobro del efectivo se concilia en caja cuando el repartidor retira o adelanta el dinero (ver sección 7.4 y 7.11).

---

## 7. Rol CAJERO — Panel de Caja

El cajero trabaja en **`/caja`**. Su menú lateral muestra el **estado del turno** (Abierto / Sin turno) y las siguientes secciones. Casi todas las operaciones que mueven dinero **exigen tener la caja abierta**.

### 7.1 Dashboard de caja (`/caja`)

Vista de inicio con el resumen del turno activo y accesos rápidos a las operaciones.

### 7.2 Apertura de caja (`/caja/apertura`)

- Antes de operar, el cajero **abre su turno** declarando el **efectivo inicial** y el **QR inicial** con que empieza, más observaciones opcionales.
- El sistema **impide abrir** si ya hay un turno abierto en la sucursal.
- Queda registrado en auditoría como `APERTURA_CAJA`.

### 7.3 Pedidos (`/caja/pedidos`)

- Permite **buscar un pedido por su código de retiro** para verificarlo en el mostrador antes de entregarlo.
- Muestra el detalle del pedido (productos, cliente, total) para confirmar que corresponde.

### 7.4 Entregar (`/caja/entregar`)

Cierra la entrega de un pedido web/pickup desde el mostrador, con lógica automática según el tipo:

- **Recojo (pickup):** si el pago está pendiente, **cobra en efectivo** en el mostrador, marca `PAGADO` y deja el pedido `ENTREGADO`.
- **Delivery:** exige indicar el **repartidor** que retira. Si era efectivo contra entrega (`COD_PENDIENTE`), el repartidor **adelanta el efectivo a la caja** (queda `PAGADO`), y el pedido pasa a `EN_LOCAL` con el repartidor asignado.
- Todo cobro en efectivo **exige caja abierta** e impacta el turno. También asegura el **descuento de stock** (de forma idempotente: nunca descuenta dos veces).

### 7.5 Venta presencial / mostrador (`/caja/venta`)

Registra una venta en salón (`SALON`). El proceso:

1. Se agregan productos; el **total se calcula en el servidor** con los precios reales (no se confía en el navegador).
2. Se rechazan productos no disponibles y totales ≤ 0.
3. Se identifica al **cliente**: registrado (buscándolo), con datos nuevos, o **anónimo** (venta de mostrador sin datos).
4. **Descuento por privilegio:** si el cliente tiene privilegios activos, se aplica el de **mayor porcentaje** automáticamente, y se anota el código de descuento (p. ej. "Privilegio: Socio VIP (−15%)").
5. Se elige la modalidad:
   - **Venta normal:** entra el dinero a la caja (efectivo o QR), queda `PAGADO`.
   - **Cortesía:** se entrega sin cobro; **no** impacta la caja.
   - **Fiado:** se entrega, pero el pago queda pendiente como **Cuenta por Cobrar** (requiere cliente registrado; no puede ser cortesía ni anónimo).
6. La venta **descuenta stock automáticamente** vía recetas.
7. Queda registrada en auditoría con su marca (`fiado`, `cortesía` o normal).

> **Protección anti-errores:** la venta tiene límite de frecuencia (máx. 3 ventas en 10 segundos) para evitar duplicados por doble clic.

### 7.6 Movimientos (`/caja/movimientos`)

- Muestra el **libro del turno**: todos los movimientos (ventas, ingresos, gastos) del turno abierto en orden cronológico. Es la vista de control del cajero durante su jornada.

### 7.7 Ingreso extra (`/caja/ingreso`)

- Registra un **ingreso de dinero** a la caja que no proviene de una venta (p. ej. un fondo adicional). Suma al saldo de la cuenta elegida (efectivo o QR) e impacta el cuadre.

### 7.8 Gasto operativo (`/caja/gasto`)

- Registra un **egreso/gasto** pagado desde la caja (p. ej. compra rápida, propina, taxi). Resta del saldo de la cuenta correspondiente. Requiere caja abierta.

### 7.9 Cierre de caja (`/caja/cierre`)

Al terminar el turno el cajero **cuenta el dinero real** y lo declara:

- El sistema calcula el **esperado** de cada cuenta = apertura + movimientos netos del turno.
- Compara contra el **real** declarado y calcula la **diferencia** (sobrante o faltante) de efectivo y de QR.
- Manejo inteligente: si por gastos el esperado quedó negativo, la diferencia se interpreta como **deuda**, no como falso sobrante.
- Guarda ventas por método, esperado, real, diferencias y observaciones. Marca el turno `CERRADO` y registra `CIERRE_CAJA` en auditoría.

> Tras cerrar, el turno pasa al **Historial** y ya no puede recibir movimientos.

### 7.10 Deudores / cobro de fiados (`/caja/deudores`)

- Lista todas las **cuentas por cobrar pendientes** (fiados), con el cliente, el saldo, el vencimiento y si está **vencida**.
- Muestra un **resumen**: saldo total pendiente, número de cuentas y cuántas están vencidas.
- Permite **cobrar** una deuda (total o parcial) en efectivo o QR. El pago:
  - Actualiza la deuda (`PARCIAL` o `PAGADA`).
  - **Ingresa dinero real** al turno abierto (impacta el cuadre).
  - No permite cobrar más que el saldo pendiente.

### 7.11 Repartidores del turno (conciliación)

- El sistema resume, por repartidor del turno abierto, cuántos pedidos llevó, cuántos entregó y cuánto **efectivo adelantó** a la caja. Sirve para conciliar el efectivo de delivery al cierre.

### 7.12 Historial (`/caja/historial`)

- Lista los **turnos cerrados** del cajero (últimos 50), con sucursal, número de pedidos y cifras del cuadre.
- Permite abrir el **detalle de un turno**: todos los pedidos de ese turno, con sus productos y el estado de fiados asociados.

---

## 8. Roles ADMIN y DUEÑO — Panel de Administración

El back office está en **`/admin`**, con un menú lateral organizado por grupos. Incluye **notificaciones en vivo** (nuevos pedidos y alertas de inventario) mediante *polling*, con un indicador "En vivo" y una campana con contador.

A continuación, cada módulo agrupado como aparece en el menú.

### Grupo: Operación

#### 8.1 Dashboard (`/admin`)
Vista general del negocio: tarjetas de estadísticas rápidas (pedidos de hoy, ingresos, insumos críticos), gráfico de pedidos por hora y tabla de pedidos recientes. Es el tablero de control diario.

#### 8.2 Pedidos (`/admin/orders`)
Gestión del flujo completo de pedidos:
- Cambiar el **estado** del pedido a lo largo de su ciclo (`PENDIENTE → EN_PREPARACION → LISTO → … → ENTREGADO/CANCELADO/PAGADO`).
- Cambiar el **estado de pago** (`payment_status`).
- **Generar el enlace del repartidor** (`driver_link_id`) para delivery.
- Registrar un **fiado** sobre el pedido.
- Al pasar a `EN_PREPARACION`, `LISTO` o `ENTREGADO`, el sistema **descuenta stock automáticamente** (idempotente).
- Cada transición queda en **auditoría** con el cambio exacto (p. ej. "estado PENDIENTE→EN_PREPARACION").
- La campana de notificaciones avisa de **nuevos pedidos** en tiempo real.

#### 8.3 Deliverys / Rastreo (`/admin/deliverys`)
Mapa en tiempo real (Leaflet) con la ubicación de los repartidores asignados a pedidos `EN_CAMINO`. Permite supervisar la logística de reparto sin recargar la página.

### Grupo: Catálogo

#### 8.4 Productos (`/admin/products`)
Administración del catálogo con un **asistente (wizard)** de creación/edición que cubre:
- Datos básicos: nombre, descripción, **precio**, imagen (con subida de archivo), disponibilidad.
- **Tipo de producto:** `ELABORADO` (se produce con receta) o `REVENTA` (se vende tal cual, ligado a un insumo).
- **Estado de publicación:** `BORRADOR`, `PUBLICADO`, `ARCHIVADO` (controla qué ve el cliente).
- **Marcas** a las que pertenece (elevate, fitbull, …).
- **Nutrición:** calorías y proteína.
- Métricas: **ventas acumuladas**.

#### 8.5 Categorías (`/admin/category`)
Clasificación del menú. Un producto puede pertenecer a varias categorías.

#### 8.6 Inventario / Insumos (`/admin/insumos`)
Control de inventario con **alertas visuales** (crítico / advertencia) cuando el stock cae bajo el mínimo o el punto crítico:
- Alta y edición de **insumos** (stock actual, mínimo, punto crítico, unidad de medida, costo promedio, categoría, proveedor y su teléfono, rendimiento, uso diario promedio).
- **Insumos mixtos:** composición de un insumo a partir de otros.
- Operaciones de inventario auditadas:
  - **Compra** de insumos (ingreso de stock, actualiza costo).
  - **Merma** (baja por desperdicio/vencimiento).
  - **Conteo físico** (ajuste del stock al valor real contado).
- Cada operación genera un **movimiento interno** (`INGRESO`, `EGRESO`, `PRODUCCION`, `MERMA`, `AJUSTE`) para trazabilidad.
- **Alertas de inventario (WhatsApp):** configuración de destinatarios, horas de silencio, intervalo mínimo y plantilla de mensaje; y envío/registro de alertas cuando hay insumos bajo umbral.

### Grupo: Negocio

#### 8.7 Analítica & Finanzas (`/admin/analitica`)
Analítica del negocio por rango de tiempo (por defecto 30 días): indicadores de venta, productos e inventario para decisiones de gestión. Exclusivo de Dueño/Admin.

#### 8.8 Configuración (`/admin/settings`)
Parámetros del sistema y **ubicación de la sucursal** (nombre y coordenadas), que alimenta el mapa del repartidor y del rastreo. También gestión de sucursales y marcas.

### Grupo: Finanzas

#### 8.9 Caja (supervisión) (`/admin/caja`)
Supervisión de los **turnos de caja** de los cajeros: apertura, cierre, ventas, esperado vs. real y diferencias. Permite auditar el cuadre de cada turno.

#### 8.10 Flujo de Caja (`/admin/flujo-caja`)
Reporte de **entradas y salidas de dinero** por rango y sucursal: cómo se mueve el efectivo del negocio en el tiempo.

#### 8.11 Contabilidad (`/admin/contabilidad`)
Reportes contables por rango y sucursal:
- **Estado de resultados** (ingresos, costos, utilidad).
- **Balance** (situación patrimonial).

#### 8.12 Cuentas por Cobrar (`/admin/cuentas-cobrar`)
Gestión de **lo que le deben al negocio** (fiados y otras cuentas por cobrar): saldos, vencimientos y **registro de pagos**. Es la contraparte administrativa del cobro de fiados que hace el cajero.

#### 8.13 Cuentas por Pagar (`/admin/cuentas-pagar`)
Gestión de **lo que el negocio debe** (proveedores, obligaciones): montos, vencimientos y pagos.

#### 8.14 Gastos Operativos (`/admin/gastos-operativos`)
Registro de gastos del día a día con concepto, categoría, monto, **método de pago**, fecha y notas.

#### 8.15 Gastos Fijos (`/admin/gastos-fijos`)
Catálogo de gastos recurrentes (alquiler, servicios, sueldos) con **frecuencia** (mensual, quincenal, semanal, anual) y categoría.

#### 8.16 Activos Fijos (`/admin/activos-fijos`)
Registro de bienes del negocio (equipos, mobiliario): fecha de compra, valor original, valor actual y **depreciación**.

### Grupo: Gestión

#### 8.17 Clientes (`/admin/clientes`)
Base única de clientes: datos de contacto, NIT, dirección, historial. Incluye **deduplicación / fusión** de clientes duplicados (por teléfono, email o NIT) y asignación de **privilegios** por cliente.

#### 8.18 Privilegios (`/admin/privilegios`)
Definición de descuentos porcentuales (nombre, descripción, porcentaje, activo). Estos privilegios se asignan a clientes y se aplican automáticamente en la venta.

#### 8.19 Horarios / Promociones (`/admin/reglasHorarias`)
Reglas horarias que activan **promociones y descuentos** en rangos de fecha/hora. Determinan cuándo un producto se muestra con precio rebajado en la tienda.

#### 8.20 Usuarios (`/admin/usuarios`)
Alta y gestión de los usuarios del sistema: nombre, correo/usuario, **rol** (Dueño, Admin, Cajero, Cliente), sucursal asignada y estado **activo/inactivo**. Desactivar un usuario le bloquea el acceso inmediatamente.

#### 8.21 Auditoría (`/admin/auditoria`)
Bitácora **append-only** (no editable) de todo lo relevante: quién hizo qué, cuándo, sobre qué entidad, con qué monto, IP y navegador. Registra creaciones, modificaciones, eliminaciones, logins/logouts y aperturas/cierres de caja. Es la herramienta de control y trazabilidad del negocio.

---

## 9. Flujos de extremo a extremo

Estos son los recorridos completos más comunes.

### 9.1 Pedido web a domicilio, pago en efectivo (COD)

1. **Cliente** arma el pedido en la tienda, elige **delivery** y **efectivo** → pedido creado `PENDIENTE`, pago `COD_PENDIENTE`, con código de retiro.
2. **Cocina/Admin** pasa el pedido a `EN_PREPARACION` → **stock descontado automáticamente**.
3. **Admin/Cajero** genera el **enlace del repartidor** y se lo envía.
4. **Repartidor** abre el enlace, acepta, comparte GPS → `EN_LOCAL` → `EN_CAMINO` → `LLEGO` → `ENTREGADO`.
5. El efectivo cobrado se **adelanta/concilia en caja**; el pago queda `PAGADO`.
6. Todo el recorrido queda en **auditoría** y en el resumen de repartidores del turno.

### 9.2 Pedido web con pago QR/Tarjeta

1. **Cliente** paga con QR/Tarjeta → pedido `PENDIENTE`, pago `PAGADO` (provisional).
2. Se prepara y despacha/recoge según el tipo de entrega.
3. No hay cobro pendiente; solo se completa el cumplimiento hasta `ENTREGADO`.

### 9.3 Recojo en local (pickup)

1. **Cliente** pide con **recojo** y **efectivo** → pago `PENDIENTE`, con código.
2. Se prepara → `LISTO`.
3. En el mostrador, el **cajero** busca el pedido por su **código** (`/caja/pedidos`), lo verifica y usa **Entregar** → cobra en efectivo, pago `PAGADO`, estado `ENTREGADO`. Impacta la caja del turno.

### 9.4 Venta presencial en mostrador

1. **Cajero** (con caja abierta) abre **Venta** (`/caja/venta`), agrega productos.
2. Identifica al cliente (o anónimo). Si tiene privilegio, se aplica el descuento.
3. Elige **normal / cortesía / fiado** y método de pago.
4. Confirma → stock descontado, dinero a caja (si normal), y registro en auditoría.

### 9.5 Venta fiada y su posterior cobro

1. **Cajero** hace una **venta fiada** a un **cliente registrado** → producto entregado, se crea **Cuenta por Cobrar**; no entra dinero a caja.
2. Días después, el cliente paga: el cajero va a **Deudores** (`/caja/deudores`), cobra total o parcial → la deuda se marca `PARCIAL`/`PAGADA` y el dinero **ingresa al turno**.
3. Alternativamente, **Admin** gestiona el cobro desde **Cuentas por Cobrar** (`/admin/cuentas-cobrar`).

---

## 10. Reglas de negocio que debes conocer

Estas reglas están implementadas en el sistema y explican comportamientos que a veces sorprenden:

1. **Cumplimiento y pago son independientes.** Un pedido puede estar `ENTREGADO` con pago `PENDIENTE` (fiado), o `PENDIENTE` con pago `PAGADO` (pago online anticipado).
2. **El stock se descuenta automáticamente** al pasar a `EN_PREPARACION`, `LISTO` o `ENTREGADO`, y en las ventas de mostrador. El descuento es **idempotente**: aunque el pedido pase por varios de esos estados, **nunca descuenta dos veces**.
3. **El total se calcula en el servidor.** Los precios y descuentos se recalculan con datos reales; no se confía en lo que envía el navegador. Esto previene manipulación de precios.
4. **Casi todo movimiento de dinero exige caja abierta.** Ventas en efectivo, cobros de pickup, adelantos de repartidor, ingresos, gastos y cobro de fiados requieren un turno abierto.
5. **Solo un turno abierto por sucursal.** No se puede abrir un turno si ya hay uno abierto.
6. **Un fiado exige cliente registrado** y no puede ser cortesía ni anónimo (para poder cobrarlo después).
7. **Los privilegios aplican el mayor porcentaje activo** del cliente, automáticamente.
8. **El bloqueo por stock protege la cocina:** la tienda rechaza pedidos que superen lo que el inventario puede producir.
9. **La caja nunca "sobra" falsamente:** si el efectivo esperado quedó negativo por gastos, la diferencia se trata como deuda, no como sobrante.
10. **Todo queda auditado.** Aperturas/cierres de caja, cambios de estado, ventas, cobros, altas/bajas: la bitácora es append-only y guarda IP y navegador.

---

## 11. Preguntas frecuentes y resolución de problemas

**No puedo registrar una venta / ingreso / gasto: dice que abra caja.**
No tienes un turno abierto. Ve a **Apertura de caja** (`/caja/apertura`) y declara el efectivo y QR iniciales.

**Quiero abrir caja pero no me deja.**
Ya existe un turno abierto en la sucursal. Debe cerrarse el turno actual antes de abrir otro.

**El cliente dice que su producto "se agotó" al comprar.**
El sistema bloqueó el pedido porque el inventario (insumos/recetas) no alcanza para esa cantidad. Repón stock (Compra en Inventario) o ajusta la disponibilidad del producto.

**Un pedido aparece ENTREGADO pero como no pagado.**
Es un **fiado** (pago `PENDIENTE`) o un delivery COD aún no conciliado. Gestiónalo en **Deudores** (cajero) o **Cuentas por Cobrar** (admin).

**No aparece el enlace para el repartidor.**
Genera el `driver_link_id` desde **Pedidos** (`/admin/orders`) y compártelo con el repartidor.

**El mapa del repartidor no se mueve.**
El repartidor debe **aceptar la asignación** y **conceder permiso de ubicación** en su teléfono. Sin GPS activo no se actualiza la posición.

**No puedo iniciar sesión aunque la contraseña es correcta.**
Puede que tu usuario esté **inactivo**. Pide a un Administrador que lo reactive en **Usuarios**.

**El cuadre de caja no cierra (hay diferencia).**
Revisa el **libro del turno** (Movimientos) y el resumen de repartidores. Diferencias pueden venir de gastos no registrados, cobros de fiado, o efectivo de delivery no adelantado.

**¿Cuál es la diferencia entre Dueño y Administrador?**
En permisos del back office, ninguna: ambos pueden todo. La distinción es jerárquica; usa la cuenta de Dueño para el propietario.

---

## Apéndice A — Diccionario de estados

### Estado del pedido (`estado`)
`PENDIENTE` · `EN_PREPARACION` · `LISTO` · `EN_LOCAL` · `EN_CAMINO` · `LLEGO` · `ENTREGADO` · `PAGADO` · `CANCELADO`

### Estado de pago (`payment_status`)
`PENDIENTE` · `PAGADO` · `COD_PENDIENTE` · `REEMBOLSADO`

### Canal de venta
`WEB` · `PICKUP` · `SALON`

### Tipo de entrega
`RECOJO` · `DELIVERY`

### Método de pago / cuenta
`EFECTIVO` · `QR` · `TARJETA` · `BANCO`

### Estado de turno de caja
`ABIERTO` · `CERRADO`

### Tipo de movimiento de caja
`VENTA` · `INGRESO_EXTRA` · `GASTO_OPERATIVO` · `COMPRA_INSUMO` · `AJUSTE` · `RETIRO`

### Movimiento interno de inventario
`INGRESO` · `EGRESO` · `PRODUCCION` · `VENTA` · `MERMA` · `AJUSTE`

### Estado de cuenta por cobrar/pagar
`PENDIENTE` · `PARCIAL` · `PAGADA`

### Tipo de producto
`ELABORADO` · `REVENTA`

### Estado de publicación de producto
`BORRADOR` · `PUBLICADO` · `ARCHIVADO`

### Roles
`DUENO` · `ADMIN` · `CAJERO` · `CLIENTE` (+ Repartidor por enlace)

---

*Fin de la guía. Este documento describe el comportamiento del sistema Elevate tal como está implementado. Ante cualquier cambio funcional, actualízalo para mantenerlo como fuente de verdad para el usuario final.*
