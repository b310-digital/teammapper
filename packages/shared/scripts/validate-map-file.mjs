#!/usr/bin/env node
/**
 * Checks JSON files against the rules the TeamMapper import applies, and
 * prints every error and warning with its reason. `validateMapFile` in
 * `@teammapper/shared` runs the checks and `formatMapFileReport` writes the
 * report, so build the package first:
 * `pnpm --filter @teammapper/shared run build`.
 *
 * Usage: pnpm --filter @teammapper/shared run validate-map-file <file.json> [more files]
 * Exits with 1 when any file holds an error, with 2 on wrong usage or a
 * missing build, else 0.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const BUILD = resolve(import.meta.dirname, '../dist/cjs/index.js');

/** Loads the shared package build, or returns null when none exists. */
function loadShared() {
  if (!existsSync(BUILD)) {
    console.error(
      'The @teammapper/shared build is missing. Run `pnpm --filter @teammapper/shared run build` first.'
    );
    return null;
  }
  return createRequire(import.meta.url)(BUILD);
}

/**
 * Returns the report on one file, or an error finding when it is unreadable.
 * A relative path starts at the directory pnpm was called from, which pnpm
 * passes as INIT_CWD while it runs the script inside the package.
 */
function reportOf(file, shared) {
  let text;
  try {
    text = readFileSync(resolve(process.env.INIT_CWD ?? '.', file), 'utf8');
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return shared.unreadableFileReport(reason);
  }
  return shared.validateMapFile(text);
}

/**
 * Validates each file named on the command line. Sets the exit code rather
 * than calling process.exit, so a piped report reaches its reader in full.
 */
function main(files) {
  if (files.length === 0) {
    console.error(
      'Usage: pnpm --filter @teammapper/shared run validate-map-file <file.json> [more files]'
    );
    process.exitCode = 2;
    return;
  }
  const shared = loadShared();
  if (shared === null) {
    process.exitCode = 2;
    return;
  }
  let failed = false;
  for (const file of files) {
    const report = reportOf(file, shared);
    console.log(shared.formatMapFileReport(file, report).join('\n'));
    failed = failed || report.findings.some(f => f.severity === 'error');
  }
  process.exitCode = failed ? 1 : 0;
}

main(process.argv.slice(2));
