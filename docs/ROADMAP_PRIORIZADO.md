# ROADMAP PRIORIZADO

> Fases de implementación, orden recomendado, dependencias, riesgos y criterios de
> aceptación.
>
> **Estado (julio 2026):** las fases 0 a 4 están implementadas y en producción; las
> fases 5 y 6 están implementadas en su mayor parte (quedan pendientes puntuales
> marcados abajo). Este documento se conserva como registro del diseño y del orden
> en que se construyó el sistema.

---

## Leyenda de prioridad
- **P0** Fundacional (bloquea todo lo demás)
- **P1** Operación de caja (valor inmediato para tienda física)
- **P2** Finanzas del administrador
- **P3** Administración general
- **P4** Profundización de inventario
- **P5** Integraciones y cierre

---

## Fase 0 — Fundacional (P0)
**Objetivo:** base de datos y seguridad sobre las que todo se apoya.

Tareas:
- [x] Migración RBAC (`Rol` enum, `Usuario.rol/username/activo/sucursal_id`,
      data-migration de roles actuales).
- [x] `Sucursal` + seed (migrar datos de `Configuracion`).
- [x] `RegistroAuditoria` + `audit.service`.
- [x] Capa `requireAuth` / `requireRole` + redirección por rol post-login.
- [x] Extensiones de inventario/producto de `MODULO_INVENTARIO.md` (sub-fase 5.0).

Dependencias: ninguna (primero).
Riesgos: data-migration de `rol` string→enum; usuarios existentes sin rol válido.
Criterios: login enruta por rol; cajero bloqueado de `/admin`; auditoría registra login.

---

## Fase 1 — Backend de caja y finanzas (P1)
**Objetivo:** lógica transaccional de caja lista (sin UI todavía).

Tareas:
- [x] `CuentaFinanciera`, `CajaTurno`, `MovimientoCaja` + enums (migración).
- [x] Extender `Transaccion` (canal, metodo_pago, turno, cajero, cortesía).
- [x] Services: apertura, venta física (atómica), ingreso/gasto, cierre (esperado vs
      real), historial. Auditoría en cada uno.
- [x] Endpoints `/api/caja/*` con autorización + ownership.
- [x] Tests de services (cálculo esperado, diferencias, rollback).

Dependencias: Fase 0.
Riesgos: atomicidad y doble cierre; redondeo de dinero.
Criterios: venta descuenta stock + suma a caja atómicamente; cierre persiste
diferencia; todo auditado; un CAJERO no opera fuera de su turno/sucursal.

---

## Fase 2 — Frontend del Cajero (P1)
**Objetivo:** apartado independiente `/caja/*` funcional (POS).

Tareas:
- [x] `CajaLayout` + guard rol CAJERO + sidebar reducido + footer con rol.
- [x] Pantallas: dashboard, apertura, venta (POS), movimientos, ingreso, gasto,
      cierre (con diferencia en vivo), historial (más deudores, clientes, pedidos,
      entregar e insumos).
- [x] Componentes: `KpiCard`, `MoneyText`, `MethodPill`, `StatusBadge`, `EmptyState`.
- [x] Reporte de cierre (printable, `ReporteCierre.tsx`).

Dependencias: Fase 1.
Riesgos: UX de POS en tablet; doble submit.
Criterios: ciclo completo apertura→venta→cierre desde la UI; bloqueo doble submit.

---

## Fase 3 — Finanzas del Administrador (P2)
**Objetivo:** visión financiera para el dueño.

Tareas:
- [x] Contabilidad (Estado de Resultados + Balance) backend + UI.
- [x] Flujo de Caja (por método y categoría) backend + UI.
- [x] Caja consolidada (todos los turnos) UI admin.
- [x] Gastos Fijos CRUD + cálculo equivalente diario/mensual.
- [x] Dashboard ejecutivo enriquecido.

Dependencias: Fases 1–2 (datos de caja).
Riesgos: exactitud contable (cortesías, CMV).
Criterios: ER cuadra (Ingresos − CMV − Gastos = Utilidad); cortesías excluidas.

---

## Fase 4 — Administración general (P3)
**Objetivo:** completar gestión.

Tareas:
- [x] Activos Fijos CRUD + valor por categoría + depreciación.
- [x] Cuentas por Cobrar / Pagar CRUD + pagos parciales + estados.
- [x] Clientes (vista admin con métricas) + privilegios y venta al fiado.
- [x] Usuarios (UI de gestión + roles) — solo DUENO para roles altos.
- [x] Auditoría (UI con filtros).

Dependencias: Fase 0.
Riesgos: permisos de gestión de usuarios.
Criterios: solo DUENO gestiona ADMIN/DUENO; pagos actualizan estado correctamente.

---

## Fase 5 — Inventario avanzado (P4)
**Objetivo:** profundizar inventario/recetas. Ver `MODULO_INVENTARIO.md`.

Tareas:
- [x] Movimientos (compra con costo promedio, merma, conteo).
- [x] Descuento automático de stock por receta al cambiar estado de pedido.
- [x] Inventario completo (insumos mixtos/sub-recetas, alertas de stock crítico,
      unidades de medida con equivalencias, ciclo de vida baja/revisión/archivado).
- [x] Analítica & Finanzas (food cost, ingeniería de menú) — pantalla `admin/analitica`.

Dependencias: Fase 0 (schema inventario).
Criterios: stock se descuenta en cascada; food cost y márgenes correctos.

---

## Fase 6 — Integraciones y cierre (P5)
**Objetivo:** dejar listo para producción.

Tareas:
- [ ] Alertas WhatsApp — implementadas en modo simulado (`whatsapp.service.ts`);
      queda pendiente conectar un proveedor real de envío.
- [x] GPS real de repartidores (enlace por token `driver_link_id` + envío de ubicación).
- [x] Promos/reglas horarias aplicadas en tienda (`lib/server/productos/precio.ts`).
- [x] Quitar `@auth0/nextjs-auth0`; `npm run build` verde.
- [x] Rate limiting + hardening de seguridad.
- [x] Deploy: Vercel + PostgreSQL autoalojado (VPS con Dokploy) + envs + verificación.

Dependencias: todas.
Criterios: build verde; checklist de seguridad cumplido; smoke test en producción.

---

## Mapa de dependencias (resumen)
```
Fase 0 ──► Fase 1 ──► Fase 2 ──► Fase 3
   │                        └────► (consume datos de caja)
   ├──► Fase 4
   ├──► Fase 5
   └──────────────────────────────► Fase 6 (cierre, depende de todas)
```

---

## Riesgos transversales
- **Dinero en Float:** migrar a Decimal temprano (Fase 1) o asumir deuda técnica.
- **Data-migration de roles:** planificar valores por defecto y validación.
- **Doble operación de caja:** idempotencia desde el inicio.
- **Alcance amplio:** ejecutar por tandas pequeñas y verificables.

---

## Criterios de aceptación global (Definition of Done del programa)
- [x] Tres apartados por rol funcionando y aislados (cliente / caja / admin).
- [x] Ciclo de caja completo y auditado.
- [x] Finanzas consistentes (ER, flujo, balance).
- [x] Administración completa (activos, cuentas C/P, usuarios, auditoría).
- [x] Inventario avanzado operativo.
- [x] Seguridad: autorización server-side, montos a prueba de manipulación, auditoría
      inmutable.
- [x] Desplegado en producción y verificado.
