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
import { PLATFORMS, resolvePlatforms } from '../src/core/domain/platforms';
import { collectTopOfYear } from '../src/core/agent/top-year';
import { formatRankingList } from '../src/core/domain/ranking-format';
import { NodeFileStorage } from '../src/platform/node/node-storage';

interface CliOptions {
  dataDir: string;
  lookbackDays?: number;
  graceDays?: number;
  platforms?: string[];
  dryRun: boolean;
  json: boolean;
  help: boolean;
  /** Años de los que sacar la clasificación (FR-058). Vacío = recopilación normal. */
  rankingYears: number[];
  rankingLimit: number;
  rankingMinVotes?: number;
  rankingNoAnimation: boolean;
}

const HELP = `
Agente de estrenos de streaming en España — modo desatendido

  node dist/main/agent-cli.cjs [opciones]

Opciones
  --data-dir <ruta>        Directorio de datos (por defecto ./datos-agente)
  --ranking <años>         En vez de recopilar, saca la clasificación de esos
                           años. Ejemplo: --ranking 2023,2024,2025
  --top <n>                Cuántos títulos por lista (por defecto 10)
  --min-votes <n>          Votos mínimos en TMDB para entrar (por defecto 300
                           en películas, 150 en series)
  --sin-animacion          Deja fuera las películas y series de animación
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
  const options: CliOptions = {
    dataDir: './datos-agente',
    dryRun: false,
    json: false,
    help: false,
    rankingYears: [],
    rankingLimit: 10,
    rankingNoAnimation: false,
  };

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
      case '--ranking':
        if (next) {
          options.rankingYears = next
            .split(',')
            .map((value) => Number(value.trim()))
            .filter((year) => Number.isInteger(year) && year > 1900 && year < 2100);
        }
        i += 1;
        break;
      case '--top':
        if (next && Number(next) > 0) options.rankingLimit = Math.floor(Number(next));
        i += 1;
        break;
      case '--min-votes':
        if (next && Number(next) >= 0) options.rankingMinVotes = Math.floor(Number(next));
        i += 1;
        break;
      case '--sin-animacion':
        options.rankingNoAnimation = true;
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

  if (options.rankingYears.length > 0) {
    return runRanking(container, options);
  }

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

/**
 * Clasificación por año (FR-058).
 *
 * La nota es la **media simple** de IMDb, Rotten Tomatoes y TMDB, que no es el
 * índice ponderado del catálogo. Se dice en la cabecera para que nadie confunda
 * los dos números.
 */
async function runRanking(container: AppContainer, options: CliOptions): Promise<number> {
  const settings = container.settings.get();
  const tmdb = container.tmdb(settings);
  if (!tmdb) {
    console.error('Falta la clave de TMDB.');
    return 2;
  }

  // Los identificadores de proveedor se resuelven contra el catálogo de la
  // región, igual que en la recopilación semanal (FR-006): los de los ajustes
  // son una pista, no la verdad.
  const catalog = [
    ...(await tmdb.providerCatalog('movie').catch(() => [])),
    ...(await tmdb.providerCatalog('series').catch(() => [])),
  ];
  const enabled = options.platforms ?? PLATFORMS
    .filter((platform) => settings.platforms[platform.id] !== false)
    .map((platform) => platform.id);
  const resolved = resolvePlatforms(enabled, catalog);

  if (resolved.resolved.length === 0) {
    console.error('No se ha podido resolver ninguna plataforma contra el catálogo de TMDB.');
    return 1;
  }

  const providerIds = resolved.resolved.map((platform) => platform.providerId);
  const omdb = container.omdb(settings);
  if (!omdb) {
    console.warn(
      'Aviso: sin OMDB_API_KEY la media sale solo de TMDB y deja de ser la media de tres.\n',
    );
  }

  const blocks: string[] = [];
  const allIssues: string[] = [];

  for (const year of options.rankingYears) {
    for (const mediaType of ['movie', 'series'] as const) {
      const result = await collectTopOfYear(
        {
          tmdb,
          omdb,
          now: () => new Date(),
          onProgress: (done, total, message) => {
            if (options.json) return;
            process.stderr.write(`\r${message}: ${done}/${total}   `);
          },
        },
        {
          year,
          mediaType,
          providerIds,
          limit: options.rankingLimit,
          excludeAnimation: options.rankingNoAnimation || settings.quality.excludeAnimation,
          ...(options.rankingMinVotes !== undefined ? { minVotes: options.rankingMinVotes } : {}),
        },
      );

      const label = mediaType === 'movie' ? 'películas' : 'series';
      blocks.push(
        formatRankingList({
          heading: `Top ${options.rankingLimit} ${label} de ${year}`,
          entries: result.ranked,
        }),
      );
      allIssues.push(...result.issues.map((issue) => `${year} ${label}: ${issue}`));
    }
  }

  process.stderr.write('\r'.padEnd(60) + '\r');

  console.log('Nota = media simple de IMDb, Rotten Tomatoes y TMDB, sobre 10.');
  console.log('Entre paréntesis, la plataforma donde está en España.\n');
  console.log(blocks.join('\n\n'));

  if (allIssues.length > 0) {
    console.error(`\nIncidencias (${allIssues.length}):`);
    for (const issue of allIssues.slice(0, 15)) console.error(`  · ${issue}`);
  }

  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error('El agente ha fallado:', error);
    process.exit(1);
  });
