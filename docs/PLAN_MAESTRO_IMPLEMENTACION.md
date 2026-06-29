# PLAN MAESTRO DE IMPLEMENTACIÓN — Elevate

> Documento padre. Consolida el diagnóstico del sistema actual, el análisis de las
> imágenes de referencia (`imagesExtra/*` → "Paladar Gestión"), los módulos
> detectados, su priorización y el roadmap. Los detalles viven en documentos hijos
> (ver §8).
>
> **Modo de trabajo:** planning. La ejecución se delega vía `action.md` (una tanda a
> la vez). Este plan NO implementa código; define el QUÉ y el CÓMO.

---

## 1. Resumen general

Elevate es una plataforma tipo **PedidosYa con tienda física**: combina venta online
(catálogo, pedidos, delivery con rastreo) y **operación presencial mediante caja**
(POS). El objetivo de este plan es llevar el sistema a un ERP gastronómico completo
con tres roles bien separados:

- **Administrador / Dueño:** control total, métricas, auditoría, configuración.
- **Cajero / Contador:** apartado propio y restringido, centrado en el ciclo de caja.
- **Cliente:** flujo de pedidos online (se mantiene como está).

El stack se conserva: **Next.js 16 (App Router) + React 19 + Prisma 7 + PostgreSQL +
Tailwind v4 + PrimeReact + Framer Motion + Recharts + Leaflet**.

### Principios rectores
- **No duplicar** lo ya existente; mejorar incrementalmente.
- **Separación por rol** con layouts y autorización server-side.
- **Trazabilidad total** (auditoría de toda acción sensible).
- **Integridad transaccional** en caja y ventas (operaciones atómicas).
- SOLID, modularidad, migraciones ordenadas, tests, documentación.

---

## 2. Diagnóstico del sistema actual

### 2.1 Lo que YA existe (no rehacer)

| Área | Estado | Nota |
|------|--------|------|
| Auth JWT custom (`lib/auth.ts`) | ✅ funcional (tras fix env) | Base sobre la que montar RBAC |
| Tienda pública + menús por marca | ✅ sólido | Mejor que la referencia; **conservar** |
| Pedidos online + estados | ✅ | Falta canal (web/pickup/salón) y descuento de stock |
| Deliverys + mapa Leaflet | ✅ | Mejor que la referencia; **conservar**. Falta GPS real |
| Inventario (Insumo, mixtos, recetas) | ⚠️ básico | Ampliar (umbrales, proveedor, movimientos) — ver `MODULO_INVENTARIO.md` |
| Caja / Gasto (schema + API) | ⚠️ parcial | Existe modelo simple; falta turnos, métodos de pago, UI |
| Configuración (sucursal) | ⚠️ singleton | Generalizar a multi-sucursal |
| Promociones / Reglas horarias | ✅ | Extra de Elevate; **conservar** |

### 2.2 Lo que FALTA (núcleo de este plan)

- **RBAC real** (roles Dueño/Admin/Cajero/Cliente) con protección por rol.
- **Módulo de Caja con turnos** (apertura/cierre, esperado vs real, diferencias).
- **Apartado independiente de Cajero/Contador**.
- **Finanzas:** Contabilidad (Estado de Resultados + Balance), Flujo de Caja,
  Cuentas (Efectivo/QR + arqueo), Ingresos Extra, Gastos Operativos, Gastos Fijos.
- **Administración:** Activos Fijos, Cuentas por Cobrar, Cuentas por Pagar,
  gestión de Usuarios, **Auditoría**.
- **Métodos de pago** (Efectivo / QR / Tarjeta) y concepto de **cortesías**.

---

## 3. Análisis de las imágenes extra (`imagesExtra/*`)

Las 19 capturas corresponden al sistema de referencia **"Paladar Gestión"**
(`paladar-app.vercel.app`). Sirven como **referencia funcional**, no como diseño a
copiar (Elevate ya tiene su propio design system "Fresh Ops").

### 3.1 Clasificación por rol

| Pantalla (ref.) | Módulo | Rol principal | Veredicto |
|-----------------|--------|---------------|-----------|
| Resumen | Dashboard | Admin | Mejorar el actual (agregar KPIs) |
| Pedidos | Pedidos | Admin/Cajero | Ya existe; agregar "Nuevo pedido" presencial + Excel |
| Inventario | Inventario | Admin | Ampliar (ver `MODULO_INVENTARIO.md`) |
| Recetas | Recetas | Admin | Ya cubierto por RecetasProducto; falta UI ficha técnica |
| Insumos Mixtos | Inventario | Admin | Ya existe (es_mixto); falta UI |
| Clientes | Clientes | Admin | **Agregar** (vista admin con métricas) |
| Contabilidad | Finanzas | Admin/Contador | **Agregar** (Estado Resultados + Balance) |
| Flujo de Caja | Finanzas | Admin/Contador | **Agregar** |
| Cuentas | Finanzas | Admin/Cajero | **Agregar** (Efectivo/QR, arqueo, ajuste) |
| **Caja (turnos)** | Caja | **Cajero** | **Agregar** (núcleo del módulo cajero) |
| Ingresos Extra | Finanzas | Cajero/Admin | **Agregar** |
| Gastos Operativos | Finanzas | Cajero/Admin | **Agregar** |
| Gastos Fijos | Finanzas | Admin | **Agregar** |
| Activos Fijos | Administración | Admin | **Agregar** |
| Cuentas por Cobrar | Administración | Admin | **Agregar** |
| Cuentas por Pagar | Administración | Admin | **Agregar** |
| Usuarios | Administración | Admin/Dueño | **Agregar** (gestión + roles) |
| Auditoría | Administración | Admin/Dueño | **Agregar** (transversal, alta prioridad) |

### 3.2 Solo referencia visual (no copiar)
- Colores/branding "Paladar" (rojo/negro). Elevate mantiene su paleta "Fresh Ops".
- El logout del footer con avatar de usuario y rol → **adoptar el patrón** (mostrar
  rol), pero con la implementación de Elevate que ya funciona.

### 3.3 Mejoras UX/UI detectadas (adoptar)
- Sidebar agrupado por secciones (OPERACIÓN / CLIENTES / FINANZAS / ADMINISTRACIÓN).
- Filtros temporales consistentes (Hoy / 7 días / Este mes / Rango) en finanzas.
- Tarjetas KPI con una métrica destacada en negro.
- Export a Excel en listados.
- Estados vacíos explicativos ("No hay … todavía").
- Badges de estado y diferencias de caja en color (verde "Cuadra exacto" / rojo
  "faltante").

---

## 4. Lista de módulos detectados

| # | Módulo | Rol | Doc detalle |
|---|--------|-----|-------------|
| M1 | RBAC y Usuarios | Admin/Dueño | `SEGURIDAD_Y_AUDITORIA.md`, `MODULO_ADMINISTRADOR.md` |
| M2 | Auditoría | Admin/Dueño | `SEGURIDAD_Y_AUDITORIA.md` |
| M3 | Caja con turnos | Cajero | `MODULO_CAJERO_CONTADOR.md` |
| M4 | Cuentas (Efectivo/QR, arqueo) | Cajero/Admin | `MODULO_CAJERO_CONTADOR.md` |
| M5 | Ingresos Extra / Gastos Operativos | Cajero/Admin | `MODULO_CAJERO_CONTADOR.md` |
| M6 | Ventas físicas (POS) | Cajero | `MODULO_CAJERO_CONTADOR.md` |
| M7 | Contabilidad (ER + Balance) | Admin/Contador | `MODULO_ADMINISTRADOR.md` |
| M8 | Flujo de Caja | Admin/Contador | `MODULO_ADMINISTRADOR.md` |
| M9 | Gastos Fijos | Admin | `MODULO_ADMINISTRADOR.md` |
| M10 | Activos Fijos | Admin | `MODULO_ADMINISTRADOR.md` |
| M11 | Cuentas por Cobrar/Pagar | Admin | `MODULO_ADMINISTRADOR.md` |
| M12 | Clientes (vista admin) | Admin | `MODULO_ADMINISTRADOR.md` |
| M13 | Inventario avanzado | Admin | `MODULO_INVENTARIO.md` |
| M14 | Dashboard ejecutivo | Admin | `MODULO_ADMINISTRADOR.md` |

---

## 5. Priorización (resumen — detalle en `ROADMAP_PRIORIZADO.md`)

| Prioridad | Módulos | Razón |
|-----------|---------|-------|
| **P0 — Fundacional** | M1 RBAC, M2 Auditoría, esquema base, multi-sucursal | Todo lo demás depende de roles + trazabilidad |
| **P1 — Operación caja** | M3 Caja turnos, M4 Cuentas, M6 Ventas físicas, M5 Ingresos/Gastos | Habilita la operación presencial real |
| **P2 — Finanzas admin** | M7 Contabilidad, M8 Flujo, M9 Gastos fijos, M14 Dashboard | Visión financiera del dueño |
| **P3 — Administración** | M10 Activos, M11 Cuentas C/P, M12 Clientes | Completar gestión |
| **P4 — Inventario avanzado** | M13 | Profundizar (ver MODULO_INVENTARIO) |

---

## 6. Roadmap general (alto nivel)

```
Fase 0  Fundacional: schema base + RBAC + Sucursal + Auditoría        [P0]
Fase 1  Backend caja/finanzas (turnos, movimientos, cuentas)          [P1]
Fase 2  Front Cajero (apartado independiente) + POS                   [P1]
Fase 3  Front Admin Finanzas (contabilidad, flujo, dashboard)         [P2]
Fase 4  Administración (activos, cuentas C/P, clientes, usuarios UI)  [P3]
Fase 5  Inventario avanzado (MODULO_INVENTARIO)                       [P4]
Fase 6  Integraciones + hardening + deploy                            [—]
```

El detalle por fase, dependencias, riesgos y criterios de aceptación está en
`ROADMAP_PRIORIZADO.md`.

---

## 7. Decisiones de arquitectura (las grandes)

1. **RBAC en `Usuario.rol` (enum)** + autorización server-side en cada API (no solo
   en el cliente). Roles: `DUENO`, `ADMIN`, `CAJERO`, `CLIENTE`.
2. **Apartado del cajero bajo `/caja/*`** (layout propio), separado de `/admin/*`.
   Middleware/Guard valida el rol antes de renderizar.
3. **Caja por turnos** (`CajaTurno`) como agregado transaccional; todo movimiento de
   dinero cuelga de un turno y/o de una cuenta financiera (Efectivo/QR).
4. **Auditoría transversal** vía servicio + tabla `RegistroAuditoria`; se invoca en
   toda mutación sensible (caja, ventas, usuarios, precios, stock).
5. **Multi-sucursal** generalizando `Configuracion` → `Sucursal`.
6. **Dinero en enteros (centavos)** o `Decimal` de Prisma para evitar errores de
   coma flotante en montos (ver `BASE_DE_DATOS.md` §consideraciones).
7. **Métodos de pago** como enum (`EFECTIVO`, `QR`, `TARJETA`) en ventas y movimientos.

---

## 8. Documentos hijos

| Documento | Contenido |
|-----------|-----------|
| `MODULO_ADMINISTRADOR.md` | Detalle del rol admin: qué ve/hace sobre cajeros, caja, ventas, productos, clientes, reportes, auditoría, config. |
| `MODULO_CAJERO_CONTADOR.md` | Apartado del cajero: apertura, ventas físicas, movimientos, cierre, arqueo, reportes, restricciones. |
| `BASE_DE_DATOS.md` | Modelo de datos: tablas nuevas, cambios, relaciones, índices, restricciones, migraciones, transaccionalidad. |
| `BACKEND_IMPLEMENTACION.md` | Arquitectura backend: capas, endpoints, DTOs, validaciones, middleware, autorización, errores, auditoría, tests. |
| `FRONTEND_IMPLEMENTACION.md` | Arquitectura frontend: rutas, layouts por rol, componentes, pantallas, formularios, UX, responsive. |
| `SEGURIDAD_Y_AUDITORIA.md` | Riesgos, controles, roles/permisos, logs, auditoría, reglas para operaciones críticas. |
| `ROADMAP_PRIORIZADO.md` | Fases, orden, dependencias, riesgos, criterios de aceptación. |
| `MODULO_INVENTARIO.md` | Sub-plan de paridad de inventario/productos con el zip original. |

---

## 9. Criterios de aceptación globales

- [ ] Un usuario `CAJERO` NO puede acceder a `/admin/*` ni a endpoints de admin.
- [ ] Un usuario `CLIENTE` solo accede a la tienda y su flujo de pedidos.
- [ ] Toda operación de caja queda registrada en auditoría con usuario, fecha y monto.
- [ ] El cierre de caja calcula esperado vs real y persiste la diferencia.
- [ ] Ningún monto se corrompe por coma flotante (tests de redondeo).
- [ ] Las APIs validan rol en el servidor, no solo en el cliente.
- [ ] Migraciones reproducibles; seed de roles y sucursal por defecto.
