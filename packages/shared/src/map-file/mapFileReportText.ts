/**
 * The plain-text report of the `validate-map-file` script
 * (`scripts/validate-map-file.mjs`), its only consumer. The app shows no such
 * text, so build no interface on these strings.
 */
import type { MapFileReport } from './validateMapFile';

/** The report on a file the validator could not read, with the reason. */
export function unreadableFileReport(reason: string): MapFileReport {
  return {
    version: null,
    versionDeclared: false,
    findings: [{ severity: 'error', path: 'file', reason }],
  };
}

/** Describes the map file version the import reads the file as. */
function versionLabel({ version, versionDeclared }: MapFileReport): string {
  if (version === null) return 'no version';
  const source = versionDeclared ? 'declared' : 'read from the layout';
  return `version ${version}, ${source}`;
}

/**
 * The lines of text that report on one file: a status line naming the file,
 * VALID or INVALID and the version, then one line per finding, errors first.
 */
export function formatMapFileReport(
  file: string,
  report: MapFileReport
): string[] {
  const errors = report.findings.filter(f => f.severity === 'error');
  const warnings = report.findings.filter(f => f.severity === 'warning');
  const status = errors.length > 0 ? 'INVALID' : 'VALID';
  const counts = `${errors.length} errors, ${warnings.length} warnings`;
  return [
    `${file}: ${status}, ${versionLabel(report)} (${counts})`,
    ...[...errors, ...warnings].map(
      ({ severity, path, reason }) =>
        `  ${severity.padEnd(8)} ${path}: ${reason}`
    ),
  ];
}
