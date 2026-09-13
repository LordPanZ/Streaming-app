# Tareas — 001

Cada tarea nombra los requisitos que satisface y los artefactos que produce. Una
tarea está terminada cuando sus pruebas pasan y `traceability.md` la refleja.

Leyenda: `[x]` hecha · `[ ]` pendiente

## Fase 0 — Especificación

- [x] **T001** Constitución del proyecto → `.specify/memory/constitution.md`
- [x] **T002** Especificación funcional con FR/NFR y criterios → `spec.md`
- [x] **T003** Decisiones de arquitectura (ADR-001…011) → `research.md`
- [x] **T004** Modelo de datos e invariantes → `data-model.md`
- [x] **T005** Plan técnico y estructura de código → `plan.md`
- [x] **T006** Contratos de APIs externas e IPC → `contracts/`
- [x] **T007** Matriz de trazabilidad → `traceability.md`
- [x] **T008** Guía de arranque → `quickstart.md`

## Fase 1 — Andamiaje

- [x] **T010** `package.json`, `tsconfig`, Vite, Vitest, ESLint → raíz
- [x] **T011** Tipos compartidos del contrato IPC *(FR-029…FR-032)* → `src/shared/`

## Fase 2 — Dominio puro

- [x] **T020** Tipos de dominio *(modelo de datos)* → `core/domain/types.ts`
- [x] **T021** Catálogo de plataformas ES y normalización de nombres *(FR-005, FR-006)* → `core/domain/platforms.ts`
- [x] **T022** Criterios de valoración por defecto *(FR-022, FR-026)* → `core/domain/criteria.ts`
- [x] **T023** Nota personal ponderada e índice agregado *(FR-015, FR-023, FR-024, FR-027)* → `core/domain/scoring.ts`
- [x] **T024** Semanas ISO y ventanas temporales *(FR-004, FR-011)* → `core/domain/weeks.ts`
- [x] **T025** Filtrado, búsqueda y ordenación *(FR-029, FR-030, FR-031)* → `core/domain/filters.ts`
- [x] **T026** Selección de tráiler y respaldo *(FR-016, FR-018)* → `core/domain/trailer.ts`

## Fase 3 — Persistencia

- [x] **T030** Almacén JSON con escritura atómica *(FR-040)* → `core/store/json-store.ts`
- [x] **T031** Catálogo con índices en memoria *(FR-011, FR-012, NFR-006)* → `core/store/catalog.ts`
- [x] **T032** Valoraciones y estadísticas *(FR-021, FR-025, FR-033)* → `core/store/ratings.ts`
- [x] **T033** Ajustes con valores por defecto y migración *(FR-005, FR-023, FR-026)* → `core/store/settings.ts`
- [x] **T034** Historial de ejecuciones acotado *(FR-008)* → `core/store/runs.ts`
- [x] **T035** Exportación, importación y borrado *(FR-037, FR-038, FR-039)* → `core/store/transfer.ts`

## Fase 4 — Proveedores

- [x] **T040** Cliente HTTP: lista blanca, concurrencia, reintentos, saneado *(NFR-003, NFR-009, NFR-010)* → `core/providers/http.ts`
- [x] **T041** Caché con expiración *(NFR-004)* → `core/providers/cache.ts`
- [x] **T042** Adaptador TMDB *(FR-004…FR-007, FR-011, FR-012, FR-016)* → `core/providers/tmdb.ts`
- [x] **T043** Adaptador OMDb *(FR-013, FR-014)* → `core/providers/omdb.ts`
- [x] **T044** Verificador de YouTube *(FR-017)* → `core/providers/youtube.ts`

## Fase 5 — Agente

- [x] **T050** Etapa `discover` *(FR-004, FR-005, FR-007)* → `core/agent/stages/discover.ts`
- [x] **T051** Etapa `enrich` *(FR-011, FR-012)* → `core/agent/stages/enrich.ts`
- [x] **T052** Etapa `rate` *(FR-013, FR-014)* → `core/agent/stages/rate.ts`
- [x] **T053** Etapa `trailer` *(FR-016…FR-019)* → `core/agent/stages/trailer.ts`
- [x] **T054** Etapa `persist` *(FR-011)* → `core/agent/stages/persist.ts`
- [x] **T055** Tubería con degradación e informe *(FR-008, FR-009)* → `core/agent/pipeline.ts`, `report.ts`
- [x] **T056** Planificador por vencimiento persistido *(FR-001, FR-002)* → `core/agent/scheduler.ts`
- [x] **T057** Ejecutor desatendido de consola *(FR-010)* → `scripts/agent-cli.ts`

## Fase 6 — Escritorio

- [x] **T060** Proceso principal y ventana segura *(NFR-007)* → `src/main/main.ts`
- [x] **T061** Composición de dependencias *(ADR-011)* → `src/main/container.ts`
- [x] **T062** Manejadores IPC validados *(NFR-008, contrato IPC)* → `src/main/ipc.ts`
- [x] **T063** Claves cifradas con `safeStorage` *(FR-035, FR-036)* → `src/main/secrets.ts`
- [x] **T064** Puente `contextBridge` de superficie mínima *(Art. VI.2)* → `src/preload/preload.ts`
- [x] **T065** Integración del planificador en el ciclo de vida *(FR-001, FR-002, FR-003)* → `src/main/main.ts`

## Fase 7 — Interfaz

- [x] **T070** Estructura de la aplicación, tema y navegación *(FR-028)* → `renderer/App.tsx`
- [x] **T071** Barra de filtros, búsqueda y ordenación *(FR-029…FR-031)* → `renderer/components/FilterBar.tsx`
- [x] **T072** Tarjeta de título con notas, géneros y tráiler *(FR-012, FR-013, FR-016, FR-020)* → `renderer/components/TitleCard.tsx`
- [x] **T073** Ficha de detalle *(FR-032, FR-027)* → `renderer/components/TitleDetail.tsx`
- [x] **T074** Panel de valoración por criterios *(FR-021…FR-026)* → `renderer/components/RatingPanel.tsx`
- [x] **T075** Vista "Mis vistas" con estadísticas *(FR-033)* → `renderer/views/Watched.tsx`
- [x] **T076** Ajustes: claves, plataformas, calendario, criterios, datos *(FR-005, FR-023, FR-026, FR-035…FR-039)* → `renderer/views/Settings.tsx`
- [x] **T077** Estados vacíos guiados y avisos sin claves *(FR-034, FR-042)* → `renderer/components/EmptyState.tsx`

## Fase 8 — Verificación y distribución

- [x] **T080** Pruebas unitarias del dominio → `tests/unit/`
- [x] **T081** Pruebas de contrato con capturas → `tests/contract/`, `tests/fixtures/`
- [x] **T082** Prueba de arquitectura del núcleo aislado *(NFR-001)* → `tests/unit/architecture.test.ts`
- [x] **T083** Prueba de no filtración de claves *(NFR-009)* → `tests/unit/security.test.ts`
- [x] **T084** Empaquetado multiplataforma *(FR-041)* → `electron-builder.yml`
- [x] **T085** Integración continua: comprobaciones y publicación → `.github/workflows/`
- [x] **T086** Agente semanal desatendido en la nube *(FR-010)* → `.github/workflows/weekly-agent.yml`
- [x] **T087** Documentación de usuario → `README.md`

## Fase 9 — Android y PC con el mismo código

- [x] **T100** Almacenamiento tras una interfaz; el núcleo deja de usar `node:` *(NFR-011, ADR-013)* → `core/store/storage.ts`, `src/platform/`
- [x] **T101** Escritura atómica de Node y almacenamiento del contenedor de Android *(FR-040)* → `platform/node/`, `platform/capacitor/`
- [x] **T102** Servicio de aplicación común; el IPC pasa a ser un adaptador *(FR-044, ADR-012)* → `core/app/app-service.ts`
- [x] **T103** Implementación de `IpcApi` en el mismo proceso para el móvil *(FR-044)* → `platform/capacitor/local-api.ts`
- [x] **T104** Claves en almacenamiento privado de Android *(FR-047)* → `platform/capacitor/capacitor-secrets.ts`
- [x] **T105** Arranque del móvil, `fetch` nativo y ejecución al volver a primer plano *(FR-046, ADR-014, ADR-015)* → `platform/capacitor/bootstrap.ts`
- [x] **T106** Interfaz adaptada a pantallas estrechas *(FR-045, NFR-012)* → `renderer/styles/global.css`
- [x] **T107** Proyecto de Android y flujo que construye el APK *(FR-043)* → `capacitor.config.ts`, `android/`, `.github/workflows/android.yml`

## Fase 10 — Corrección de la pantalla negra en Android (v1.0.1)

- [x] **T110** Acceso diferido al puente en la interfaz *(FR-044)* → `renderer/api.ts`
- [x] **T111** Regresión del orden de carga del puente → `tests/unit/renderer-api.test.ts`
- [x] **T112** Prueba de humo del renderizado sin precargador *(NFR-013)* → `scripts/smoke/main.cjs`
- [x] **T113** La prueba de humo entra en los tres flujos de integración continua
- [x] **T114** `connect-src` de la política de contenido alineado con el inventario de ADR-010

## Fase 11 — Contenido (v1.1.0)

- [x] **T120** Reparto y dirección en la misma petición de la ficha *(FR-048)* → `core/providers/tmdb.ts`
- [x] **T121** Enlace «Ver en <plataforma>» cuando la fuente lo da *(FR-049)* → `renderer/components/TitleDetail.tsx`
- [x] **T122** Primer arranque guiado de tres pasos *(FR-050)* → `renderer/views/Onboarding.tsx`
- [x] **T123** Catálogo de ejemplo con marca visible y borrado automático *(FR-051)* → `core/domain/sample-catalog.ts`

## Fase 12 — Que la clave no sea un muro (v1.1.1)

- [x] **T130** Reconocer la clave v3 frente al testigo v4 *(FR-052)* → `core/domain/api-keys.ts`
- [x] **T131** Aviso mientras se escribe, en primer arranque y en ajustes *(FR-052)*
- [x] **T132** El 401 de TMDB explica la confusión en lugar de decir «no autorizado» *(FR-036, FR-052)*

## Fase 13 — Que la primera recopilación no se haga eterna (v1.2.0)

- [x] **T140** Ayudante de paralelismo acotado con orden de entrada garantizado *(NFR-014)* → `core/agent/concurrency.ts`
- [x] **T141** Bolsa de incidencias por trabajo para que el informe siga siendo reproducible *(NFR-014, Art. VII)* → `IssueBag` en `core/agent/report.ts`
- [x] **T142** Etapas `enrich`, `rate` y `trailer` de cuatro en cuatro *(ADR-016, NFR-005)*
- [x] **T143** Revalidación de tráileres: comprobación en paralelo, escrituras en orden *(FR-019)*
- [x] **T144** Prueba de tubería completa con latencias invertidas contra el recorrido secuencial *(NFR-014)* → `unit/pipeline-concurrency.test.ts`
- [x] **T145** La pantalla del agente avisa de lo que dura la primera recopilación y de no salirse de la aplicación en el móvil *(ADR-015)*
- [x] **T146** Etapas del agente nombradas en castellano en la barra de progreso y en el historial → `renderer/format.ts`
- [x] **T147** La versión de Android deja de derivar a mano: se sincroniza desde `package.json` *(FR-043)* → `scripts/sync-android-version.mjs`

## Fase 14 — Que se pueda actualizar y que el catálogo no sea un vertedero (v1.2.1)

- [x] **T150** Clave de firma fija y versionada: los APK pasan a ser actualizables *(FR-043, ADR-017)* → `android/estrenos-debug.keystore`
- [x] **T151** Listón de calidad guardado en los ajustes *(FR-053)* → `core/store/settings.ts`, `core/domain/filters.ts`
- [x] **T152** El listón se aplica a toda consulta que no traiga una nota mínima propia *(FR-053)* → `applyQualityFloor`
- [x] **T153** Los recuentos de la barra de filtros cuentan lo que se ve, no lo guardado *(FR-053)* → `buildFacets`
- [x] **T154** Aviso de cuántos títulos esconde el listón, con atajo para verlos *(FR-053)* → `renderer/views/Browse.tsx`
- [x] **T155** Decisión explícita sobre los títulos que nadie ha puntuado todavía *(FR-053, Art. IV.2)*

## Fase 15 — Lista de pendientes y buscador que busca (v1.3.0)

- [x] **T160** Campo `interested` en la valoración, con migración de lo ya guardado *(FR-054)* → `core/store/ratings.ts`
- [x] **T161** Invariante 8: marcar como vista (o puntuar) saca de pendientes *(FR-054)*
- [x] **T162** Botón «me interesa» en la tarjeta y en la ficha, y distintivo ★ en el póster *(FR-054)*
- [x] **T163** Filtro «solo las que me interesan» y atajo desde «Mis vistas» *(FR-054)*
- [x] **T164** El buscador mira género, plataforma, reparto, dirección, año y tipo *(FR-055)* → `searchHaystack`
- [x] **T165** Varias palabras cruzando campos: «netflix terror» *(FR-055)*

## Fase 16 — Sección propia y enlaces que llevan a algún sitio (v1.4.0)

- [x] **T170** Sección «Me interesa» en la navegación, con contador *(FR-057)* → `renderer/App.tsx`
- [x] **T171** El listón de calidad no esconde lo apuntado a mano *(FR-057, FR-053)* → `INTERESTED_QUERY`
- [x] **T172** Salir de la sección suelta su filtro, en vez de dejarlo pegado *(FR-057)*
- [x] **T173** Direcciones por plataforma, separadas del catálogo del dominio *(FR-056, ADR-018)* → `core/domain/platform-links.ts`
- [x] **T174** Etiqueta de plataforma clicable en la tarjeta *(FR-056)* → `renderer/components/PlatformBadge.tsx`
- [x] **T175** «Dónde verla»: un botón por plataforma y el de TMDB una sola vez, con su nombre *(FR-049, FR-056)*
- [x] **T176** Gancho único de estadísticas, compartido por «Mis vistas» y el contador *(FR-033)* → `renderer/hooks/useStats.ts`

## Pendiente (declarado, no dado por hecho)

Estas tareas están abiertas a propósito. `traceability.md` §4 explica qué
requisitos quedan sin cobertura automática por su culpa.

- [ ] **T090** Migración opcional del almacén a SQLite (ADR-005, vía de migración)
- [ ] **T091** Notificación del sistema al terminar la ejecución semanal
- [ ] **T092** Valoración por temporada en series
- [ ] **T093** Firma y notarización de los instaladores de macOS y Windows
- [ ] **T094** Banco de pruebas de componentes para la interfaz *(FR-032, FR-034, FR-042, NFR-007)*
- [ ] **T095** Prueba de integración de `safeStorage` con Electron en ejecución *(FR-035)*
- [ ] **T096** Verificación automática del empaquetado en las tres plataformas *(FR-041)*
- [ ] **T097** Comprobación del APK en un móvil Android real *(FR-043, FR-045)*
- [ ] **T098** Selector de archivos nativo para importar en Android *(FR-038)*
- [ ] **T099** Sincronización opcional entre el PC y el móvil
- [ ] **T100** Comprobar contra los servidores reales los buscadores de cada plataforma *(FR-056, ADR-018)*
