# Especificación funcional — 001 · Estrenos de streaming en España

- **ID de funcionalidad:** 001-estrenos-streaming-es
- **Estado:** Aprobada
- **Fecha:** 2026-09-10
- **Constitución aplicable:** `.specify/memory/constitution.md` v1.0.0

---

## 1. Problema

Cada semana se estrenan decenas de películas y series en las plataformas de
streaming disponibles en España. La información está dispersa: el catálogo lo
publica cada plataforma por su cuenta, las notas de crítica están en IMDb y
Rotten Tomatoes, los tráileres en castellano hay que buscarlos a mano y el
registro de "qué he visto y qué me pareció" no existe o vive en una hoja de
cálculo.

## 2. Qué se construye

Una **aplicación de escritorio descargable** que:

1. Ejecuta un **agente automático una vez por semana** que recopila los estrenos
   de la semana en las principales plataformas de streaming en España.
2. Muestra cada título con sus **notas de crítica agregadas** (IMDb, Rotten
   Tomatoes, Metacritic, TMDB) y su **género**.
3. Ofrece un **enlace verificado al tráiler en castellano de YouTube**.
4. Permite marcar títulos como **vistos** y **valorarlos con criterios
   cuantificables** con pesos configurables.

## 3. Fuera de alcance (v1)

- Reproducir contenido o integrarse con las cuentas de las plataformas.
- Aplicación móvil o web pública.
- Recomendaciones personalizadas por IA / motor de similitud.
- Perfiles múltiples o sincronización entre dispositivos.
- Idiomas de interfaz distintos del castellano.

## 4. Personas

| Persona | Necesidad principal |
|---|---|
| **Espectador semanal** | Ver de un vistazo qué ha salido esta semana y en qué plataforma, sin abrir cinco apps. |
| **Espectador selectivo** | Filtrar por nota mínima y género antes de invertir dos horas. |
| **Archivista** | Llevar registro cuantificado de lo que ha visto y poder consultarlo y exportarlo. |

---

## 5. Requisitos funcionales

### 5.1 Agente semanal de recopilación

**FR-001 — Ejecución programada semanal.**
El sistema ejecuta el agente de recopilación una vez por semana, en el día de la
semana y la hora local configurados por el usuario (por defecto: lunes 09:00).

- *Criterio:* Dado que la última ejecución fue hace más de 7 días y la app se
  abre, cuando el planificador evalúa el calendario, entonces se lanza una
  ejecución en menos de 60 segundos.
- *Criterio:* Dado que la app permanece abierta, cuando llega el instante
  programado, entonces se lanza una ejecución sin intervención del usuario.

**FR-002 — Recuperación de ejecuciones perdidas.**
Si la aplicación estuvo cerrada en el momento programado, la ejecución pendiente
se lanza en el siguiente arranque, y solo una vez (no se acumulan).

- *Criterio:* Dado un `nextRunAt` vencido hace 3 semanas, cuando arranca la app,
  entonces se ejecuta exactamente una vez y `nextRunAt` se recalcula al futuro.

**FR-003 — Ejecución manual.**
El usuario puede lanzar el agente en cualquier momento desde la interfaz.

- *Criterio:* Dado que no hay ejecución en curso, cuando el usuario pulsa
  "Actualizar ahora", entonces arranca una ejecución y la interfaz muestra su
  progreso por etapas.
- *Criterio:* Dado que hay una ejecución en curso, cuando el usuario pulsa
  "Actualizar ahora", entonces la petición se rechaza con un aviso y no se
  lanzan dos ejecuciones concurrentes.

**FR-004 — Ventana temporal de estrenos.**
El agente recopila los títulos cuya fecha de disponibilidad en España cae en la
ventana configurada (por defecto los 7 días anteriores a la ejecución, con un
margen de 2 días para altas tardías del catálogo).

**FR-005 — Cobertura de plataformas.**
El agente cubre, como mínimo, estas plataformas en la región `ES`: Netflix,
Prime Video, Disney+, HBO Max, Movistar Plus+, Apple TV+, SkyShowtime, Filmin,
Crunchyroll, Atresplayer, Rakuten TV y Pluto TV. El usuario puede activar o
desactivar cada una.

- *Criterio:* Dado que el usuario desactiva "Pluto TV", cuando corre el agente,
  entonces no se realizan consultas de descubrimiento para esa plataforma y sus
  títulos no aparecen entre los nuevos resultados.

**FR-006 — Resolución dinámica de identificadores de plataforma.**
Los identificadores de proveedor se resuelven por nombre contra el catálogo de
proveedores de la región `ES` en cada ejecución; los identificadores
codificados en el repositorio son solo una pista de arranque.

- *Criterio:* Dado que un identificador codificado ha cambiado en el proveedor,
  cuando corre el agente, entonces se usa el identificador resuelto por nombre y
  se registra la discrepancia en el informe.

**FR-007 — Películas y series.**
El agente recopila tanto películas como series. El tipo es un atributo del
título y un filtro de la interfaz.

**FR-008 — Informe de ejecución.**
Cada ejecución produce un informe persistido con: instante de inicio y fin,
duración, títulos nuevos, títulos actualizados, peticiones realizadas, aciertos
de caché, y la lista de errores por etapa y por fuente.

- *Criterio:* Dado que la API de notas devuelve error para 3 títulos, cuando
  termina la ejecución, entonces el estado global es `partial`, los otros
  títulos se guardan igualmente y el informe enumera los 3 fallos.

**FR-009 — Continuidad ante fallos.**
El fallo de una fuente o de un título individual no aborta la ejecución
(Constitución, Art. IV).

**FR-010 — Modo desatendido.**
El agente es ejecutable sin interfaz gráfica mediante un comando de consola,
para poder programarlo en un servidor o en integración continua.

### 5.2 Datos de cada título

**FR-011 — Ficha del título.**
Cada título almacena: identificador estable, tipo (película/serie), título en
castellano, título original, año, sinopsis en castellano, póster, duración o
número de temporadas, plataformas donde está disponible en España, fecha de
disponibilidad, y la semana ISO de estreno.

**FR-012 — Géneros.**
Cada título lleva su lista de géneros en castellano. Un título sin géneros
declarados por la fuente se etiqueta como "Sin clasificar", nunca se omite el
campo.

- *Criterio:* Dado un título con géneros `[Drama, Thriller]`, cuando se muestra
  la ficha, entonces aparecen ambos géneros como etiquetas y ambos son filtrables.

**FR-013 — Notas de crítica multi-fuente.**
Cada título recoge las notas disponibles de: IMDb (0–10), Rotten Tomatoes
(0–100, crítica), Metacritic (0–100) y TMDB (0–10), con la fecha de obtención.

**FR-014 — Ausencia explícita de nota.**
Una nota no disponible se representa como ausente y se muestra como "sin datos".
Nunca se sustituye por cero ni por una estimación (Constitución, Art. IV.2).

**FR-015 — Índice agregado de crítica.**
El sistema calcula un índice agregado 0–10 como media ponderada de las fuentes
disponibles, normalizadas a escala 0–10, junto con un nivel de confianza
derivado del número de fuentes presentes.

- *Criterio:* Dado un título con IMDb 8.0 y Rotten Tomatoes 90, cuando se
  calcula el índice, entonces el resultado está entre 8.0 y 9.0 y la confianza
  es "media" (2 fuentes de 4).
- *Criterio:* Dado un título sin ninguna nota, cuando se calcula el índice,
  entonces el resultado es ausente y la confianza es "ninguna".

### 5.3 Tráiler en castellano

**FR-016 — Selección de tráiler en castellano.**
Para cada título se busca un vídeo de YouTube de tipo tráiler en castellano
(`es-ES`), priorizando, por este orden: tráiler oficial en `es-ES`, teaser en
`es-ES`, tráiler en `es` (cualquier variante), tráiler doblado o subtitulado
identificado por su título, y como último recurso el tráiler en versión original.

- *Criterio:* Dado un título con un teaser `es-ES` y un tráiler `en-US`, cuando
  se selecciona el tráiler, entonces se elige el teaser `es-ES` y su idioma se
  marca como `es`.

**FR-017 — Enlace vivo verificado.**
El enlace del tráiler se verifica contra YouTube antes de marcarse como vivo. El
estado es `live` (verificado y reproducible), `dead` (verificado y no
disponible) o `unverified` (no se pudo comprobar). El estado `live` exige
verificación efectiva (Constitución, Art. IV.3).

- *Criterio:* Dado un vídeo retirado de YouTube, cuando se verifica el enlace,
  entonces el estado es `dead` y la interfaz ofrece la búsqueda de respaldo.

**FR-018 — Búsqueda de respaldo.**
Si no hay tráiler en castellano o el enlace no está vivo, el sistema ofrece un
enlace de búsqueda en YouTube con el título y el término "tráiler español".

**FR-019 — Revalidación.**
Los enlaces marcados como vivos se revalidan en cada ejecución semanal de los
títulos de las últimas 8 semanas, para detectar retiradas.

**FR-020 — Apertura externa.**
Al abrir un tráiler, se abre en el navegador del sistema, nunca dentro de la
aplicación (Constitución, Art. VI.3).

### 5.4 Visto y valoración cuantificable

**FR-021 — Marcar como visto.**
El usuario puede marcar y desmarcar cualquier título como visto, registrando la
fecha de visionado y, opcionalmente, la plataforma en la que lo vio.

- *Criterio:* Dado un título no visto, cuando el usuario lo marca como visto,
  entonces se guarda `watchedAt` con la fecha actual y el cambio persiste tras
  reiniciar la aplicación.

**FR-022 — Criterios cuantificables.**
La valoración se compone de criterios numéricos independientes, cada uno con
escala 0–10 en pasos de 0,5. Los criterios por defecto son: Guion e historia,
Interpretaciones, Dirección, Fotografía y dirección artística, Banda sonora y
sonido, Ritmo, e Impacto y ganas de revisionado.

**FR-023 — Pesos configurables.**
Cada criterio tiene un peso configurable por el usuario. Los pesos se normalizan
para sumar 100 % en el cálculo, sea cual sea el valor introducido.

- *Criterio:* Dados los pesos 3, 1 y 1 para tres criterios activos, cuando se
  calcula la nota, entonces equivalen a 60 %, 20 % y 20 %.

**FR-024 — Nota personal ponderada.**
La nota personal es la media ponderada de los criterios puntuados, en escala
0–10 con un decimal. Los criterios sin puntuar se excluyen del cálculo y de la
normalización de pesos.

- *Criterio:* Dado que solo se puntúan 2 de 7 criterios, cuando se calcula la
  nota, entonces se pondera únicamente con los pesos de esos 2 criterios.
- *Criterio:* Dado que no se puntúa ningún criterio, cuando se calcula la nota,
  entonces la nota personal es ausente y no se muestra como 0.

**FR-025 — Valoración parcial y notas de texto.**
El usuario puede guardar una valoración incompleta y completarla más tarde, y
adjuntar un comentario de texto libre.

**FR-026 — Criterios personalizados.**
El usuario puede añadir, renombrar, desactivar y reordenar criterios. Desactivar
un criterio conserva las puntuaciones históricas pero lo excluye de los cálculos
posteriores.

**FR-027 — Comparación con la crítica.**
La ficha de un título valorado muestra la diferencia entre la nota personal y el
índice agregado de crítica.

### 5.5 Interfaz

**FR-028 — Vista "Esta semana".**
Vista por defecto con los estrenos de la semana ISO en curso, agrupados por
plataforma.

**FR-029 — Filtros.**
Se puede filtrar por: plataforma, tipo (película/serie), género, nota mínima de
crítica, estado (visto / pendiente / valorado) y semana.

**FR-030 — Ordenación.**
Se puede ordenar por: fecha de estreno, índice de crítica, nota personal y
título alfabético.

**FR-031 — Búsqueda por texto.**
Búsqueda incremental por título en castellano y título original.

**FR-032 — Ficha de detalle.**
Al abrir un título se muestran sinopsis, géneros, plataformas, todas las notas
con su fuente, el tráiler y el panel de valoración.

**FR-033 — Vista "Mis vistas".**
Listado de títulos vistos, ordenable por nota personal, con estadísticas
básicas: total de vistos, nota media personal y desglose por género.

**FR-034 — Estado vacío guiado.**
Sin datos ni claves configuradas, la aplicación explica qué falta y enlaza a los
ajustes correspondientes en lugar de mostrar una pantalla en blanco.

### 5.6 Datos, claves y ajustes

**FR-035 — Configuración de claves de API.**
El usuario introduce sus claves de API en los ajustes. Se guardan cifradas con
el almacén del sistema operativo y no se muestran completas tras guardarlas.

**FR-036 — Verificación de claves.**
Los ajustes ofrecen un botón para verificar cada clave contra su servicio y
mostrar el resultado.

**FR-037 — Exportación.**
El usuario puede exportar a un único archivo JSON el catálogo, sus valoraciones,
sus ajustes y el historial de ejecuciones.

**FR-038 — Importación.**
El usuario puede importar un archivo exportado previamente, con validación de
esquema y sin sobrescribir valoraciones existentes salvo confirmación explícita.

**FR-039 — Borrado.**
El usuario puede borrar todos sus datos personales desde los ajustes, con
confirmación.

**FR-040 — Persistencia local.**
Todos los datos residen en el directorio de datos de aplicación del usuario. La
escritura es atómica: un corte de corriente no deja el almacén corrupto.

### 5.7 Distribución

**FR-041 — Aplicación descargable.**
Se distribuyen instaladores para Windows (`.exe`, NSIS), macOS (`.dmg`) y Linux
(`AppImage` y `.deb`), generados desde el mismo código fuente.

**FR-042 — Primer arranque sin claves.**
La aplicación arranca y es navegable sin claves de API configuradas; solo la
recopilación queda deshabilitada, con un aviso claro.

---

## 6. Requisitos no funcionales

| ID | Requisito | Criterio de verificación |
|---|---|---|
| **NFR-001** | El núcleo (`src/core`) no depende de Electron ni del DOM | Prueba que falla si aparece un `import` de `electron`, `react` o `window` en `src/core` |
| **NFR-002** | `npm ci && npm test` pasa sin red y sin claves | Ejecución en CI con red de terceros no disponible |
| **NFR-003** | Límite de concurrencia y espera exponencial ante `429` | Prueba unitaria del cliente HTTP con respuestas simuladas |
| **NFR-004** | Caché de respuestas con expiración, reutilizada entre ejecuciones | Segunda ejecución idéntica no repite peticiones ya cacheadas |
| **NFR-005** | Una ejecución semanal típica (≤ 300 títulos) termina en menos de 10 minutos | Medición registrada en el informe de ejecución |
| **NFR-006** | La interfaz responde con 1 000 títulos en el almacén sin bloqueo perceptible | Filtrado y ordenación calculados sobre índices en memoria |
| **NFR-007** | Ventanas con `contextIsolation`, `sandbox` y sin integración de Node | Revisión de `BrowserWindow` + prueba de configuración |
| **NFR-008** | Toda entrada IPC se valida antes de usarse | Pruebas de los validadores con entradas inválidas |
| **NFR-009** | Ninguna clave de API aparece en logs, informes ni exportaciones | Prueba que serializa un informe con claves presentes y comprueba su ausencia |
| **NFR-010** | Sin telemetría ni peticiones a servidores propios | Inventario de destinos de red documentado en `research.md` |

---

## 7. Supuestos

- **A-001** El usuario obtiene gratuitamente sus propias claves de TMDB y OMDb.
  La app no incluye claves compartidas.
- **A-002** TMDB es la fuente de catálogo, disponibilidad por plataforma en
  España, géneros y vídeos; OMDb es la fuente de IMDb, Rotten Tomatoes y
  Metacritic. Se documenta en `research.md` y se aísla tras interfaces para
  poder sustituirlas.
- **A-003** La verificación de vídeos de YouTube se hace por el punto oEmbed
  público, que no requiere clave.
- **A-004** "Estreno" significa alta en el catálogo de la plataforma en España
  según la fuente de datos, no fecha de producción.

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambio de identificadores de proveedor | Plataformas vacías | FR-006, resolución dinámica por nombre |
| Cuota de OMDb agotada (1 000/día en el plan gratuito) | Faltan notas | Caché persistente, priorización por novedad, degradación a `partial` |
| Ausencia de tráiler en castellano | Requisito incumplido | FR-018, enlace de búsqueda de respaldo |
| Cobertura incompleta del catálogo de una plataforma | Faltan estrenos | Documentado; el informe expone el recuento por plataforma |
| Bloqueo de red corporativa | Agente inoperante | Fallo explícito en el informe, la app sigue navegable con datos previos |
