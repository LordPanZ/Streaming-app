# Guía de arranque — 001

## 1. Requisitos

- Node.js 20 o superior (probado con 22)
- npm 10 o superior
- Para empaquetar en macOS o Windows, hay que ejecutar el empaquetado en ese
  mismo sistema operativo

## 2. Claves de API

Ambas son gratuitas y personales. La aplicación **no** incluye claves.

| Servicio | Dónde se obtiene | Para qué |
|---|---|---|
| TMDB | themoviedb.org → Ajustes → API → solicitar clave | Catálogo, plataformas, géneros, vídeos |
| OMDb | omdbapi.com/apikey.aspx → plan gratuito (1 000/día) | IMDb, Rotten Tomatoes, Metacritic |

En la aplicación se introducen en **Ajustes → Claves de API**. Se guardan
cifradas con el almacén del sistema operativo y no salen nunca del equipo.

## 3. Desarrollo

```bash
npm ci
npm run dev          # Vite + Electron con recarga en caliente
npm test             # todas las pruebas, sin red y sin claves
npm run typecheck    # comprobación estricta de tipos
npm run lint
```

## 4. Ejecutar el agente sin interfaz

```bash
export TMDB_API_KEY=...
export OMDB_API_KEY=...
npm run agent -- --data-dir ./datos-agente --lookback-days 7
```

Parámetros: `--data-dir`, `--lookback-days`, `--grace-days`,
`--platforms netflix,disney-plus`, `--dry-run`, `--json`.

## 5. Generar la aplicación descargable para PC

```bash
npm run build            # compila núcleo, proceso principal e interfaz
npm run package          # instalador para el sistema operativo actual
npm run package:all      # todos los destinos compatibles desde este sistema
```

Los artefactos aparecen en `release/`:

| Sistema | Artefacto |
|---|---|
| Windows | `Estrenos-ES-Setup-<versión>.exe` |
| macOS | `Estrenos-ES-<versión>.dmg` (x64 y arm64) |
| Linux | `Estrenos-ES-<versión>.AppImage`, `estrenos-es_<versión>_amd64.deb` |

## 5 bis. Generar el APK de Android

Requisitos adicionales: JDK 21 y el SDK de Android (lo más cómodo, Android
Studio, que instala ambos).

```bash
npm run build:android          # compila la interfaz y la sincroniza
cd android && ./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`. Va firmado
con la clave de depuración: sirve para instalarlo en un móvil propio, no para
publicarlo en una tienda.

También lo construye el flujo `.github/workflows/android.yml` al etiquetar una
versión, sin necesidad de instalar nada en local.

Para depurar con el móvil conectado:

```bash
npm run android:open           # abre el proyecto en Android Studio
```

### Diferencias del móvil respecto al PC

| | PC | Android |
|---|---|---|
| Recopilación semanal | Temporizador cada 15 minutos | Al abrir la aplicación o volver a ella (ADR-015) |
| Claves de API | Almacén cifrado del sistema | Preferencias privadas de la aplicación (FR-047) |
| Escritura de datos | `rename` atómico | Copia de seguridad previa (ADR-013) |
| Importar datos | Diálogo de archivos | Último paquete exportado en Documentos (T098) |

## 6. Primer uso

1. Abrir la aplicación. Sin claves configuradas es navegable, pero la
   recopilación está desactivada y se avisa de ello (FR-042).
2. Ajustes → Claves de API → introducir ambas → **Verificar**.
3. Ajustes → Plataformas → activar las que interesen.
4. Ajustes → Calendario → elegir día y hora de la ejecución semanal.
5. Pulsar **Actualizar ahora** para la primera recopilación.

## 7. Dónde viven los datos

| Sistema | Ruta |
|---|---|
| Windows | `%APPDATA%\estrenos-es\estrenos-es\` |
| macOS | `~/Library/Application Support/estrenos-es/estrenos-es/` |
| Linux | `~/.config/estrenos-es/estrenos-es/` |
| Android | Almacenamiento privado de la aplicación, carpeta `estrenos-es` |

Copiar esa carpeta es una copia de seguridad completa. **Ajustes → Datos**
permite exportar a un único JSON, importar y borrar todo.
