# Matriz de trazabilidad — 001

Relaciona cada requisito con el código que lo satisface y con la prueba que lo
demuestra. Es el documento que hace exigible el Art. I.3 de la constitución.

**Cómo leerla.** «Automática» significa que existe al menos una prueba que falla
si el requisito deja de cumplirse. «Manual» significa que se verifica siguiendo
la lista del apartado 3: son requisitos de interfaz, y este proyecto no tiene
aún banco de pruebas de componentes (tarea pendiente T094). No se marca como
automático nada que no lo esté.

---

## 1. Requisitos funcionales

| Requisito | Implementación | Prueba | Cobertura |
|---|---|---|---|
| FR-001 Ejecución programada | `core/agent/scheduler.ts`, `main/main.ts` | `unit/scheduler.test.ts` | Automática |
| FR-002 Recuperar ejecuciones perdidas | `core/agent/scheduler.ts` (`dueReason`, `advanceSchedule`) | `unit/scheduler.test.ts` → «tres semanas vencidas producen una sola ejecución» | Automática |
| FR-003 Ejecución manual | `main/ipc.ts` (`agent:run`), `main/container.ts` (`runAgent`) | `unit/pipeline.test.ts` → «informa del progreso por etapas» | Automática |
| FR-004 Ventana temporal | `core/domain/weeks.ts` (`collectionWindow`) | `unit/weeks.test.ts`, `unit/pipeline.test.ts` | Automática |
| FR-005 Cobertura de plataformas | `core/domain/platforms.ts` | `unit/platforms.test.ts` → «cubre como mínimo las plataformas que exige la especificación» | Automática |
| FR-006 Resolución dinámica de identificadores | `core/domain/platforms.ts` (`resolvePlatforms`) | `unit/platforms.test.ts` → «usa el identificador del catálogo cuando difiere de la pista» | Automática |
| FR-007 Películas y series | `core/agent/stages/discover.ts` | `contract/tmdb.test.ts` → «usa first_air_date para las series» | Automática |
| FR-008 Informe de ejecución | `core/agent/report.ts`, `core/store/runs.ts` | `unit/pipeline.test.ts`, `unit/stores.test.ts`, `unit/security.test.ts` | Automática |
| FR-009 Continuidad ante fallos | `core/agent/stages/*`, `core/agent/pipeline.ts` | `unit/pipeline.test.ts` → bloque «degradación ante fallos» (7 casos) | Automática |
| FR-010 Modo desatendido | `scripts/agent-cli.ts`, `.github/workflows/weekly-agent.yml` | Comprobación de humo del ejecutor; comparte contenedor probado (ADR-011) | Parcial |
| FR-011 Ficha del título | `core/providers/tmdb.ts` (`mapTitle`), `core/store/catalog.ts` | `contract/tmdb.test.ts` → «traduce una película completa al dominio» | Automática |
| FR-012 Géneros | `core/providers/tmdb.ts` (`extractGenres`) | `contract/tmdb.test.ts` → «extractGenres nunca devuelve una lista vacía» | Automática |
| FR-013 Notas multi-fuente | `core/providers/omdb.ts`, `core/agent/stages/rate.ts` | `contract/omdb.test.ts` → «extrae las tres fuentes» | Automática |
| FR-014 Ausencia explícita de nota | `core/providers/omdb.ts`, `core/domain/scoring.ts` | `contract/omdb.test.ts` → «nunca convierte una ausencia en cero»; `unit/scoring.test.ts` | Automática |
| FR-015 Índice agregado | `core/domain/scoring.ts` (`aggregateCritic`) | `unit/scoring.test.ts` → bloque `aggregateCritic` (5 casos) | Automática |
| FR-016 Tráiler en castellano | `core/domain/trailer.ts` (`selectTrailer`) | `unit/trailer.test.ts` → «elige el teaser es-ES frente al tráiler en-US» | Automática |
| FR-017 Enlace vivo verificado | `core/providers/youtube.ts` | `contract/youtube.test.ts` → los tres estados de vitalidad | Automática |
| FR-018 Búsqueda de respaldo | `core/domain/trailer.ts` (`buildSearchFallbackUrl`) | `unit/trailer.test.ts`, `unit/pipeline.test.ts` | Automática |
| FR-019 Revalidación | `core/agent/stages/trailer.ts` | `unit/pipeline.test.ts` → «detecta que un tráiler guardado ha dejado de estar disponible» | Automática |
| FR-020 Apertura externa | `shared/validate.ts` (`parseExternalUrl`), `main/ipc.ts`, `main/main.ts` | `unit/validate.test.ts` → «rechaza cualquier otro esquema» | Automática |
| FR-021 Marcar como visto | `core/store/ratings.ts` (`setWatched`) | `unit/stores.test.ts` → «al desmarcar borra la fecha» | Automática |
| FR-022 Criterios cuantificables | `core/domain/criteria.ts` | `unit/criteria.test.ts` → «define los siete criterios de la especificación» | Automática |
| FR-023 Pesos configurables | `core/domain/scoring.ts` (`normalizedWeights`) | `unit/scoring.test.ts` → «los pesos 3-1-1 equivalen a 60 %, 20 % y 20 %» | Automática |
| FR-024 Nota personal ponderada | `core/domain/scoring.ts` (`personalScore`) | `unit/scoring.test.ts` → bloque `personalScore` (7 casos) | Automática |
| FR-025 Valoración parcial y notas | `core/store/ratings.ts` (`setScores`) | `unit/stores.test.ts` → «admite valoración parcial y la completa después» | Automática |
| FR-026 Criterios personalizados | `core/domain/criteria.ts` (`mergeCriteria`) | `unit/criteria.test.ts` → «no resucita un criterio que el usuario había desactivado» | Automática |
| FR-027 Comparación con la crítica | `core/domain/scoring.ts` (`personalVsCritic`) | `unit/scoring.test.ts`, `unit/catalog-service.test.ts` | Automática |
| FR-028 Vista «Esta semana» | `renderer/views/Browse.tsx`, `core/service/catalog-service.ts` | `unit/catalog-service.test.ts` → «`current` acota a la semana en curso» | Automática (lógica) + manual (presentación) |
| FR-029 Filtros | `core/domain/filters.ts`, `renderer/components/FilterBar.tsx` | `unit/filters.test.ts` → bloque `filterViews` (6 casos) | Automática (lógica) + manual (presentación) |
| FR-030 Ordenación | `core/domain/filters.ts` (`sortViews`) | `unit/filters.test.ts` → «manda los títulos sin nota al final en ambos sentidos» | Automática |
| FR-031 Búsqueda por texto | `core/domain/filters.ts` (`matchesText`) | `unit/filters.test.ts` → «ignora tildes y mayúsculas» | Automática |
| FR-032 Ficha de detalle | `renderer/components/TitleDetail.tsx` | Lista manual §3, punto 5 | Manual |
| FR-033 Vista «Mis vistas» | `core/store/ratings.ts` (`buildWatchedStats`), `renderer/views/Watched.tsx` | `unit/stores.test.ts` → «resume vistas, nota media y desglose por género» | Automática (lógica) + manual (presentación) |
| FR-034 Estado vacío guiado | `renderer/components/EmptyState.tsx`, `renderer/views/Browse.tsx` | Lista manual §3, punto 1 | Manual |
| FR-035 Configuración de claves | `main/secrets.ts` | `unit/security.test.ts` (no filtración); lista manual §3, punto 7 | Parcial |
| FR-036 Verificación de claves | `core/providers/tmdb.ts`, `core/providers/omdb.ts` (`verifyKey`) | `contract/tmdb.test.ts`, `contract/omdb.test.ts` → bloques `verifyKey` | Automática |
| FR-037 Exportación | `core/store/transfer.ts` (`buildExportBundle`) | `unit/transfer.test.ts`, `unit/security.test.ts` | Automática |
| FR-038 Importación | `core/store/transfer.ts` (`parseBundle`, `applyBundle`) | `unit/transfer.test.ts` → «respeta las valoraciones existentes» | Automática |
| FR-039 Borrado | `core/store/transfer.ts` (`wipeAll`) | `unit/transfer.test.ts` → bloque `wipeAll` | Automática |
| FR-040 Persistencia local atómica | `platform/node/node-storage.ts` (PC), `platform/capacitor/capacitor-storage.ts` (Android) | `unit/stores.test.ts` → «escribe de forma atómica»; `unit/capacitor-storage.test.ts` → «recupera la copia si el documento principal quedó a medio escribir» | Automática **en el PC**; en Android la garantía es menor y se declara en ADR-013 |
| FR-041 Aplicación descargable para PC | `electron-builder.yml`, `.github/workflows/release.yml` | AppImage de Linux construido y verificado en este entorno (104 MB, arranca limpio); instaladores de Windows, macOS y Linux construidos en integración continua | Construido, no instalado en Windows ni macOS |
| FR-042 Primer arranque sin claves | `renderer/views/Browse.tsx`, `core/app/app-service.ts` (`NO_API_KEY`) | Lista manual §3, punto 1 | Manual |
| FR-043 Aplicación para Android | `capacitor.config.ts`, `android/`, `.github/workflows/android.yml` | APK construido en integración continua tras pasar tipos, pruebas y la prueba de humo del renderizado | Construido; instalado en un móvil y corregido tras fallar allí (v1.0.1) |
| FR-044 · el puente en el móvil | `renderer/api.ts` | `unit/renderer-api.test.ts` (7 casos) y `scripts/smoke/main.cjs` | Automática |
| FR-044 Misma lógica en ambas plataformas | `core/app/app-service.ts`, `platform/capacitor/local-api.ts` | `unit/architecture.test.ts` (núcleo sin importaciones externas); el servicio es el único camino en las dos | Automática (estructura) |
| FR-045 Interfaz adaptada al móvil | `renderer/styles/global.css` (consultas de medios) | Medición del ancho del documento a 412 px y a 360 px, sin desbordamiento | Automática (medida) + manual |
| FR-046 Recopilación sin servicio en segundo plano | `core/app/app-service.ts` (`runIfDue`), `platform/capacitor/bootstrap.ts` | `unit/scheduler.test.ts` → «tres semanas vencidas producen una sola ejecución» | Automática |
| FR-047 Claves de API en Android | `platform/capacitor/capacitor-secrets.ts` | `unit/capacitor-storage.test.ts` → bloque `CapacitorSecretsVault` (5 casos) | Automática |
| FR-048 Reparto y dirección | `core/providers/tmdb.ts` (`extractCast`, `extractDirectors`) | `contract/tmdb.test.ts` → bloque «reparto y dirección» (6 casos) | Automática |
| FR-049 Enlace a la plataforma | `renderer/components/TitleDetail.tsx` | Lista manual §3, punto 5; solo se ofrece si la plataforma trae enlace | Manual |
| FR-050 Primer arranque guiado | `renderer/views/Onboarding.tsx`, `renderer/App.tsx` | Lista manual §3, punto 1 | Manual |
| FR-052 Reconocimiento de la clave | `core/domain/api-keys.ts`, `core/providers/tmdb.ts` | `unit/api-keys.test.ts` (9 casos) y `contract/tmdb.test.ts` → «explica la confusión entre la clave v3 y el testigo v4»; comprobado además en la aplicación en marcha | Automática |
| FR-051 Datos de ejemplo | `core/domain/sample-catalog.ts`, `core/agent/stages/persist.ts` | `unit/sample-catalog.test.ts` (14 casos) y `unit/pipeline.test.ts` → «la primera recopilación real retira los títulos de ejemplo» | Automática |

## 2. Requisitos no funcionales

| Requisito | Implementación | Prueba | Cobertura |
|---|---|---|---|
| NFR-001 Núcleo aislado | Estructura de `src/core` | `unit/architecture.test.ts` (4 casos, incluido «cero dependencias de terceros») | Automática |
| NFR-002 Pruebas sin red ni claves | `tests/helpers/fake-fetch.ts`, `tests/fixtures/` | Toda la batería. Confirmado en clon limpio por `checks.yml` en las máquinas de GitHub, y en los tres sistemas dentro de `release.yml` | Automática |
| NFR-003 Límite de tasa y espera exponencial | `core/providers/http.ts` | `contract/http.test.ts` → «la espera crece exponencialmente», «respeta Retry-After» | Automática |
| NFR-004 Caché con expiración | `core/providers/cache.ts` | `contract/http.test.ts` → bloque «caché» (5 casos) | Automática |
| NFR-005 Ejecución en menos de 10 min | Paralelismo de 4 por etapa (ADR-016), `append_to_response`, caché | Medición registrada en cada informe (`durationMs`) | Observada en ejecución |
| NFR-006 Interfaz fluida con 1 000 títulos | Índices en memoria de `core/store/catalog.ts` | `unit/stores.test.ts` → «estrecha por semana, plataforma y género usando los índices» | Automática (mecanismo) |
| NFR-007 Ventana aislada | `main/main.ts` (`webPreferences`) | Revisión de código; lista manual §3, punto 8 | Manual |
| NFR-008 Validación de entrada IPC | `shared/validate.ts` | `unit/validate.test.ts` (35 casos) | Automática |
| NFR-009 Claves fuera de logs y exportaciones | `core/providers/http.ts` (`sanitizeUrl`), `core/agent/report.ts` | `unit/security.test.ts` (11 casos) | Automática |
| NFR-010 Sin telemetría | Lista blanca de `core/providers/http.ts` | `contract/http.test.ts` → «rechaza cualquier otro anfitrión sin llegar a pedir nada» | Automática |
| NFR-011 Núcleo sin APIs de Node | `core/store/storage.ts`, `src/platform/` | `unit/architecture.test.ts` → «ningún archivo de src/core importa un módulo de Node» | Automática |
| NFR-012 Sin desbordamiento desde 360 px | `renderer/styles/global.css` | Medición de `scrollWidth` frente a `clientWidth` a 412 px y 360 px | Automática (medida) |
| NFR-013 La interfaz se monta y sobrevive sin precargador | `renderer/main.tsx`, `renderer/api.ts` | `npm run smoke`: carga el paquete compilado por HTTP sin precargador y comprueba que la aplicación sigue en pie tras los efectos | Automática |
| NFR-014 Paralelismo acotado sin cambiar el resultado | `core/agent/concurrency.ts`, etapas `enrich`/`rate`/`trailer`, `IssueBag` de `core/agent/report.ts` | `unit/concurrency.test.ts` (13 casos) y `unit/pipeline-concurrency.test.ts` → «informa de las incidencias en el orden del catálogo, no en el de respuesta» y «solapa peticiones de verdad, y sin pasarse del límite del cliente HTTP» | Automática |

## 3. Lista de verificación manual

Se recorre antes de publicar una versión. Cada punto cita el requisito que cubre.

1. **Primer arranque sin claves** (FR-034, FR-042, FR-050). Borrar el directorio
   de datos y abrir la aplicación: debe aparecer la guía de tres pasos, con el
   enlace a la página de TMDB, el campo para pegar la clave y el botón para
   cargar datos de ejemplo. «Actualizar ahora» sigue deshabilitado.
2. **Configurar las claves** (FR-035, FR-036). Introducir ambas claves, pulsar
   «Verificar» en cada una y comprobar que el resultado es afirmativo y que el
   campo no muestra la clave completa, solo los cuatro últimos caracteres.
3. **Primera recopilación** (FR-003). Pulsar «Actualizar ahora» y comprobar que
   la barra de progreso recorre las cinco etapas y que al terminar aparecen
   títulos en la vista de la semana.
4. **Tarjeta** (FR-012, FR-013, FR-016). Comprobar en varias tarjetas que se ven
   los géneros, las notas por fuente y el botón de tráiler.
5. **Ficha de detalle** (FR-032, FR-048, FR-049). Abrir un título: sinopsis,
   géneros, plataformas, reparto y dirección, las cuatro notas con su fuente, el
   índice agregado con su nivel de confianza, «Ver en <plataforma>» si la fuente
   da enlace, y el panel de valoración.
6. **Valoración** (FR-021 a FR-027). Puntuar tres criterios, dejar el resto sin
   puntuar y comprobar que la nota personal solo pondera los puntuados y que
   aparece la diferencia frente a la crítica. Reiniciar la aplicación y
   comprobar que la valoración persiste.
7. **Tráiler** (FR-017, FR-018, FR-020). Abrir un tráiler marcado como vivo:
   debe abrirse en el navegador del sistema, no dentro de la aplicación. Abrir
   uno sin tráiler en castellano: debe ofrecer la búsqueda de respaldo.
8. **Aislamiento de la ventana** (NFR-007). En la consola del renderizador,
   comprobar que `window.require`, `window.process` y `window.electron` son
   `undefined` y que solo existe `window.api`.
9. **Datos** (FR-037, FR-038, FR-039). Exportar, comprobar que el JSON no
   contiene ninguna clave de API, importar en un perfil limpio y comprobar que
   las valoraciones se conservan.

## 3 bis. Lo que esta matriz no vio venir

La versión 1.0.0 arrancaba en negro en Android. Las 356 pruebas pasaban, el APK
se construía y la matriz daba FR-043 por «construido». El fallo era que
`renderer/api.ts` capturaba `window.api` al cargar el módulo: en el PC el
precargador de Electron lo define antes, en Android lo define el arranque del
móvil después, así que quedaba `undefined` y el primer efecto tumbaba React.

Ninguna prueba lo cubría porque todas ejercitaban el núcleo, y el núcleo estaba
bien. Faltaba comprobar lo único que el usuario ve: que la interfaz aparezca.
De ahí salen `unit/renderer-api.test.ts` y la prueba de humo, y NFR-013.

Lección aplicada a la matriz: «construido» no es una cobertura, es un estado de
compilación. Las filas de FR-041 y FR-043 lo dicen así ahora.

El segundo caso apareció al preparar la primera recopilación de verdad. NFR-003
(«límite de concurrencia») figuraba como **automática**, y lo estaba: el cliente
HTTP tenía su semáforo de cuatro y una prueba que lo verificaba. Lo que nadie
comprobó es que ese límite **llegara a alcanzarse**. Las tres etapas que piden
una ficha por título iban de una en una, así que el semáforo estaba siempre
abierto: la prueba medía un mecanismo que en producción no se usaba.

La fila decía la verdad sobre el componente y mentía sobre el sistema. De ahí
sale NFR-014, que no mide el limitador sino la tubería entera, y cuya prueba
afirma justo lo que faltaba: que en una ejecución completa las peticiones se
solapan de verdad.

Lección aplicada a la matriz: probar que un mecanismo funciona no prueba que
alguien lo use. Cuando una fila cubre un límite, un caché o un reintento,
conviene que haya otra que lo ejercite de punta a punta.

## 4. Requisitos sin cobertura automática

Se declaran aquí para que consten, en lugar de darlos por probados:

| Requisito | Motivo | Tarea pendiente |
|---|---|---|
| FR-032, FR-034, FR-042 | Presentación de la interfaz; no hay banco de pruebas de componentes | T094 |
| FR-035 (persistencia cifrada) | `safeStorage` exige un proceso de Electron en ejecución | T095 |
| FR-041 | El empaquetado real solo se verifica al ejecutar `electron-builder` en cada sistema. Comprobado el AppImage de Linux; Windows y macOS solo en integración continua | T096 |
| FR-043 | El APK se instaló en un móvil y falló con pantalla negra; corregido y cubierto por prueba de humo, pero la versión corregida tampoco se ha instalado desde este entorno | T097 |
| FR-045 | Verificado midiendo el ancho del documento en un navegador emulando un móvil, no en un dispositivo real | T097 |
| NFR-005 | Depende de la red real y del tamaño del catálogo de cada semana | — |
| NFR-007 | Configuración de `BrowserWindow`; se verifica a mano (punto 8) | T094 |
