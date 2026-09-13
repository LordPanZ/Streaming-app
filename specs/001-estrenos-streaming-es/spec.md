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

Una **aplicación descargable para PC y para móvil Android** que:

1. Ejecuta un **agente automático una vez por semana** que recopila los estrenos
   de la semana en las principales plataformas de streaming en España.
2. Muestra cada título con sus **notas de crítica agregadas** (IMDb, Rotten
   Tomatoes, Metacritic, TMDB) y su **género**.
3. Ofrece un **enlace verificado al tráiler en castellano de YouTube**.
4. Permite marcar títulos como **vistos** y **valorarlos con criterios
   cuantificables** con pesos configurables.

## 3. Fuera de alcance (v1)

- Reproducir contenido o integrarse con las cuentas de las plataformas.
- Publicación en Google Play o en la App Store (el APK se instala directamente).
- Aplicación para iOS.
- Recomendaciones personalizadas por IA / motor de similitud.
- Sincronización automática entre el PC y el móvil. Se puede llevar los datos de
  uno a otro con la exportación e importación (FR-037, FR-038), pero no hay
  servidor que los sincronice solo (Art. III.2).
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

**FR-041 — Aplicación descargable para PC.**
Se distribuyen instaladores para Windows (`.exe`, NSIS), macOS (`.dmg`) y Linux
(`AppImage` y `.deb`), generados desde el mismo código fuente.

**FR-042 — Primer arranque sin claves.**
La aplicación arranca y es navegable sin claves de API configuradas; solo la
recopilación queda deshabilitada, con un aviso claro.

### 5.8 Contenido de la ficha y primer arranque

**FR-048 — Reparto y dirección.**
La ficha muestra el reparto principal (hasta seis nombres) y quien dirige —o
quien crea, si es una serie—, cuando la fuente los declara. Se obtienen en la
misma petición que el resto de la ficha, sin consultas adicionales.

- *Criterio:* Dada una película cuya fuente declara reparto y dirección, cuando
  se abre su ficha, entonces aparecen ambos; y cuando no los declara, la sección
  no aparece en lugar de mostrarse vacía.

**FR-049 — Enlace a la plataforma.**
Desde la ficha se puede abrir la página del título en la plataforma donde está
disponible, en el navegador del sistema.

- *Criterio:* Dado un título con enlace de plataforma, cuando el usuario pulsa
  «Ver en <plataforma>», entonces se abre fuera de la aplicación (FR-020).

**FR-050 — Primer arranque guiado.**
Sin clave configurada y sin catálogo, la aplicación muestra una guía de tres
pasos numerados con un enlace directo a la página donde se obtiene la clave de
TMDB, un campo para pegarla y un botón para lanzar la primera recopilación.

- *Criterio:* Dado un primer arranque, cuando el usuario pega una clave válida,
  entonces se verifica, se guarda y el botón de recopilar queda habilitado sin
  tener que navegar a ninguna otra pantalla.

**FR-052 — Reconocimiento de la clave antes de usarla.**
TMDB ofrece dos credenciales en la misma página y solo una sirve aquí. La
aplicación reconoce cuál se ha pegado y, si es la que no vale, lo dice mientras
se escribe y también al fallar la verificación, en lugar de devolver un error de
autorización sin explicación.

- *Criterio:* Dado el «Read Access Token» pegado en el campo de la clave, cuando
  el usuario termina de pegarlo, entonces aparece un aviso que nombra las dos
  credenciales y dice cuál copiar.
- *Criterio:* Dada una clave de formato desconocido, cuando el usuario la
  guarda, entonces se avisa pero se intenta igualmente: el aviso es una pista,
  no una validación que impida probar.

**FR-051 — Datos de ejemplo.**
El usuario puede cargar un catálogo de ejemplo para probar los filtros y la
valoración antes de configurar nada. Los títulos de ejemplo se distinguen con
una marca visible y se pueden borrar de una vez.

- *Criterio:* Dado un catálogo vacío, cuando el usuario carga los datos de
  ejemplo, entonces aparecen títulos marcados como ejemplo y la aplicación
  advierte de que no son estrenos reales.
- *Criterio:* Dada una recopilación real posterior, cuando termina, entonces los
  títulos de ejemplo ya no están: no se mezclan con los reales.

**FR-053 — Listón de calidad del catálogo.**
El usuario puede fijar una nota mínima de la crítica por debajo de la cual los
títulos no se muestran. El listón se guarda en los ajustes y manda sobre todas
las consultas, no solo sobre la sesión en curso.

Lo que no llega al mínimo **no se borra**: sigue en el almacén, porque un
estreno sin nota esta semana puede tenerla la que viene, y la recopilación
semanal la rellena sin volver a buscarlo.

- *Criterio:* Dado un listón de 7, cuando el usuario abre la aplicación al día
  siguiente, entonces el catálogo sigue mostrando solo lo que llega a 7.
- *Criterio:* Dado un listón activo, cuando el usuario elige «cualquier nota» en
  la barra de filtros, entonces se ven todos: la elección explícita manda sobre
  el ajuste guardado.
- *Criterio:* Dados títulos ocultos por el listón, cuando el usuario mira el
  catálogo, entonces se le dice cuántos hay y puede verlos sin ir a Ajustes.
- *Criterio:* Dado un título que nadie ha puntuado todavía, cuando hay listón,
  entonces se muestra o no según la opción explícita del usuario, y nunca se
  descarta por «no llega al mínimo»: eso sería afirmar algo que no se sabe.
- *Criterio:* Dados unos ajustes guardados por una versión anterior, sin este
  campo, cuando se cargan, entonces se adopta el valor por defecto y la
  aplicación arranca con normalidad.

**FR-054 — «Me interesa verla».**
El usuario puede marcar un título como pendiente de ver, desde la tarjeta y
desde la ficha, y filtrar el catálogo por los marcados. Es una intención, no un
juicio: convive con la valoración sin mezclarse con ella.

- *Criterio:* Dado un título sin marcar, cuando el usuario pulsa el botón,
  entonces queda marcado y aparece con el filtro «solo las que me interesan».
- *Criterio:* Dado un título marcado, cuando el usuario lo marca como visto,
  entonces sale de la lista de pendientes: verlo cumple la intención.
- *Criterio:* Dado un título que se desmarca como visto, cuando se consulta la
  lista, entonces **no** vuelve a aparecer: si sigue interesando, se marca otra
  vez. Resucitarlo sería adivinar.
- *Criterio:* Dado un título ya visto, cuando se mira su tarjeta, entonces el
  botón de interés no está: una lista de pendientes no admite algo ya visto.
- *Criterio:* Dadas valoraciones guardadas por una versión anterior, sin este
  campo, cuando se cargan, entonces se leen como «no marcada».

**FR-055 — Búsqueda por más de un término y por más de un campo.**
El buscador mira el título en castellano y el original, el género, la
plataforma, el reparto, la dirección, el año y el tipo. Todas las palabras
escritas deben aparecer, aunque sea en campos distintos.

La sinopsis queda fuera a propósito: con ella dentro, buscar una palabra común
devolvería medio catálogo y el buscador dejaría de servir para encontrar algo
concreto.

- *Criterio:* Dado «netflix terror», cuando se busca, entonces salen los
  títulos de terror disponibles en Netflix, y no los de terror de otra
  plataforma ni las comedias de Netflix.
- *Criterio:* Dado el nombre de un actor con tilde escrito sin ella, cuando se
  busca, entonces el título aparece igualmente.

**FR-056 — Enlace a la plataforma desde cada título.**
Cada título ofrece, para cada plataforma donde está disponible, un enlace que
lleva a esa plataforma con el título ya buscado. El texto del botón dice lo que
el enlace hace de verdad: «Buscar en X» cuando abre su buscador, «Abrir X»
cuando solo se puede abrir la portada (ADR-018).

- *Criterio:* Dada una película en Netflix, cuando el usuario pulsa la etiqueta
  «Netflix» de su tarjeta, entonces se abre el buscador de Netflix con el
  título escrito.
- *Criterio:* Dada una plataforma sin ruta de búsqueda conocida, cuando se
  ofrece su enlace, entonces se abre su portada y el botón **no** promete una
  búsqueda.
- *Criterio:* Dada la página de TMDB que lista dónde ver el título, cuando se
  muestra, entonces aparece **una sola vez** y con su nombre, no repetida bajo
  el nombre de cada plataforma.
- *Criterio:* Dada una plataforma sin dirección declarada, cuando se pide su
  enlace, entonces no se ofrece ninguno en lugar de inventarse uno.

**FR-057 — Sección propia de «Me interesa».**
La lista de lo apuntado tiene su propia entrada en la navegación, con el número
de títulos pendientes, y no depende de recordar un filtro.

- *Criterio:* Dada la sección, cuando se abre, entonces muestra todos los
  títulos marcados y todavía sin ver, de todas las semanas.
- *Criterio:* Dado un listón de calidad activo (FR-053), cuando se abre la
  sección, entonces se ven **también** los títulos que no llegan al mínimo: el
  usuario los apuntó a mano y el listón no puede contradecirlo.
- *Criterio:* Dado que se sale de la sección, cuando se vuelve a «Esta semana»,
  entonces el filtro de la lista ya no se aplica.

**FR-058 — Las mejores de un año.**
La aplicación puede listar las diez mejores películas y las diez mejores series
de un año concreto, entre las disponibles en las plataformas activas en España.

La nota es la **media simple de IMDb, Rotten Tomatoes y TMDB**, no el índice de
crítica del catálogo (FR-026), que pondera cuatro fuentes. Son dos números
distintos y cada pantalla dice cuál está enseñando.

- *Criterio:* Dado un año, cuando se calcula, entonces salen dos listas
  numeradas con el título, la nota sobre 10 y, entre paréntesis, la plataforma.
- *Criterio:* Dado un título sin alguna de las tres notas, cuando entra en la
  lista, entonces la media se calcula sobre las presentes y se marca que no son
  tres: lo ausente nunca cuenta como cero.
- *Criterio:* Dado un título con una sola de las tres notas, cuando se ordena,
  entonces queda fuera: con una fuente no hay media.
- *Criterio:* Dado que se consulta un año, cuando termina, entonces el catálogo
  del usuario **no** cambia: una clasificación se consulta, no se recopila.
- *Criterio:* Dado el coste en cuota diaria de OMDb, cuando se va a consultar,
  entonces se advierte antes de gastar.

### 5.9 Android

**FR-043 — Aplicación para Android.**
Se distribuye un APK instalable en un móvil Android, con las mismas funciones
que la versión de PC: recopilación semanal, notas, géneros, tráiler, marcar
como visto y valorar por criterios.

- *Criterio:* Dada una versión ya instalada, cuando el usuario instala una
  posterior, entonces se instala **encima**, conservando claves y valoraciones:
  los APK publicados se firman siempre con la misma clave (ADR-017).
- *Criterio:* Dado un móvil con Android 8 o superior, cuando se instala el APK y
  se configura la clave de TMDB, entonces la recopilación funciona y los
  estrenos aparecen igual que en el PC.

**FR-044 — Misma lógica en ambas plataformas.**
El PC y Android comparten el núcleo y la interfaz. Solo cambian las piezas que
dependen del sistema: almacenamiento, peticiones de red y guardado de claves.

- *Criterio:* Dado un cambio en el cálculo de la nota personal, cuando se
  compila para ambas plataformas, entonces ninguna de las dos necesita un cambio
  adicional para comportarse igual.

**FR-045 — Interfaz adaptada al móvil.**
En pantallas estrechas la interfaz se reorganiza: navegación inferior en lugar
de barra lateral, rejilla de dos columnas, ficha a pantalla completa y controles
con área táctil suficiente.

- *Criterio:* Dada una pantalla de 360 px de ancho, cuando se abre la lista de
  estrenos, entonces no hay desbordamiento horizontal y todos los controles son
  pulsables con el dedo.

**FR-046 — Recopilación en Android sin servicio en segundo plano.**
Android restringe la ejecución en segundo plano, así que en el móvil la
ejecución vencida se lanza al abrir la aplicación o al volver a ella, nunca con
el teléfono guardado en el bolsillo. El usuario puede lanzarla a mano en
cualquier momento.

- *Criterio:* Dado un `nextRunAt` vencido, cuando el usuario vuelve a la
  aplicación tras tenerla en segundo plano, entonces se lanza una única
  ejecución.

**FR-047 — Claves de API en Android.**
Las claves se guardan en el almacenamiento privado de la aplicación, al que no
acceden otras aplicaciones. La interfaz indica con qué nivel de protección están
guardadas en cada plataforma, sin prometer más de lo que hay.

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
| **NFR-011** | El núcleo no usa APIs exclusivas de Node: se ejecuta igual en Node y en un navegador | Prueba que falla si aparece un `import` de `node:` en `src/core` |
| **NFR-012** | La interfaz funciona desde 360 px de ancho sin desbordamiento horizontal | Prueba de los puntos de ruptura y revisión manual en móvil |
| **NFR-013** | La interfaz se monta y **sigue en pie** cargando el paquete compilado por HTTP sin precargador, como en Android | Prueba de humo que carga `dist/renderer`, espera a que pasen los efectos y comprueba que la aplicación no se ha caído |
| **NFR-014** | Las etapas que hacen una petición por título procesan varios a la vez, sin rebasar el límite del cliente HTTP, y el resultado es **idéntico** al del recorrido secuencial: mismo catálogo, mismas cuentas y mismas incidencias en el mismo orden | Ejecución completa de la tubería con latencias invertidas, comparada contra el recorrido de uno en uno |

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
- **A-005** En Android las peticiones salen por el cliente HTTP nativo del
  contenedor, no por el del navegador incrustado, de modo que las políticas de
  origen cruzado de los terceros no afectan a la aplicación.

## 8. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Cambio de identificadores de proveedor | Plataformas vacías | FR-006, resolución dinámica por nombre |
| Cuota de OMDb agotada (1 000/día en el plan gratuito) | Faltan notas | Caché persistente, priorización por novedad, degradación a `partial` |
| Ausencia de tráiler en castellano | Requisito incumplido | FR-018, enlace de búsqueda de respaldo |
| Cobertura incompleta del catálogo de una plataforma | Faltan estrenos | Documentado; el informe expone el recuento por plataforma |
| Bloqueo de red corporativa | Agente inoperante | Fallo explícito en el informe, la app sigue navegable con datos previos |
