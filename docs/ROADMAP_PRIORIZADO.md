# ROADMAP PRIORIZADO

> Fases de implementación, orden recomendado, dependencias, riesgos y criterios de
> aceptación. Cada fase se ejecuta en una o más tandas de `action.md`. Marca el
> progreso aquí.

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
- [ ] Migración RBAC (`Rol` enum, `Usuario.rol/username/activo/sucursal_id`,
      data-migration de roles actuales).
- [ ] `Sucursal` + seed (migrar datos de `Configuracion`).
- [ ] `RegistroAuditoria` + `audit.service`.
- [ ] Capa `requireAuth` / `requireRole` + redirección por rol post-login.
- [ ] (Recomendado) Extensiones de inventario/producto de `MODULO_INVENTARIO.md` (sub-fase 5.0).

Dependencias: ninguna (primero).
Riesgos: data-migration de `rol` string→enum; usuarios existentes sin rol válido.
Criterios: login enruta por rol; cajero bloqueado de `/admin`; auditoría registra login.

---

## Fase 1 — Backend de caja y finanzas (P1)
**Objetivo:** lógica transaccional de caja lista (sin UI todavía).

Tareas:
- [ ] `CuentaFinanciera`, `CajaTurno`, `MovimientoCaja` + enums (migración).
- [ ] Extender `Transaccion` (canal, metodo_pago, turno, cajero, cortesía).
- [ ] Services: apertura, venta física (atómica), ingreso/gasto, cierre (esperado vs
      real), historial. Auditoría en cada uno.
- [ ] Endpoints `/api/caja/*` con autorización + ownership.
- [ ] Tests de services (cálculo esperado, diferencias, rollback).

Dependencias: Fase 0.
Riesgos: atomicidad y doble cierre; redondeo de dinero.
Criterios: venta descuenta stock + suma a caja atómicamente; cierre persiste
diferencia; todo auditado; un CAJERO no opera fuera de su turno/sucursal.

---

## Fase 2 — Frontend del Cajero (P1)
**Objetivo:** apartado independiente `/caja/*` funcional (POS).

Tareas:
- [ ] `CajaLayout` + guard rol CAJERO + sidebar reducido + footer con rol.
- [ ] Pantallas: dashboard, apertura, venta (POS), movimientos, ingreso, gasto,
      cierre (con diferencia en vivo), historial.
- [ ] Componentes: `KpiCard`, `MoneyText`, `MethodPill`, `StatusBadge`, `EmptyState`.
- [ ] Reporte de cierre (PDF/printable) — envío en modo demo.

Dependencias: Fase 1.
Riesgos: UX de POS en tablet; doble submit.
Criterios: ciclo completo apertura→venta→cierre desde la UI; bloqueo doble submit.

---

## Fase 3 — Finanzas del Administrador (P2)
**Objetivo:** visión financiera para el dueño.

Tareas:
- [ ] Contabilidad (Estado de Resultados + Balance) backend + UI.
- [ ] Flujo de Caja (por método y categoría) backend + UI.
- [ ] Caja consolidada (todos los turnos) UI admin.
- [ ] Gastos Fijos CRUD + cálculo equivalente diario/mensual.
- [ ] Dashboard ejecutivo enriquecido.

Dependencias: Fases 1–2 (datos de caja).
Riesgos: exactitud contable (cortesías, CMV).
Criterios: ER cuadra (Ingresos − CMV − Gastos = Utilidad); cortesías excluidas.

---

## Fase 4 — Administración general (P3)
**Objetivo:** completar gestión.

Tareas:
- [ ] Activos Fijos CRUD + valor por categoría + depreciación.
- [ ] Cuentas por Cobrar / Pagar CRUD + pagos parciales + estados.
- [ ] Clientes (vista admin con métricas).
- [ ] Usuarios (UI de gestión + roles) — solo DUENO para roles altos.
- [ ] Auditoría (UI con filtros).

Dependencias: Fase 0.
Riesgos: permisos de gestión de usuarios.
Criterios: solo DUENO gestiona ADMIN/DUENO; pagos actualizan estado correctamente.

---

## Fase 5 — Inventario avanzado (P4)
**Objetivo:** profundizar inventario/recetas. Ver `MODULO_INVENTARIO.md`.

Tareas:
- [ ] Movimientos (compra con costo promedio, merma, conteo).
- [ ] Descuento automático de stock por receta al cambiar estado de pedido.
- [ ] Inventario completo (sub-recetas, cobertura, porciones armables, alertas).
- [ ] Analítica & Finanzas (food cost, ingeniería de menú).

Dependencias: Fase 0 (schema inventario).
Criterios: stock se descuenta en cascada; food cost y márgenes correctos.

---

## Fase 6 — Integraciones y cierre (P5)
**Objetivo:** dejar listo para producción.

Tareas:
- [ ] Alertas WhatsApp (demo → real).
- [ ] GPS real de repartidores.
- [ ] Promos/reglas horarias aplicadas en tienda.
- [ ] Quitar `@auth0/nextjs-auth0`; `npm run build` verde.
- [ ] Rate limiting + hardening de seguridad.
- [ ] Deploy: Postgres en la nube (Neon) + Vercel + envs + verificación.

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
- **Alcance amplio:** ejecutar por tandas pequeñas y verificables (`action.md`).

---

## Criterios de aceptación global (Definition of Done del programa)
- [ ] Tres apartados por rol funcionando y aislados (cliente / caja / admin).
- [ ] Ciclo de caja completo y auditado.
- [ ] Finanzas consistentes (ER, flujo, balance).
- [ ] Administración completa (activos, cuentas C/P, usuarios, auditoría).
- [ ] Inventario avanzado operativo.
- [ ] Seguridad: autorización server-side, montos a prueba de manipulación, auditoría
      inmutable.
- [ ] Desplegado en producción y verificado.
```
