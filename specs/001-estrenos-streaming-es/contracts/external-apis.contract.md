# Contrato de APIs externas — 001

Define exactamente qué se pide a cada tercero y qué forma tiene la respuesta de
la que dependemos. Las capturas literales viven en `tests/fixtures/` y las
pruebas de `tests/contract/` fallan si el adaptador deja de respetar este
documento.

Destinos permitidos: los cuatro de ADR-010. El cliente HTTP rechaza cualquier
otro anfitrión.

---

## 1. TMDB

Base: `https://api.themoviedb.org/3`
Autenticación: parámetro `api_key=<clave del usuario>`
Idioma: `language=es-ES` salvo indicación contraria
Región: `watch_region=ES`

### 1.1 Catálogo de proveedores (FR-006)

```
GET /watch/providers/movie?api_key=…&watch_region=ES
GET /watch/providers/tv?api_key=…&watch_region=ES
```

```jsonc
{ "results": [ { "provider_id": 8, "provider_name": "Netflix", "logo_path": "/x.jpg", "display_priority": 0 } ] }
```

Se usa para resolver `provider_id` a partir del nombre. La comparación de
nombres es insensible a mayúsculas, tildes y signos.

### 1.2 Descubrimiento de estrenos (FR-004, FR-005)

```
GET /discover/movie?api_key=…&language=es-ES&watch_region=ES
    &with_watch_providers=8&with_watch_monetization_types=flatrate
    &primary_release_date.gte=YYYY-MM-DD&primary_release_date.lte=YYYY-MM-DD
    &sort_by=primary_release_date.desc&include_adult=false&page=N

GET /discover/tv?…&first_air_date.gte=…&first_air_date.lte=…&sort_by=first_air_date.desc
```

```jsonc
{
  "page": 1, "total_pages": 3, "total_results": 47,
  "results": [ {
    "id": 1234, "title": "…", "original_title": "…",      // TV: name / original_name
    "overview": "…", "poster_path": "/p.jpg", "backdrop_path": "/b.jpg",
    "release_date": "2026-09-04",                          // TV: first_air_date
    "genre_ids": [18, 53], "vote_average": 7.4, "vote_count": 212
  } ]
}
```

Paginación: se recorren páginas hasta `total_pages` con tope de seguridad de 5
páginas por plataforma y tipo.

### 1.3 Ficha (FR-011, FR-012)

```
GET /movie/{id}?api_key=…&language=es-ES&append_to_response=external_ids,videos,watch/providers
GET /tv/{id}?api_key=…&language=es-ES&append_to_response=external_ids,videos,watch/providers
```

Campos consumidos: `genres[].name`, `runtime`, `number_of_seasons`,
`external_ids.imdb_id`, `videos.results[]`, `watch/providers.results.ES`.

Se usa `append_to_response` para resolver la ficha en **una** petición por
título en lugar de cuatro (Art. V.1).

### 1.4 Vídeos (FR-016)

```jsonc
{ "results": [ {
  "key": "abc123", "name": "Tráiler oficial en castellano",
  "site": "YouTube", "type": "Trailer", "official": true,
  "iso_639_1": "es", "iso_3166_1": "ES", "published_at": "2026-08-20T10:00:00.000Z"
} ] }
```

Solo se consideran entradas con `site === "YouTube"`.

### 1.5 Disponibilidad por título

```jsonc
{ "results": { "ES": {
  "link": "https://www.themoviedb.org/movie/1234/watch?locale=ES",
  "flatrate": [ { "provider_id": 8, "provider_name": "Netflix", "logo_path": "/x.jpg" } ]
} } }
```

Solo se consideran `flatrate` y `free`. `rent` y `buy` no son "estar disponible
en una plataforma de suscripción" a efectos de FR-005.

### 1.6 Errores relevantes

| Código | Significado | Reacción |
|---|---|---|
| `401` | Clave inválida | Incidencia `error`, se aborta la etapa, estado `failed` |
| `404` | Título inexistente | Incidencia `warn` de ese título, se continúa |
| `429` | Límite de tasa | Espera exponencial y reintento, hasta 3 veces |

---

## 2. OMDb

Base: `https://www.omdbapi.com/`
Autenticación: parámetro `apikey=<clave del usuario>`

```
GET /?apikey=…&i=tt1234567&tomatoes=true
```

Respuesta con datos:

```jsonc
{
  "Title": "…", "Year": "2026", "imdbRating": "7.8", "imdbVotes": "12,345",
  "Metascore": "68",
  "Ratings": [
    { "Source": "Internet Movie Database", "Value": "7.8/10" },
    { "Source": "Rotten Tomatoes",         "Value": "88%" },
    { "Source": "Metacritic",              "Value": "68/100" }
  ],
  "Response": "True"
}
```

Respuesta sin datos:

```jsonc
{ "Response": "False", "Error": "Movie not found!" }
```

### Reglas de análisis (FR-013, FR-014)

| Caso | Resultado |
|---|---|
| `Response === "False"` | Todas las notas ausentes; incidencia `warn` |
| `imdbRating === "N/A"` | `imdb: null` |
| `Value: "88%"` | `rottenTomatoes: 88` |
| `Value: "7.8/10"` | `imdb: 7.8` |
| `Value: "68/100"` | `metacritic: 68` |
| `imdbVotes: "12,345"` | `imdbVotes: 12345` |
| `Metascore: "N/A"` | `metacritic: null` |
| Fuente desconocida en `Ratings` | Se ignora sin fallar |

**Nunca** se convierte una ausencia en `0`.

---

## 3. YouTube oEmbed (verificación, sin clave)

```
GET https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DID&format=json
```

| Respuesta | `liveness` |
|---|---|
| `200` con JSON válido | `live` |
| `401`, `403`, `404` | `dead` |
| `5xx`, tiempo de espera, error de red | `unverified` |

Enlace de respaldo (FR-018):

```
https://www.youtube.com/results?search_query=<título>+tráiler+español
```

---

## 4. Reglas transversales del cliente HTTP

| Regla | Valor | Requisito |
|---|---|---|
| Concurrencia máxima | 4 peticiones simultáneas | NFR-003, Art. V.1 |
| Reintentos | 3, ante `429`, `5xx` y errores de red | NFR-003 |
| Espera entre reintentos | 500 ms × 2ⁿ, con dispersión aleatoria | NFR-003 |
| Respeto de `Retry-After` | Sí, si viene en la respuesta | Art. V.1 |
| Tiempo de espera | 15 s por petición | — |
| Caché | Por URL canónica, expiración configurable (168 h por defecto) | NFR-004 |
| Lista blanca de anfitriones | Los cuatro de ADR-010 | NFR-010 |
| Saneado de claves | `api_key` y `apikey` se sustituyen por `***` en todo mensaje de error | NFR-009 |
