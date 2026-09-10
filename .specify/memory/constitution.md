# Constitución del proyecto — Estrenos ES

> Documento normativo. Toda decisión de diseño, plan o tarea que contradiga este
> documento es inválida hasta que la constitución se enmiende explícitamente.
> Versión: 1.0.0 · Ratificada: 2026-09-10

## Artículo I — La especificación es la fuente de verdad

1. Ningún cambio de comportamiento entra en `src/` sin un requisito identificado
   (`FR-###` / `NFR-###`) en `specs/001-estrenos-streaming-es/spec.md`.
2. Si el código y la especificación discrepan, el defecto está en el código,
   salvo que se enmiende la especificación primero (con nota de cambio).
3. Cada requisito tiene al menos un criterio de aceptación verificable y al menos
   una prueba automatizada que lo cubre. La matriz `traceability.md` lo demuestra.

## Artículo II — Núcleo puro y aislado

1. `src/core/**` no importa Electron, React, ni ningún API de navegador.
   Es TypeScript ejecutable en Node puro y comprobable sin arrancar la app.
2. Todo acceso a red se realiza a través de una función `fetch` inyectada
   (`HttpClient`). Ninguna capa de dominio construye una petición por su cuenta.
3. Todo acceso a disco se realiza a través de la interfaz de almacenamiento.
   El dominio no conoce rutas.

## Artículo III — Los datos del usuario son del usuario

1. Los datos personales (vistos, valoraciones, notas) se guardan **solo** en la
   máquina del usuario, en su directorio de datos de aplicación.
2. La app no envía telemetría. No hay analítica. No hay servidores propios.
3. Las claves de API se guardan cifradas con el almacén del sistema operativo
   (`safeStorage`). Nunca se escriben en el repositorio, ni en logs, ni en los
   informes de ejecución del agente.
4. El usuario puede exportar todos sus datos a JSON y borrarlos por completo.

## Artículo IV — Degradación honesta

1. Una fuente de datos caída **no** puede tumbar una ejecución del agente.
   Cada etapa registra su fallo, continúa, y el informe refleja la degradación.
2. La interfaz nunca inventa un dato ausente. Si no hay nota de IMDb, se muestra
   "sin datos", no un cero ni un valor estimado.
3. Un enlace de tráiler se marca como `live` únicamente si ha sido verificado
   contra el proveedor. Sin verificación, se marca `unverified`, nunca `live`.

## Artículo V — Terceros con respeto

1. Se respetan los límites de tasa de cada API con reintentos y espera
   exponencial. Nunca se paraleliza sin límite.
2. Se cachean las respuestas para no repetir peticiones idénticas entre semanas.
3. La app enlaza a contenido oficial (páginas de plataforma, YouTube). No aloja,
   no descarga y no reproduce contenido con derechos.

## Artículo VI — Seguridad de la aplicación de escritorio

1. `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true` en todo
   `BrowserWindow`. Sin excepciones.
2. El proceso de renderizado accede al sistema exclusivamente por un canal IPC
   tipado y validado en el proceso principal. Toda entrada IPC se valida.
3. La navegación externa y `window.open` se abren en el navegador del sistema,
   nunca dentro de la app.

## Artículo VII — Reproducibilidad

1. `npm ci && npm test` debe pasar en un clon limpio sin claves de API.
2. Las pruebas no dependen de la red. Las respuestas de terceros viven en
   `tests/fixtures/` como capturas literales de los contratos.
3. El empaquetado es determinista y está descrito en `electron-builder.yml`.

## Enmiendas

Se enmienda mediante PR que modifique este archivo, incremente la versión
semántica de la cabecera y justifique el cambio en `specs/**/research.md`.
