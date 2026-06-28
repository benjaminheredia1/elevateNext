<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Documentación del Proyecto: Elevate (Comida Saludable)

Este documento detalla el estado actual del desarrollo del proyecto **Elevate** (Next.js + Prisma + PostgreSQL) y las tareas pendientes/siguientes pasos para su finalización.

---

## 📋 Estado Actual del Proyecto

El proyecto ha sido migrado y desarrollado sobre un stack robusto en **Next.js 16 (App Router)** y **React 19**, integrando base de datos relacional y paneles interactivos animados.

### 1. Stack Tecnológico
- **Frontend/Framework**: Next.js 16, React 19, TypeScript.
- **Base de Datos**: PostgreSQL con Prisma ORM.
- **Estilos**: Tailwind CSS v4.
- **UI & Componentes**: PrimeReact y PrimeIcons.
- **Animaciones**: Framer Motion (para transiciones fluidas y micro-animaciones premium).
- **Mapas y Geolocalización**: Leaflet (para el rastreo de repartidores en tiempo real).
- **Gráficos**: Recharts (para estadísticas en el Dashboard).

---

### 2. Módulos Implementados

#### A. Base de Datos (`prisma/schema.prisma`)
La estructura de la base de datos está completamente definida y soporta:
- **Usuarios y Roles**: Autenticación para administradores y clientes (`Usuario` con roles).
- **Clientes y Transacciones**: Gestión de pedidos, coordenadas del cliente, estados de entrega y datos de facturación/contacto.
- **Catálogo**: Categorías y Productos con imágenes y disponibilidad.
- **Inventario e Insumos**: Gestión de insumos (simples y mixtos), stock mínimo, costo promedio y unidades de medida.
- **Recetas**: Relación de productos con sus insumos necesarios y cantidades.
- **Movimientos de Stock**: Historial de ingresos, egresos y producción de insumos.
- **Promociones y Reglas Horarias**: Descuentos aplicables de acuerdo a rangos de fechas y horas.
- **Caja y Gastos**: Control de apertura/cierre de caja, ingresos, egresos y gastos registrados.

#### B. Panel de Administración (`/admin`)
Un panel completo con sidebar responsivo y notificaciones en vivo (`useOrderPolling` y `useAlertasPolling`):
- **Dashboard**: Vista general con tarjetas de estadísticas rápidas (pedidos de hoy, ingresos, insumos críticos), gráfico de pedidos por hora y tabla de pedidos recientes.
- **Productos**: Listado y administración de productos disponibles en la tienda.
- **Pedidos**: Gestión del flujo de pedidos (Pendiente -> En Preparación -> En Camino -> Entregado/Cancelado/Pagado).
- **Deliverys (Rastreo)**: Mapa en tiempo real con Leaflet que muestra la ubicación de los repartidores asignados a pedidos en camino (`EN_CAMINO`).
- **Insumos**: Control de inventario con alertas visuales (crítico/advertencia) cuando el stock baja del nivel mínimo. Soporta insumos mixtos.
- **Categorías**: Clasificación del menú.
- **Horarios**: Gestión de reglas horarias para promociones.
- **Configuración**: Parámetros del sistema y ubicación de la sucursal.

#### C. Tienda / Cliente (`/`)
- Interfaz pública responsiva para los clientes con animaciones fluidas (Framer Motion).
- Flujo para armar el pedido y registrar datos de envío.

---

## 🚀 Tareas Pendientes y Siguientes Pasos (Lo que se debe hacer)

Para llevar el proyecto a un estado de producción y completitud del 100%, se deben desarrollar e integrar los siguientes puntos:

### 1. Integración de Descuento de Stock Automático (Recetas)
- **Objetivo**: Conectar el flujo de pedidos con el inventario.
- **Acción**: Cuando un pedido cambie a estado `EN_PREPARACION` o `ENTREGADO`, el sistema debe consultar las recetas (`RecetasProducto`) de los productos del pedido y restar automáticamente las cantidades correspondientes del stock de `Insumo`.
- **Registro**: Crear un registro en `MovimientoInterno` de tipo `PRODUCCION` para auditar la salida de insumos.

### 2. Vistas del Módulo de Caja y Gastos en el Frontend
- **Objetivo**: Permitir a los administradores gestionar el flujo financiero diario desde la UI.
- **Acción**: Ya existen las rutas API (`/api/caja`, `/api/gastos`, `/api/contabilidad`), pero falta diseñar e integrar las interfaces de usuario en el Panel de Administración para:
  - Abrir y cerrar caja (ingresando monto inicial y final).
  - Registrar gastos rápidos (egresos de caja).
  - Ver reportes de contabilidad sencillos.

### 3. Conexión Real del Rastreo de Repartidores (GPS)
- **Objetivo**: Reemplazar las coordenadas simuladas por coordenadas reales.
- **Acción**: 
  - Crear un endpoint o WebSocket para que el repartidor envíe su ubicación actual a través del `driver_link_id`.
  - Actualizar los campos `driver_lat` y `driver_lng` en la tabla `Transaccion`.
  - Asegurar que el mapa de `AdminDeliverys.tsx` refleje estos cambios en tiempo real sin recargar la página.

### 4. Unificación del Sistema de Autenticación
- **Objetivo**: Limpiar y consolidar el acceso de usuarios.
- **Acción**: Actualmente coexisten dependencias para `@auth0/nextjs-auth0` y un esquema personalizado de JWT con `bcryptjs`. Se debe decidir y unificar bajo un solo flujo (preferentemente el custom JWT/Prisma para control total de la base de datos local de usuarios).

### 5. Reglas Horarias y Promociones en la Tienda
- **Objetivo**: Aplicar los descuentos configurados de forma automática en la tienda pública.
- **Acción**: Modificar el endpoint de productos de la tienda para que verifique si el producto tiene promociones activas en la fecha y hora actual (usando `ReglasHorarias` y `PromocionesDescuentos`), aplicando el descuento al precio final mostrado al cliente.

### 6. Pruebas y Despliegue (Production Ready)
- **Objetivo**: Garantizar el rendimiento y la estabilidad.
- **Acción**:
  - Ejecutar `npm run build` y corregir cualquier advertencia o error de TypeScript/Eslint.
  - Configurar las variables de entorno en el servidor de producción (e.g., `DATABASE_URL` para PostgreSQL con pooling de conexiones como Supabase/Neon).
  - Optimizar la carga de imágenes en la tienda utilizando el componente `<Image />` de Next.js.

