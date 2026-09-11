# Estrenos ES

Aplicación de escritorio que reúne cada semana los estrenos de las principales
plataformas de streaming en España, con sus notas de crítica, su género y un
enlace verificado al tráiler en castellano, y que te deja marcar lo que has
visto y valorarlo con criterios cuantificables.

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

Descarga el instalador de tu sistema desde la página de publicaciones del
repositorio:

| Sistema | Archivo |
|---|---|
| Windows | `Estrenos-ES-Setup-<versión>.exe` |
| macOS | `Estrenos-ES-<versión>-<arquitectura>.dmg` |
| Linux | `Estrenos-ES-<versión>.AppImage` o `.deb` |

Los instaladores de macOS y Windows aún no están firmados, así que el sistema
mostrará un aviso la primera vez. Es trabajo pendiente ([T093](specs/001-estrenos-streaming-es/tasks.md)).

### Claves de API

La aplicación **no incluye claves**: usas las tuyas, gratuitas y personales.

| Servicio | Dónde se pide | Para qué | ¿Obligatoria? |
|---|---|---|---|
| [TMDB](https://www.themoviedb.org/settings/api) | Ajustes → API | Catálogo, plataformas, géneros y tráileres | Sí |
| [OMDb](https://www.omdbapi.com/apikey.aspx) | Plan gratuito, 1 000 consultas al día | IMDb, Rotten Tomatoes y Metacritic | No, pero sin ella solo verás la nota de TMDB |

Se introducen en **Ajustes → Claves de API**, hay un botón para verificar cada
una, y no salen nunca de tu equipo.

---

## Desarrollo

```bash
npm ci
npm run dev        # Vite + Electron con recarga en caliente
npm test           # 335 pruebas, sin red y sin claves
npm run check      # tipos + estilo + pruebas
npm run package    # instalador para el sistema actual
```

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
src/core/                            Núcleo: TypeScript puro, sin Electron ni DOM
  domain/                            Plataformas, criterios, notas, semanas, filtros
  providers/                         TMDB, OMDb, YouTube y el cliente HTTP
  store/                             Persistencia JSON con escritura atómica
  agent/                             Tubería semanal de cinco etapas
src/main/                            Proceso principal de Electron
src/preload/                         Puente aislado hacia la interfaz
src/renderer/                        Interfaz en React
tests/                               Unitarias, de contrato, de arquitectura y de seguridad
```

Tres decisiones que explican casi todo lo demás:

- **El núcleo no conoce Electron ni el navegador** (Art. II de la constitución).
  Hay una prueba que falla si alguien importa `electron`, `react` o toca
  `window` desde `src/core`. Gracias a eso, el agente corre igual dentro de la
  aplicación que desde la consola, sin código duplicado.
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
