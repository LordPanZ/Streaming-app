# Modelo de datos — 001

Todas las entidades se persisten en JSON bajo el directorio de datos de la
aplicación. Cada colección es un archivo independiente para acotar el riesgo de
una escritura fallida.

```
<userData>/estrenos-es/
├── titles.json      Colección de títulos (catálogo)
├── ratings.json     Valoraciones personales del usuario
├── runs.json        Historial de ejecuciones del agente (últimas 50)
├── settings.json    Preferencias, plataformas activas, criterios y pesos
├── cache.json       Caché de respuestas de terceros con expiración
└── secrets.bin      Claves de API cifradas con el almacén del sistema
```

---

## Entidad `Title`

Un título de catálogo. Clave primaria `id`.

| Campo | Tipo | Nulo | Descripción | Requisito |
|---|---|---|---|---|
| `id` | `string` | no | Identificador estable `tmdb:movie:1234` / `tmdb:tv:5678` | FR-011 |
| `mediaType` | `'movie' \| 'series'` | no | Tipo de título | FR-007 |
| `title` | `string` | no | Título en castellano | FR-011 |
| `originalTitle` | `string` | no | Título original | FR-011, FR-031 |
| `year` | `number` | sí | Año de estreno original | FR-011 |
| `overview` | `string` | no | Sinopsis en castellano; cadena vacía si no hay | FR-011 |
| `posterUrl` | `string` | sí | URL absoluta del póster | FR-011 |
| `backdropUrl` | `string` | sí | URL absoluta de la imagen de fondo | FR-032 |
| `runtimeMinutes` | `number` | sí | Duración; solo películas | FR-011 |
| `seasons` | `number` | sí | Número de temporadas; solo series | FR-011 |
| `genres` | `string[]` | no | Géneros en castellano; `['Sin clasificar']` si no hay | FR-012 |
| `platforms` | `PlatformRef[]` | no | Plataformas en España donde está disponible | FR-005, FR-011 |
| `availableFrom` | `string` (ISO 8601, fecha) | no | Fecha de disponibilidad en España | FR-004, FR-011 |
| `releaseWeek` | `string` (`YYYY-Www`) | no | Semana ISO de estreno | FR-011, FR-028 |
| `imdbId` | `string` | sí | Identificador IMDb (`tt…`) | FR-013 |
| `ratings` | `CriticRatings` | no | Notas de crítica por fuente | FR-013 |
| `trailer` | `Trailer` | sí | Tráiler seleccionado | FR-016 |
| `cast` | `string[]` | no | Reparto principal, hasta seis nombres; vacío si la fuente no lo declara | FR-048 |
| `directors` | `string[]` | no | Dirección, o creación en el caso de las series | FR-048 |
| `sample` | `boolean` | sí | `true` solo en los títulos de ejemplo, para poder distinguirlos y borrarlos | FR-051 |
| `firstSeenAt` | `string` (ISO 8601) | no | Cuándo lo vio el agente por primera vez | FR-008 |
| `updatedAt` | `string` (ISO 8601) | no | Última actualización de la ficha | FR-008 |

### `PlatformRef`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador interno estable, p. ej. `netflix` |
| `name` | `string` | Nombre visible, p. ej. `Netflix` |
| `providerId` | `number` | Identificador del proveedor en TMDB resuelto en ejecución (FR-006) |
| `logoUrl` | `string \| null` | Logotipo |
| `link` | `string \| null` | Enlace a la ficha en la plataforma |

### `CriticRatings`

Un campo por fuente. **La ausencia se representa con `null`, nunca con `0`** (FR-014).

| Campo | Tipo | Escala | Fuente |
|---|---|---|---|
| `imdb` | `number \| null` | 0–10 | OMDb |
| `rottenTomatoes` | `number \| null` | 0–100 | OMDb (Tomatometer de crítica) |
| `metacritic` | `number \| null` | 0–100 | OMDb |
| `tmdb` | `number \| null` | 0–10 | TMDB |
| `imdbVotes` | `number \| null` | recuento | OMDb |
| `fetchedAt` | `string \| null` | ISO 8601 | — |

El **índice agregado** (`aggregate`, `confidence`) no se almacena: se deriva en
cada lectura desde `CriticRatings` (FR-015, ADR-009).

### `Trailer`

| Campo | Tipo | Descripción | Requisito |
|---|---|---|---|
| `youtubeId` | `string` | Identificador del vídeo | FR-016 |
| `url` | `string` | `https://www.youtube.com/watch?v=…` | FR-016 |
| `title` | `string` | Título del vídeo tal como lo publica el canal | FR-016 |
| `language` | `'es' \| 'original' \| 'unknown'` | Idioma del tráiler seleccionado | FR-016 |
| `kind` | `'trailer' \| 'teaser' \| 'clip'` | Tipo de vídeo | FR-016 |
| `liveness` | `'live' \| 'dead' \| 'unverified'` | Resultado de la verificación | FR-017 |
| `checkedAt` | `string \| null` | Instante de la última verificación | FR-019 |
| `searchFallbackUrl` | `string` | Búsqueda en YouTube de respaldo | FR-018 |

---

## Entidad `UserRating`

Valoración personal. Clave primaria `titleId`.

| Campo | Tipo | Nulo | Descripción | Requisito |
|---|---|---|---|---|
| `titleId` | `string` | no | Referencia a `Title.id` | FR-021 |
| `watched` | `boolean` | no | Marcado como visto | FR-021 |
| `watchedAt` | `string` | sí | Fecha de visionado (ISO 8601) | FR-021 |
| `watchedOnPlatform` | `string` | sí | Identificador de plataforma | FR-021 |
| `scores` | `Record<string, number>` | no | Puntuación 0–10 por identificador de criterio | FR-022, FR-024 |
| `notes` | `string` | no | Comentario libre | FR-025 |
| `createdAt` | `string` | no | ISO 8601 | — |
| `updatedAt` | `string` | no | ISO 8601 | — |

`scores` es disperso: solo contiene los criterios efectivamente puntuados
(FR-024, FR-025). La nota personal **no se almacena**, se deriva (ADR-008).

---

## Entidad `RatingCriterion`

Criterio de valoración configurable. Vive dentro de `settings.json`.

| Campo | Tipo | Descripción | Requisito |
|---|---|---|---|
| `id` | `string` | Identificador estable e inmutable | FR-026 |
| `label` | `string` | Nombre visible, editable | FR-026 |
| `description` | `string` | Ayuda breve mostrada en la interfaz | FR-022 |
| `weight` | `number` | Peso relativo > 0; se normaliza al calcular | FR-023 |
| `enabled` | `boolean` | Si participa en los cálculos | FR-026 |
| `order` | `number` | Posición en la interfaz | FR-026 |

**Criterios por defecto** (FR-022):

| `id` | Etiqueta | Peso |
|---|---|---|
| `story` | Guion e historia | 25 |
| `acting` | Interpretaciones | 20 |
| `direction` | Dirección | 15 |
| `visuals` | Fotografía y dirección artística | 12 |
| `sound` | Banda sonora y sonido | 10 |
| `pacing` | Ritmo | 10 |
| `impact` | Impacto y ganas de revisionado | 8 |

---

## Entidad `AgentRun`

Informe de una ejecución del agente (FR-008).

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | `string` | Identificador de la ejecución |
| `trigger` | `'scheduled' \| 'manual' \| 'catchup' \| 'cli'` | Origen |
| `startedAt` / `finishedAt` | `string` | ISO 8601 |
| `durationMs` | `number` | Duración total |
| `status` | `'success' \| 'partial' \| 'failed'` | Estado global (ADR-006) |
| `window` | `{ from: string; to: string }` | Ventana temporal consultada (FR-004) |
| `platformsQueried` | `string[]` | Plataformas incluidas |
| `counts` | `{ discovered, created, updated, skipped }` | Recuentos |
| `perPlatform` | `Record<string, number>` | Títulos hallados por plataforma |
| `http` | `{ requests, cacheHits, retries, rateLimited }` | Métricas de red (NFR-003, NFR-004) |
| `stages` | `StageReport[]` | Una entrada por etapa |
| `issues` | `RunIssue[]` | Incidencias con etapa, fuente, título y mensaje |

`RunIssue` = `{ stage, source, titleId?, titleName?, message, severity: 'warn' | 'error' }`.

Los informes se serializan tras pasar por un saneador que elimina cualquier
clave de API presente en las URL de los mensajes de error (NFR-009).

---

## Entidad `Settings`

| Campo | Tipo | Por defecto | Requisito |
|---|---|---|---|
| `schedule.weekday` | `0-6` (0 = domingo) | `1` (lunes) | FR-001 |
| `schedule.hour` | `0-23` | `9` | FR-001 |
| `schedule.enabled` | `boolean` | `true` | FR-001 |
| `schedule.nextRunAt` | `string \| null` | `null` | FR-002, ADR-007 |
| `schedule.lastRunAt` | `string \| null` | `null` | FR-002 |
| `window.lookbackDays` | `number` | `7` | FR-004 |
| `window.graceDays` | `number` | `2` | FR-004 |
| `platforms` | `Record<string, boolean>` | todas activas | FR-005 |
| `criteria` | `RatingCriterion[]` | los siete por defecto | FR-022 |
| `revalidateTrailerWeeks` | `number` | `8` | FR-019 |
| `cacheTtlHours` | `number` | `168` | NFR-004 |
| `schemaVersion` | `number` | `1` | FR-038 |

---

## Índices en memoria (NFR-006)

Al cargar el almacén se construyen, y se mantienen en cada escritura:

- `byId: Map<string, Title>`
- `byWeek: Map<string, Set<string>>`
- `byPlatform: Map<string, Set<string>>`
- `byGenre: Map<string, Set<string>>`
- `sortedByDate: string[]`

El filtrado de la interfaz es intersección de conjuntos, no recorrido lineal
del catálogo.

---

## Invariantes

1. `Title.genres` nunca está vacío (FR-012).
2. `Title.platforms` nunca está vacío: un título sin plataforma no se persiste.
3. `Trailer.liveness === 'live'` implica `checkedAt !== null` (FR-017).
4. `UserRating.scores[k]` está en `[0, 10]` y es múltiplo de `0,5` (FR-022).
5. `RatingCriterion.weight > 0` (FR-023).
6. `UserRating.watched === false` implica `watchedAt === null`.
7. Ninguna entidad persistida contiene claves de API (NFR-009).
