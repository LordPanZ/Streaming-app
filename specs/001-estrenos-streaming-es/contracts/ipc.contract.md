# Contrato IPC — 001

Frontera entre el proceso de renderizado (sin privilegios) y el proceso
principal (con acceso al sistema). La definición ejecutable de este contrato es
`src/shared/ipc.ts`; este documento explica sus reglas.

## Reglas

1. El renderizador **no** tiene acceso a Node, ni al sistema de archivos, ni a
   la red privilegiada. Solo ve `window.api`, expuesto por `contextBridge`
   (Art. VI.2, NFR-007).
2. Cada manejador valida su entrada antes de tocar el dominio (NFR-008). Una
   entrada inválida devuelve un error tipado, nunca lanza al renderizador ni
   llega al almacén.
3. Ningún canal devuelve una clave de API. `secrets:status` devuelve presencia y
   los cuatro últimos caracteres, nunca el valor (FR-035, NFR-009).
4. `shell:open-external` acepta exclusivamente `http:` y `https:`. Cualquier
   otro esquema se rechaza (Art. VI.3).

## Superficie

### Consultas

| Canal | Entrada | Salida | Requisito |
|---|---|---|---|
| `catalog:query` | `CatalogQuery` | `CatalogPage` | FR-029, FR-030, FR-031 |
| `catalog:get` | `{ id: string }` | `TitleDetail \| null` | FR-032 |
| `catalog:facets` | — | `{ genres, platforms, weeks }` | FR-029 |
| `ratings:stats` | — | `WatchedStats` | FR-033 |
| `agent:status` | — | `AgentStatus` | FR-003 |
| `agent:runs` | `{ limit?: number }` | `AgentRun[]` | FR-008 |
| `settings:get` | — | `Settings` | FR-035 |
| `secrets:status` | — | `SecretsStatus` | FR-035 |

`CatalogQuery`:

```ts
{
  text?: string
  mediaType?: 'movie' | 'series' | 'all'
  platforms?: string[]
  genres?: string[]
  week?: string            // 'YYYY-Www' | 'current' | 'all'
  minCritic?: number       // 0–10
  status?: 'all' | 'watched' | 'pending' | 'rated'
  sort?: 'date' | 'critic' | 'personal' | 'title'
  order?: 'asc' | 'desc'
  offset?: number
  limit?: number           // máximo 200
}
```

### Comandos

| Canal | Entrada | Salida | Requisito |
|---|---|---|---|
| `ratings:set-watched` | `{ titleId, watched, watchedAt?, platform? }` | `UserRating` | FR-021 |
| `ratings:set-scores` | `{ titleId, scores: Record<string, number>, notes? }` | `UserRating` | FR-022, FR-025 |
| `ratings:clear` | `{ titleId }` | `{ ok: true }` | FR-025 |
| `agent:run` | `{ trigger: 'manual' }` | `AgentRunSummary` | FR-003 |
| `settings:update` | `Partial<Settings>` | `Settings` | FR-005, FR-023, FR-026 |
| `secrets:set` | `{ tmdb?: string, omdb?: string }` | `SecretsStatus` | FR-035 |
| `secrets:verify` | `{ which: 'tmdb' \| 'omdb' }` | `{ ok, message }` | FR-036 |
| `data:export` | — | `{ path: string \| null }` | FR-037 |
| `data:import` | `{ overwriteRatings: boolean }` | `ImportResult` | FR-038 |
| `data:wipe` | `{ confirm: true }` | `{ ok: true }` | FR-039 |
| `shell:open-external` | `{ url: string }` | `{ opened: boolean }` | FR-020 |

### Eventos (principal → renderizador)

| Evento | Carga | Requisito |
|---|---|---|
| `agent:progress` | `{ runId, stage, done, total, message }` | FR-003 |
| `agent:done` | `AgentRunSummary` | FR-003, FR-008 |
| `catalog:changed` | `{ reason: 'agent' \| 'import' \| 'wipe' }` | FR-028 |

## Errores

Todo canal devuelve, ante fallo, `{ ok: false, error: { code, message } }` con
`code` en: `INVALID_INPUT`, `NOT_FOUND`, `BUSY`, `NO_API_KEY`, `INTERNAL`.
Los mensajes están saneados de claves de API (NFR-009).
