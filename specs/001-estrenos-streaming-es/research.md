# Investigación y decisiones de arquitectura — 001

Registro de decisiones (ADR). Cada decisión indica alternativas descartadas y el
motivo. Enmendar una decisión exige añadir un ADR nuevo que la supersede.

---

## ADR-001 — Aplicación de escritorio con Electron

**Contexto.** FR-041 pide instaladores descargables para Windows, macOS y Linux.
FR-001 pide un agente que corra periódicamente en la máquina del usuario. El
Art. III de la constitución prohíbe servidores propios.

**Decisión.** Electron + React + TypeScript, empaquetado con `electron-builder`.

**Alternativas descartadas.**
- *Tauri*: binarios mucho más pequeños, pero exige cadena de compilación de Rust
  y un WebView distinto por sistema operativo, lo que complica la reproducción
  del build y el soporte. Descartada por coste de mantenimiento, no por técnica.
- *PWA / web*: no cumple "descargable", y un agente semanal en el navegador
  depende de que la pestaña esté abierta.
- *CLI pura*: no cubre la interfaz de valoración (FR-021 a FR-033).

**Consecuencias.** Instaladores de ~90 MB. El proceso principal es el único con
acceso al sistema; el renderizador queda aislado (Art. VI).

---

## ADR-002 — TMDB como fuente de catálogo y disponibilidad

**Contexto.** Hace falta saber qué se estrena, en qué plataforma española, con
género y sinopsis en castellano.

**Decisión.** The Movie Database (TMDB) como fuente primaria.

**Motivos.**
- Expone disponibilidad por región y proveedor (`watch_region=ES`), que es
  exactamente el eje de FR-005.
- Devuelve géneros, sinopsis y títulos localizados con `language=es-ES`.
- Devuelve vídeos asociados con su idioma, base de FR-016.
- Devuelve `imdb_id`, que es la clave para cruzar con las notas (FR-013).
- Clave de API gratuita para uso personal.

**Alternativas descartadas.**
- *JustWatch*: mejor cobertura de disponibilidad, sin API pública gratuita.
- *Scraping de cada plataforma*: frágil, contrario al Art. V, y prohibido por
  los términos de servicio de varias de ellas.
- *Trakt*: buen catálogo, disponibilidad por plataforma más pobre para España.

**Puntos de descubrimiento usados.**
| Uso | Ruta |
|---|---|
| Estrenos por plataforma | `/discover/movie`, `/discover/tv` con `watch_region=ES`, `with_watch_providers`, `with_watch_monetization_types=flatrate` |
| Catálogo de proveedores ES | `/watch/providers/movie?watch_region=ES`, `/watch/providers/tv?watch_region=ES` |
| Ficha | `/movie/{id}`, `/tv/{id}` con `language=es-ES` |
| Identificador IMDb | `/movie/{id}/external_ids`, `/tv/{id}/external_ids` |
| Vídeos | `/movie/{id}/videos`, `/tv/{id}/videos` con `language=es-ES` y sin filtro de idioma |
| Disponibilidad por título | `/movie/{id}/watch/providers`, `/tv/{id}/watch/providers` |

---

## ADR-003 — OMDb para IMDb, Rotten Tomatoes y Metacritic

**Contexto.** FR-013 exige notas de IMDb y Rotten Tomatoes. Ninguna de las dos
ofrece API pública gratuita directa.

**Decisión.** OMDb API consultada por `imdb_id`. Su campo `Ratings` devuelve, en
una sola petición, "Internet Movie Database", "Rotten Tomatoes" y "Metacritic".

**Consecuencias y límites.**
- El plan gratuito son 1 000 peticiones diarias. Con caché persistente y
  ventanas de 7 días, una ejecución típica consume entre 50 y 300.
- Rotten Tomatoes llega como porcentaje de crítica (`Tomatometer`), no como
  nota de audiencia. Se documenta en la interfaz.
- Las series se consultan a nivel de serie, no de temporada.
- Si OMDb no tiene el título, la nota queda ausente (FR-014), nunca a cero.

**Alternativa descartada.** Scraping de IMDb y Rotten Tomatoes: contrario a sus
términos de servicio y al Art. V.

---

## ADR-004 — Verificación de tráileres por oEmbed de YouTube

**Contexto.** FR-017 exige que un enlace solo se marque como vivo si se ha
verificado. La API de datos de YouTube exigiría una tercera clave y consume
cuota agresivamente.

**Decisión.** Verificar contra `https://www.youtube.com/oembed?url=...&format=json`.

- `200` → el vídeo existe y es incrustable → `live`.
- `401`/`403`/`404` → retirado, privado o restringido → `dead`.
- Error de red, tiempo de espera o cualquier otro código → `unverified`.

**Motivos.** No requiere clave, es un punto público y estable, y distingue con
precisión los tres estados que pide la especificación.

**Consecuencia.** Un vídeo existente pero con incrustación deshabilitada se
clasifica como `dead` aunque sea visible en YouTube. Se acepta: el usuario
siempre tiene el enlace de búsqueda de respaldo (FR-018), y la constitución
prefiere marcar de menos a marcar de más (Art. IV.3).

---

## ADR-005 — Almacén JSON con escritura atómica en lugar de SQLite

**Contexto.** FR-040 exige persistencia local resistente a cortes. NFR-006 exige
respuesta fluida con 1 000 títulos. El Art. VII exige empaquetado determinista.

**Decisión.** Almacén documental en JSON, un archivo por colección, con
escritura atómica (escribir en temporal + `rename`) e índices en memoria.

**Motivos.**
- Cero dependencias nativas. `better-sqlite3` obligaría a recompilar módulos
  nativos por plataforma y arquitectura en el empaquetado, que es la causa más
  común de builds rotos en Electron.
- El volumen es acotado por diseño: ~150 títulos por semana, ~8 000 al año. Un
  índice en memoria resuelve el filtrado de NFR-006 sobradamente.
- `rename` es atómico dentro del mismo sistema de archivos en Windows, macOS y
  Linux, que es lo que exige FR-040.

**Alternativas descartadas.**
- *SQLite (`better-sqlite3`)*: consultas más ricas, pero recompilación nativa.
- *`node:sqlite`*: aún experimental y atado a la versión de Node que empaquete
  cada versión de Electron.
- *IndexedDB en el renderizador*: violaría el Art. II (el dominio no puede
  depender del navegador) y dejaría el modo desatendido (FR-010) sin almacén.

**Vía de migración.** Todo el acceso pasa por las interfaces de
`src/core/store/`. Sustituir la implementación por SQLite no afecta al dominio,
al agente ni a la interfaz.

---

## ADR-006 — El agente es una tubería de etapas con degradación por etapa

**Contexto.** FR-008 y FR-009 exigen que un fallo parcial ni aborte la ejecución
ni se oculte.

**Decisión.** El agente se modela como una tubería de cinco etapas —
`discover`, `enrich`, `rate`, `trailer`, `persist` — donde cada etapa recibe el
acumulador, captura sus propios errores por título y devuelve un resultado
parcial más una lista de incidencias.

**Estado global de la ejecución.**
- `success`: cero incidencias.
- `partial`: hay incidencias pero se persistió al menos un título.
- `failed`: no se pudo persistir nada (por ejemplo, sin claves o sin red).

**Consecuencia.** La interfaz distingue "no hay estrenos esta semana" de "la
recopilación falló", que son cosas muy distintas para el usuario.

---

## ADR-007 — Planificación por evaluación de vencimiento, no por cron en memoria

**Contexto.** FR-001 y FR-002. Una aplicación de escritorio se cierra, se
suspende y cambia de huso horario.

**Decisión.** Persistir `nextRunAt`. Un temporizador comprueba cada 15 minutos
si `now >= nextRunAt`; también se comprueba al arrancar y al despertar del
sistema. Tras cada ejecución, `nextRunAt` se recalcula al **siguiente** instante
programado futuro, lo que colapsa las semanas perdidas en una sola ejecución.

**Alternativa descartada.** `node-cron` en memoria: no sobrevive al cierre de la
app, no recupera ejecuciones perdidas y se desincroniza al suspender el equipo.

---

## ADR-008 — Modelo de valoración con pesos normalizados sobre criterios puntuados

**Contexto.** FR-022 a FR-026. El usuario puede dejar criterios sin puntuar y
cambiar los pesos en cualquier momento.

**Decisión.** La nota personal es
`Σ(puntuación_i × peso_i) / Σ(peso_i)` calculada **solo** sobre los criterios
activos y puntuados. Las puntuaciones se guardan por identificador de criterio,
nunca por posición, para que renombrar o reordenar no corrompa el histórico.

**Consecuencia.** Cambiar un peso recalcula todas las notas personales al vuelo;
no se almacenan notas derivadas, se derivan siempre. Esto evita el clásico
problema de notas rancias inconsistentes con la configuración vigente.

---

## ADR-009 — Índice agregado de crítica normalizado a 0–10 con confianza explícita

**Contexto.** FR-015. Las fuentes usan escalas distintas y no siempre están
todas presentes.

**Decisión.** Normalizar cada fuente a 0–10 (IMDb tal cual, Rotten Tomatoes y
Metacritic divididos entre 10, TMDB tal cual), aplicar pesos por fiabilidad
percibida — IMDb 0,35, Rotten Tomatoes 0,30, Metacritic 0,20, TMDB 0,15 — y
renormalizar sobre las fuentes presentes. La confianza se deriva del número de
fuentes: 0 → `none`, 1 → `low`, 2 → `medium`, 3 o más → `high`.

**Consecuencia.** Un título con una sola fuente muestra índice **y** advertencia
de confianza baja, en lugar de aparentar la misma solidez que uno con cuatro.

---

## ADR-010 — Inventario cerrado de destinos de red

**Contexto.** NFR-010 y Art. III.2.

**Decisión.** La aplicación solo contacta con estos destinos, y ninguno es
propio:

| Destino | Para qué | Clave |
|---|---|---|
| `api.themoviedb.org` | Catálogo, géneros, vídeos, proveedores | Sí, del usuario |
| `image.tmdb.org` | Pósteres | No |
| `www.omdbapi.com` | IMDb, Rotten Tomatoes, Metacritic | Sí, del usuario |
| `www.youtube.com/oembed` | Verificación de tráiler | No |

Cualquier destino adicional exige enmendar este ADR. El cliente HTTP aplica esta
lista como control efectivo, no solo como documentación.

---

## ADR-011 — El modo desatendido comparte el núcleo, no lo duplica

**Contexto.** FR-010 pide ejecutar el agente sin interfaz.

**Decisión.** `scripts/agent-cli.ts` construye las mismas dependencias que el
proceso principal de Electron y llama al mismo `runWeeklyAgent`. Las claves se
leen de variables de entorno y el almacén apunta a un directorio indicado por
parámetro.

**Consecuencia.** Un flujo de trabajo de integración continua puede ejecutar el
agente semanalmente y publicar el resultado, sin código específico y sin riesgo
de divergencia de comportamiento entre ambos modos.


---

## ADR-012 — Capacitor para Android, reutilizando núcleo e interfaz

**Contexto.** FR-043 exige un APK instalable. FR-044 exige que el PC y el móvil
no diverjan. Electron no corre en Android.

**Decisión.** Envolver la **misma** interfaz de React con Capacitor y ejecutar el
**mismo** núcleo dentro de la vista web. Electron se mantiene para el PC.

```
            src/core  +  src/renderer        (idénticos en las dos)
                     │
        ┌────────────┴────────────┐
   PC: Electron                Android: Capacitor
   proceso principal + IPC      todo en la vista web, sin IPC
   almacén en sistema de        almacén en el sistema de archivos
   archivos de Node             del contenedor
   claves con safeStorage       claves en almacenamiento privado
```

**Alternativas descartadas.**
- *React Native*: obligaría a reescribir la interfaz entera. Tirar a la basura
  una interfaz que ya funciona para ganar unos milisegundos de arranque no sale
  a cuenta en una aplicación que se consulta una vez por semana.
- *Aplicación web progresiva*: no da un archivo instalable, y deja las
  peticiones a merced de las políticas de origen cruzado de los terceros, sin
  alternativa si alguno deja de permitirlas.
- *Aplicación nativa en Kotlin*: duplicaría el dominio entero, que es justo lo
  que FR-044 prohíbe.

**Consecuencia.** El proceso principal de Electron deja de contener lógica: pasa
a ser un adaptador. La lógica que antes vivía en los manejadores IPC se mueve a
un servicio del núcleo que ambas plataformas invocan.

---

## ADR-013 — El almacenamiento entra por una interfaz, no por `node:fs`

**Contexto.** El Art. II prohíbe que el dominio conozca rutas, pero
`json-store.ts` importaba `node:fs`, `node:path` y `node:crypto`. En una vista
web de Android esos módulos no existen.

**Decisión.** Definir `KeyValueStorage` —leer, escribir y borrar un documento de
texto por clave— e inyectarla. Cada plataforma aporta su implementación:

| Plataforma | Implementación | Garantía de atomicidad |
|---|---|---|
| Node (Electron y consola) | Archivos con temporal + `fsync` + `rename` | Sí, la de FR-040 |
| Android (Capacitor) | Sistema de archivos del contenedor, directorio de datos | Escritura completa por llamada; sin `rename` atómico |
| Pruebas | En memoria | Determinista |

**Sobre la atomicidad en Android.** El contenedor no expone `rename`, así que la
escritura no es atómica en el mismo sentido. Se mitiga escribiendo primero una
copia `<clave>.bak` y verificando el contenido al leer: si el archivo principal
está corrupto, se recupera la copia. No es equivalente, y se declara como tal
en lugar de afirmar que FR-040 se cumple igual en las dos plataformas.

**`node:crypto` fuera del núcleo.** `randomBytes` se sustituye por
`crypto.getRandomValues`, que es estándar y existe tanto en Node como en
cualquier navegador. No hacía falta criptografía: solo un identificador que no
chocara.

---

## ADR-014 — Peticiones por el cliente HTTP nativo en Android

**Contexto.** Una vista web aplica las políticas de origen cruzado. TMDB y OMDb
hoy las permiten, pero apoyar la aplicación en que un tercero siga permitiendo
peticiones desde cualquier origen es construir sobre algo que no controlamos.

**Decisión.** Activar el cliente HTTP nativo de Capacitor, que sustituye a
`fetch` en la vista web por una implementación nativa que no pasa por esas
políticas.

**Encaje con lo que ya había.** `HttpClient` recibe `fetch` inyectado desde el
primer día (Art. II.2), así que esto no toca ni una línea del núcleo: solo
cambia qué función se le pasa al construirlo.

---

## ADR-015 — En Android no hay ejecución en segundo plano

**Contexto.** FR-001 pide una ejecución semanal. Android mata los procesos en
segundo plano de forma agresiva y un trabajo programado exigiría permisos que
asustan al usuario para algo que no lo merece.

**Decisión.** En el móvil no se programa nada en segundo plano: se aprovecha el
mecanismo de recuperación que ya existía (ADR-007). Al abrir la aplicación o al
volver a ella, se comprueba si venció `nextRunAt` y, si es así, se ejecuta una
vez.

**Por qué funciona.** El planificador nunca dependió de un temporizador vivo,
sino de un instante persistido. El caso «la aplicación estaba cerrada» ya estaba
resuelto y probado (FR-002); en Android es el caso normal en lugar de la
excepción.

**Consecuencia.** Si el usuario no abre la aplicación en tres semanas, al
abrirla obtiene una sola recopilación con la ventana configurada, no tres. Se
documenta en la interfaz para que no sorprenda.
