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

---

## ADR-016 — Las etapas por título van en paralelo acotado

**Contexto.** Tres de las cinco etapas hacen una petición por título:
enriquecimiento de ficha, notas de crítica y comprobación de tráileres. Estaban
escritas con un `for … await` dentro, o sea de una en una. Una primera
recopilación real ronda el millar de peticiones entre las cuatro plataformas,
así que a ~300 ms cada una salían unos cinco minutos de espera.

El detalle que lo convierte en problema, y no en una simple molestia, es
Android: por ADR-015 la recopilación corre en primer plano, mientras el usuario
mira la pantalla. Cinco minutos de primer plano es pedirle demasiado al usuario
y al sistema, que estrangula la vista web en cuanto la aplicación pasa atrás.

Mientras tanto, el `HttpClient` traía desde el principio un limitador de cuatro
peticiones simultáneas (NFR-003) que **nunca llegó a usarse**: sin nadie que
pidiera dos cosas a la vez, el semáforo estaba siempre abierto.

**Decisión.** Las tres etapas recorren sus títulos con `mapWithConcurrency`, un
ayudante del núcleo que mantiene como mucho N trabajos en vuelo. N por defecto
es 4, el mismo número que el limitador del cliente HTTP: pedir más solo llenaría
su cola sin acelerar nada, y apretar a un tercero gratuito no es de recibo
(Art. V).

**Alternativas descartadas.**

- *`Promise.all` a pelo.* Lanzaría las ~300 peticiones de golpe. El limitador
  del cliente las encolaría, sí, pero con 300 promesas vivas y 300 tiempos de
  espera corriendo a la vez; en un móvil eso es pedir problemas.
- *Subir el límite del cliente HTTP.* No hacía falta: el cuello de botella no
  era el límite, era que nadie lo alcanzaba.

**Lo que no puede cambiar.** Ir en paralelo no puede alterar el resultado
(Art. VII). Dos invariantes lo garantizan y las dos están probadas:

1. **Orden de entrada.** `mapWithConcurrency` devuelve los resultados alineados
   con la entrada, no con la llegada. El catálogo y el orden de `ctx.titles`
   quedan igual que cuando se recorría de uno en uno.
2. **Informe reproducible.** Cada trabajo escribe sus incidencias en su propia
   bolsa (`IssueBag`) y la etapa las vuelca al final en el orden de entrada. El
   informe se lee igual aunque las respuestas lleguen al revés.

A eso se añade una tercera regla, de honradez más que de orden: si un trabajo
falla, los que ya estaban en vuelo **terminan** antes de propagar el error.
Abandonar peticiones a medias es justo lo que deja un informe diciendo que hizo
cosas que no llegó a hacer.

**Escrituras.** La revalidación de tráileres (FR-019) comprueba en paralelo pero
escribe en el catálogo después y en orden. La red admite desorden; el almacén no
tiene por qué sufrirlo.

**Consecuencia medible.** La primera recopilación pasa de recorrer las
peticiones de una en una a hacerlo de cuatro en cuatro. El número de peticiones
no cambia —se comprueba en las pruebas—, solo el tiempo que se tarda en
gastarlas.

---

## ADR-017 — Clave de firma fija y versionada para el APK

**Contexto.** Android identifica una aplicación por su paquete **y su firma**.
Una actualización solo se instala encima de la anterior si va firmada con la
misma clave; si la firma cambia, el sistema se niega y solo queda desinstalar,
que borra los datos del usuario.

El contenedor de Android que genera Capacitor no trae clave: Gradle fabrica una
de depuración al vuelo la primera vez que la necesita. En una máquina de
desarrollo eso pasa una vez y la clave persiste. En un ejecutor de CI, que nace
limpio en cada ejecución, **pasa cada vez**.

Se comprobó sobre los APK ya publicados, comparando el certificado de cada uno:

```
v1.0.1  58bc9a98…
v1.1.0  eb803274…
v1.1.1  757c8887…
v1.2.0  67ca63d1…
```

Cuatro versiones, cuatro firmas distintas. Ninguna se podía instalar encima de
otra. El fallo estuvo presente desde la primera entrega y no lo detectó nadie
porque las pruebas comprueban lo que hace la aplicación, no lo que hace el
instalador del sistema operativo.

**Decisión.** Se versiona una clave de firma en el repositorio
(`android/estrenos-debug.keystore`) y el tipo de compilación `debug` la usa
explícitamente. Todos los APK publicados pasan a compartir firma.

**Sobre la contraseña a la vista.** Es la convención de las claves de depuración
de Android (`android`), y está ahí a propósito: esta clave no protege nada, solo
da **continuidad de identidad**. Lo que concede a quien la tenga es poder
compilar un APK que Android aceptaría como actualización de este; para una
aplicación que se instala a mano desde una publicación de GitHub, y no desde una
tienda, el intercambio es asumible y se declara aquí en lugar de disimularlo.

**Lo que no resuelve.** La firma de publicación de verdad —clave secreta fuera
del repositorio, guardada como secreto del repositorio— sigue siendo la tarea
T093, y es requisito si algún día esto va a una tienda.

**Consecuencia inmediata para quien ya tenga la aplicación.** La versión
instalada lleva una de las firmas viejas, así que la primera actualización
todavía obliga a desinstalar. A partir de ahí, todas las siguientes se instalan
encima.

---

## ADR-018 — Enlace a la plataforma: búsqueda, no ficha, y dicho así

**Contexto.** Se pide un enlace que lleve de un título a ese título dentro de su
plataforma. Al ir a implementarlo aparecen dos límites duros.

El primero es de la fuente. TMDB devuelve en `watch/providers` **un solo**
`link` por región: una página suya que lista dónde ver el título. No hay en la
respuesta nada parecido a «la dirección de esta película en Netflix». Peor: la
implementación anterior copiaba ese mismo enlace en cada plataforma y la interfaz
pintaba un botón «Ver en Netflix», otro «Ver en Prime Video», y los dos llevaban
a la misma página de TMDB. El botón mentía sobre su destino.

El segundo es de las plataformas. Ninguna publica un esquema de direcciones que
se pueda derivar de un identificador de TMDB. Construir una ruta a la ficha
sería inventarla.

**Decisión.** Tres niveles, cada uno con el texto que le corresponde:

1. **Buscador de la plataforma**, donde se conoce una ruta estable: se abre con
   el título ya escrito y el botón dice «🔎 Buscar en Netflix». Es un clic más,
   pero acaba en el sitio correcto.
2. **Portada de la plataforma**, donde no se conoce: «Abrir HBO Max». Una
   portada no lleva el título dentro, porque fingir una búsqueda que no existe
   es peor que no ofrecerla.
3. **Página de TMDB**, una vez y con su nombre: «Ver opciones en TMDB». Es
   información real de la fuente, y ahí sí hay enlaces de verdad a cada
   plataforma.

Es el mismo criterio que ya se aplicaba al tráiler: cuando no hay enlace
verificado, se ofrece la búsqueda y se llama búsqueda (FR-018, Art. IV.3).

**Lo que no se ha podido comprobar, y consta.** Los prefijos de búsqueda no se
han probado contra los servidores de cada plataforma. El inventario de destinos
de red está cerrado a cuatro anfitriones (ADR-010) y ninguna de estas lo es, así
que desde el entorno de desarrollo no se puede abrir ninguna. Van escritos con
la certeza de cada caso y donde no la hay se cae a la portada. Si una ruta
cambia, el arreglo es una línea en `core/domain/platform-links.ts`, y las
pruebas garantizan que ninguna plataforma del catálogo se quede sin enlace.

**Por qué vive aparte de `platforms.ts`.** Aquello son datos del dominio
—identificador, alias, color— que cambian poco. Esto son direcciones de terceros
que cambian sin avisar. Separarlas deja claro qué parte es estable y qué parte
hay que revisar cuando algo deje de funcionar.
