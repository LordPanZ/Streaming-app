# Plan técnico — 001

Deriva de `spec.md` y `research.md`. Describe *cómo* se construye lo que la
especificación describe. No introduce requisitos nuevos.

## Pila

| Capa | Elección | Motivo |
|---|---|---|
| Escritorio | Electron 3x + electron-builder | ADR-001, FR-041 |
| Interfaz | React 18 + TypeScript, Vite | Ecosistema, compilación rápida |
| Núcleo | TypeScript puro sobre Node | Art. II, NFR-001 |
| Pruebas | Vitest | Mismo transpilador que Vite, sin configuración doble |
| Estilos | CSS con variables, sin framework | Control del tema oscuro, cero peso extra |
| Persistencia | JSON atómico + índices en memoria | ADR-005 |

## Estructura del código

```
src/
├── shared/            Tipos del contrato IPC. Importable desde las tres capas.
│   ├── types.ts
│   └── ipc.ts
├── core/              TypeScript puro. Sin Electron, sin React, sin DOM.
│   ├── domain/        Tipos de dominio y lógica pura
│   │   ├── types.ts
│   │   ├── platforms.ts      Catálogo de plataformas ES (FR-005)
│   │   ├── criteria.ts       Criterios por defecto (FR-022)
│   │   ├── scoring.ts        Nota personal e índice agregado (FR-015, FR-024)
│   │   ├── weeks.ts          Semanas ISO y ventanas (FR-004)
│   │   └── filters.ts        Filtrado y ordenación (FR-029, FR-030)
│   ├── providers/     Adaptadores de terceros
│   │   ├── http.ts           Cliente con reintentos, límite y lista blanca
│   │   ├── cache.ts          Caché con expiración (NFR-004)
│   │   ├── tmdb.ts           ADR-002
│   │   ├── omdb.ts           ADR-003
│   │   └── youtube.ts        ADR-004
│   ├── store/         Persistencia
│   │   ├── json-store.ts     Escritura atómica (FR-040)
│   │   ├── catalog.ts        Títulos + índices
│   │   ├── ratings.ts        Valoraciones
│   │   ├── runs.ts           Informes
│   │   └── settings.ts       Ajustes
│   ├── agent/         Tubería semanal (ADR-006)
│   │   ├── pipeline.ts
│   │   ├── stages/{discover,enrich,rate,trailer,persist}.ts
│   │   ├── scheduler.ts      Vencimiento persistido (ADR-007)
│   │   └── report.ts         Informe + saneado de claves (NFR-009)
│   └── config/
│       └── env.ts
├── main/              Proceso principal de Electron
│   ├── main.ts               Ciclo de vida, ventana segura (NFR-007)
│   ├── ipc.ts                Manejadores validados (NFR-008)
│   ├── secrets.ts            safeStorage (FR-035)
│   ├── container.ts          Composición de dependencias
│   └── paths.ts
├── preload/
│   └── preload.ts            contextBridge, superficie mínima
└── renderer/          React
    ├── App.tsx
    ├── views/{ThisWeek,Catalog,Watched,Settings}.tsx
    ├── components/…
    └── hooks/…
```

## Flujo de una ejecución del agente

```
scheduler.dueNow()
  └─► pipeline.run(trigger)
        ├─ 1 discover   TMDB /discover por plataforma y tipo, ventana de fechas
        ├─ 2 enrich     ficha + géneros + external_ids + proveedores por título
        ├─ 3 rate       OMDb por imdbId; TMDB vote_average como cuarta fuente
        ├─ 4 trailer    /videos es-ES → selección → oEmbed → liveness
        └─ 5 persist    upsert en catálogo, recálculo de índices
      ─► report.build() ─► runs.append() ─► evento IPC 'agent:progress'/'agent:done'
```

Cada etapa captura sus errores por título y los acumula como `RunIssue`. Ninguna
lanza hacia arriba salvo un fallo de configuración irrecuperable, que produce
`status: 'failed'`.

## Contrato IPC

Canales de invocación (renderizador → principal, con respuesta):

| Canal | Entrada | Salida |
|---|---|---|
| `catalog:query` | `CatalogQuery` | `CatalogPage` |
| `catalog:get` | `{ id }` | `TitleWithRating \| null` |
| `ratings:set-watched` | `{ titleId, watched, watchedAt?, platform? }` | `UserRating` |
| `ratings:set-scores` | `{ titleId, scores, notes? }` | `UserRating` |
| `ratings:stats` | — | `WatchedStats` |
| `agent:run` | `{ trigger: 'manual' }` | `AgentRunSummary` |
| `agent:status` | — | `AgentStatus` |
| `agent:runs` | `{ limit }` | `AgentRun[]` |
| `settings:get` / `settings:update` | — / `Partial<Settings>` | `Settings` |
| `secrets:set` / `secrets:status` / `secrets:verify` | claves | estado sin revelar |
| `data:export` / `data:import` / `data:wipe` | — | resultado |
| `shell:open-external` | `{ url }` | `{ opened: boolean }` |

Eventos (principal → renderizador): `agent:progress`, `agent:done`,
`catalog:changed`.

Todo manejador valida su entrada con un validador explícito antes de tocar el
dominio (NFR-008). `shell:open-external` solo abre `http:` y `https:`.

## Estrategia de pruebas

| Tipo | Ubicación | Qué cubre |
|---|---|---|
| Unitarias | `tests/unit/` | Dominio puro: cálculo de notas, semanas, filtros, selección de tráiler, criterios |
| De contrato | `tests/contract/` | Adaptadores contra capturas literales en `tests/fixtures/`, con `fetch` simulado |
| De integración | `tests/unit/pipeline.*` | La tubería completa con proveedores simulados, incluidos casos de fallo parcial |
| Arquitectura | `tests/unit/architecture.test.ts` | NFR-001: prohibido importar Electron/React/DOM desde `src/core` |
| Seguridad | `tests/unit/security.test.ts` | NFR-009: las claves no sobreviven a la serialización |

Ninguna prueba toca la red (NFR-002).

## Empaquetado

`electron-builder.yml` produce NSIS para Windows, DMG para macOS (x64 y arm64) y
AppImage + deb para Linux. El flujo `.github/workflows/release.yml` construye en
las tres plataformas al etiquetar una versión y adjunta los artefactos a la
publicación.

## Orden de construcción

1. Contratos y tipos compartidos.
2. Dominio puro con sus pruebas (nota personal, índice, semanas, filtros).
3. Almacén con escritura atómica.
4. Adaptadores de terceros con capturas y pruebas de contrato.
5. Tubería del agente y planificador.
6. Proceso principal, IPC y secretos.
7. Interfaz.
8. Empaquetado e integración continua.
