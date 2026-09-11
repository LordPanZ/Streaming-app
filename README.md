# Estrenos ES

Aplicación **para PC y para móvil Android** que reúne cada semana los estrenos de
las principales plataformas de streaming en España, con sus notas de crítica, su
género y un enlace verificado al tráiler en castellano, y que te deja marcar lo
que has visto y valorarlo con criterios cuantificables.

Se construye siguiendo **desarrollo dirigido por especificación (SDD)**: primero
la especificación, después el plan, después el código, y una matriz que demuestra
que cada requisito tiene una prueba detrás.

---

## Qué hace

**Un agente que corre una vez por semana.** El día y la hora los eliges tú. Si la
aplicación estaba cerrada a esa hora, la ejecución pendiente se lanza al abrirla,
y solo una vez: tres semanas perdidas no provocan tres recopilaciones.

**Doce plataformas en España.** Netflix, Prime Video, Disney+, HBO Max, Movistar
Plus+, Apple TV+, SkyShowtime, Filmin, Crunchyroll, atresplayer, Rakuten TV y
Pluto TV. Cada una se puede activar o desactivar.

**Notas de cuatro fuentes.** IMDb, Rotten Tomatoes, Metacritic y TMDB, con un
índice agregado de 0 a 10 que dice **cuántas fuentes lo respaldan**. Una nota que
no existe se muestra como «sin datos»: nunca se sustituye por un cero.

**Géneros en castellano**, filtrables.

**Quién está detrás.** Reparto principal y dirección —o creación, en las
series—, en la misma petición que el resto de la ficha: ni una consulta de más.

**Empezar sin fricción.** El primer arranque te lleva de la mano en tres pasos
hasta la clave, con el enlace exacto donde se pide. Y si prefieres verla por
dentro antes de registrarte en nada, hay un catálogo de ejemplo: diez títulos
inventados, marcados como tales, que desaparecen solos en cuanto llega la
primera recopilación real. Nunca se mezclan con los estrenos de verdad.

**Tráiler en castellano verificado.** Se busca el tráiler en `es-ES`, y el enlace
se comprueba contra YouTube antes de presentarlo. Si el vídeo se ha retirado, se
dice y se ofrece una búsqueda de respaldo, en vez de dejar un enlace roto.

**Valoración con criterios cuantificables.** Siete criterios de fábrica —guion,
interpretaciones, dirección, fotografía, banda sonora, ritmo e impacto— cada uno
de 0 a 10 en pasos de medio punto y con su peso configurable. Puedes puntuar solo
algunos: los que dejes en blanco no cuentan como cero, simplemente no entran en
la media. La ficha te muestra tu nota frente a la de la crítica.

**Tus datos son tuyos.** Todo se guarda en tu equipo. No hay servidores propios,
no hay telemetría y las claves de API se cifran con el almacén del sistema
operativo. Puedes exportarlo todo a un JSON o borrarlo por completo.

---

## Instalación

Descarga el archivo de tu sistema desde
[la última publicación](https://github.com/LordPanZ/Streaming-app/releases/latest):

| Sistema | Archivo |
|---|---|
| Windows | `Estrenos-ES-Setup-<versión>.exe` |
| macOS | `Estrenos-ES-<versión>-<arquitectura>.dmg` |
| Linux | `Estrenos-ES-<versión>.AppImage` o `.deb` |
| Android | `app-debug.apk` |

Los instaladores de macOS y Windows aún no están firmados, así que el sistema
mostrará un aviso la primera vez. Es trabajo pendiente ([T093](specs/001-estrenos-streaming-es/tasks.md)).

### En el móvil Android

El APK no está en Google Play: se instala directamente. Android pedirá permiso
para instalar aplicaciones de origen desconocido la primera vez.

1. Copia el `.apk` al móvil (o descárgalo desde el navegador del teléfono).
2. Ábrelo y acepta la instalación.
3. Configura tus claves en **Ajustes**, igual que en el PC.

Va firmado con la clave de depuración, que sirve para instalarlo en tu propio
móvil pero no para publicarlo en una tienda.

**Qué cambia respecto al PC.** Android no deja correr trabajos en segundo plano
sin permisos que aquí no merecen la pena, así que la recopilación semanal se
lanza **al abrir la aplicación** si ya tocaba, en lugar de sola con el teléfono
en el bolsillo. Si no la abres en tres semanas, al abrirla obtienes una sola
recopilación, no tres. Y las claves de API se guardan en el almacenamiento
privado de la aplicación, que Android aísla de otras aplicaciones, pero sin el
cifrado del sistema que sí hay en el PC; la app lo dice en Ajustes en lugar de
prometer más de lo que hay.

### Claves de API

La aplicación **no incluye claves**: usas las tuyas, gratuitas y personales.

| Servicio | Dónde se pide | Para qué | ¿Obligatoria? |
|---|---|---|---|
| [TMDB](https://www.themoviedb.org/settings/api) | Ajustes → API. **Copia la «API Key (v3 auth)»**, de 32 caracteres; el «Read Access Token» que empieza por `eyJ` no sirve aquí | Catálogo, plataformas, géneros y tráileres | Sí |
| [OMDb](https://www.omdbapi.com/apikey.aspx) | Plan gratuito, 1 000 consultas al día | IMDb, Rotten Tomatoes y Metacritic | No, pero sin ella solo verás la nota de TMDB |

Se introducen en **Ajustes → Claves de API**, hay un botón para verificar cada
una, y no salen nunca de tu equipo.

---

## Desarrollo

```bash
npm ci
npm run dev        # Vite + Electron con recarga en caliente
npm test           # 395 pruebas, sin red y sin claves
npm run check      # tipos + estilo + pruebas
npm run package    # instalador de escritorio para el sistema actual

npm run build:android   # compila la interfaz y la sincroniza con el contenedor
npm run android:open    # abre el proyecto en Android Studio
```

Para generar el APK hacen falta un JDK 21 y el SDK de Android:

```bash
npm run build:android
cd android && ./gradlew assembleDebug
# android/app/build/outputs/apk/debug/app-debug.apk
```

También lo construye el flujo `.github/workflows/android.yml` al etiquetar una
versión, y el APK queda entre los artefactos de la ejecución.

### Ejecutar el agente sin interfaz

El mismo agente, sin ventana. Útil para programarlo en un servidor o en
integración continua.

```bash
export TMDB_API_KEY=...
export OMDB_API_KEY=...
npm run agent -- --data-dir ./datos --lookback-days 7
```

El repositorio incluye un flujo de GitHub Actions
(`.github/workflows/weekly-agent.yml`) que lo ejecuta cada lunes si configuras
los secretos `TMDB_API_KEY` y `OMDB_API_KEY`.

---

## Cómo está hecho

```
.specify/memory/constitution.md      Reglas que ninguna decisión puede contradecir
specs/001-estrenos-streaming-es/     Especificación, plan, decisiones y trazabilidad
src/core/                            Núcleo: TypeScript puro, sin Electron, Node ni DOM
  domain/                            Plataformas, criterios, notas, semanas, filtros
  providers/                         TMDB, OMDb, YouTube y el cliente HTTP
  store/                             Documentos JSON sobre un almacenamiento inyectado
  agent/                             Tubería semanal de cinco etapas
  app/                               Contenedor y servicio comunes a las dos plataformas
src/platform/node/                   Almacenamiento con escritura atómica (PC)
src/platform/capacitor/              Almacenamiento, claves y arranque (Android)
src/main/ + src/preload/             Proceso principal de Electron y puente aislado
src/renderer/                        Interfaz en React, la misma en PC y en móvil
android/                             Proyecto del contenedor de Android
tests/                               Unitarias, de contrato, de arquitectura y de seguridad
```

El PC y el móvil comparten el núcleo y la interfaz enteros. Lo único distinto es
lo que toca el sistema:

|  | PC (Electron) | Android (Capacitor) |
|---|---|---|
| Almacenamiento | Archivos con `rename` atómico | Contenedor, con copia de seguridad previa |
| Claves | Almacén cifrado del sistema | Preferencias privadas de la aplicación |
| Peticiones | `fetch` de Node | Cliente HTTP nativo |
| Llamadas de la interfaz | Canal IPC al proceso principal | El mismo servicio, en el mismo proceso |
| Ejecución semanal | Temporizador cada 15 minutos | Al abrir la aplicación o volver a ella |

Tres decisiones que explican casi todo lo demás:

- **El núcleo no conoce Electron, ni Node, ni el navegador** (Art. II de la
  constitución). Hay pruebas que fallan si alguien importa `electron`, `react`,
  un módulo `node:` o toca `window` desde `src/core`. Gracias a eso el mismo
  código corre en el PC, en la consola y dentro de la vista web de Android:
  llevarlo al móvil fueron cuatro líneas de dependencia que sacar, no una
  reescritura.
- **Un fallo parcial no tumba la ejecución** ([ADR-006](specs/001-estrenos-streaming-es/research.md)).
  Si OMDb se cae, los títulos se guardan con la nota de TMDB y el informe dice
  exactamente qué falló. La interfaz distingue «no hay estrenos esta semana» de
  «la recopilación falló».
- **Nunca se afirma lo que no se ha comprobado** (Art. IV). Un tráiler solo se
  marca como vivo si YouTube lo confirma; si no se pudo comprobar, se dice
  «sin verificar», que no es lo mismo que «roto».

La especificación completa está en
[`specs/001-estrenos-streaming-es/spec.md`](specs/001-estrenos-streaming-es/spec.md)
y la matriz que relaciona cada requisito con su prueba, en
[`traceability.md`](specs/001-estrenos-streaming-es/traceability.md), donde
también constan los requisitos que **aún no** tienen cobertura automática.

---

## Fuentes de datos

Los datos vienen de [TMDB](https://www.themoviedb.org/) y
[OMDb](https://www.omdbapi.com/). Este producto usa la API de TMDB pero no está
avalado ni certificado por TMDB. La aplicación enlaza a contenido oficial: no
aloja, no descarga y no reproduce nada con derechos.

## Licencia

MIT.
