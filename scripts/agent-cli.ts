/**
 * Ejecutor desatendido del agente (FR-010, ADR-011).
 *
 * Comparte el contenedor con la aplicación de escritorio, así que no puede
 * divergir de comportamiento. Las claves salen de variables de entorno y el
 * almacén apunta a donde diga `--data-dir`.
 *
 *   TMDB_API_KEY=... OMDB_API_KEY=... npm run agent -- --data-dir ./datos
 */

import { AppContainer } from '../src/core/app/container';
import type { RunOptions } from '../src/core/agent/pipeline';
import { PLATFORMS } from '../src/core/domain/platforms';
import { NodeFileStorage } from '../src/platform/node/node-storage';

interface CliOptions {
  dataDir: string;
  lookbackDays?: number;
  graceDays?: number;
  platforms?: string[];
  dryRun: boolean;
  json: boolean;
  help: boolean;
}

const HELP = `
Agente de estrenos de streaming en España — modo desatendido

  node dist/main/agent-cli.cjs [opciones]

Opciones
  --data-dir <ruta>        Directorio de datos (por defecto ./datos-agente)
  --lookback-days <n>      Días hacia atrás que se consultan (por defecto, los ajustes)
  --grace-days <n>         Margen para altas tardías del catálogo
  --platforms a,b,c        Solo estas plataformas (identificadores internos)
  --dry-run                Recopila sin escribir nada en el catálogo
  --json                   Vuelca el informe completo en JSON
  --help                   Muestra esta ayuda

Variables de entorno
  TMDB_API_KEY   Obligatoria. Sin ella la ejecución falla.
  OMDB_API_KEY   Opcional. Sin ella no hay notas de IMDb, Rotten Tomatoes ni Metacritic.

Plataformas disponibles
  ${PLATFORMS.map((p) => p.id).join(', ')}
`;

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = { dataDir: './datos-agente', dryRun: false, json: false, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    switch (arg) {
      case '--data-dir':
        if (next) options.dataDir = next;
        i += 1;
        break;
      case '--lookback-days':
        if (next) options.lookbackDays = Number(next);
        i += 1;
        break;
      case '--grace-days':
        if (next) options.graceDays = Number(next);
        i += 1;
        break;
      case '--platforms':
        if (next) options.platforms = next.split(',').map((value) => value.trim()).filter(Boolean);
        i += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        break;
    }
  }

  return options;
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(HELP);
    return 0;
  }

  const tmdbKey = process.env.TMDB_API_KEY ?? '';
  if (!tmdbKey) {
    console.error('Falta TMDB_API_KEY. Sin ella no se puede recopilar nada.');
    return 2;
  }
  const omdbKey = process.env.OMDB_API_KEY ?? '';
  if (!omdbKey) {
    console.warn('Aviso: sin OMDB_API_KEY no habrá notas de IMDb, Rotten Tomatoes ni Metacritic.');
  }

  const container = new AppContainer({
    storage: new NodeFileStorage(options.dataDir),
    keys: { get: (name) => (name === 'tmdb' ? tmdbKey : omdbKey) || null },
    onRecover: (message) => console.warn('[almacén]', message),
  });
  await container.load();

  const runOptions: RunOptions = {
    trigger: 'cli',
    dryRun: options.dryRun,
    ...(options.lookbackDays !== undefined ? { lookbackDays: options.lookbackDays } : {}),
    ...(options.graceDays !== undefined ? { graceDays: options.graceDays } : {}),
    ...(options.platforms ? { platformIds: options.platforms } : {}),
  };

  const run = await container.runAgent(runOptions, (progress) => {
    if (options.json) return;
    process.stdout.write(
      `\r${progress.stage.padEnd(9)} ${String(progress.done).padStart(4)}/${progress.total}  ${progress.message.slice(0, 50).padEnd(50)}`,
    );
  });

  if (options.json) {
    console.log(JSON.stringify(run, null, 2));
  } else {
    console.log(`\n\nEjecución ${run.id} — ${run.status}`);
    console.log(`  Ventana:      ${run.window.from} … ${run.window.to}`);
    console.log(`  Plataformas:  ${run.platformsQueried.join(', ')}`);
    console.log(`  Descubiertos: ${run.counts.discovered}`);
    console.log(`  Nuevos:       ${run.counts.created}`);
    console.log(`  Actualizados: ${run.counts.updated}`);
    console.log(`  Peticiones:   ${run.http.requests} (${run.http.cacheHits} desde caché)`);
    console.log(`  Duración:     ${(run.durationMs / 1000).toFixed(1)} s`);

    if (run.issues.length > 0) {
      console.log(`\n  Incidencias (${run.issues.length}):`);
      for (const issue of run.issues.slice(0, 20)) {
        console.log(`    · [${issue.severity}] ${issue.stage}/${issue.source}: ${issue.message}`);
      }
      if (run.issues.length > 20) {
        console.log(`    … y ${run.issues.length - 20} más (usa --json para verlas todas)`);
      }
    }
  }

  // Un fallo total devuelve código distinto de cero para que la integración
  // continua lo detecte; una ejecución parcial es un éxito con avisos.
  return run.status === 'failed' ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('El agente ha fallado:', error);
    process.exit(1);
  });
