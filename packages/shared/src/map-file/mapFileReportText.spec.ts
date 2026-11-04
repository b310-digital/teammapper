import { readFixture } from './fixtures/readFixture';
import { formatMapFileReport, unreadableFileReport } from './mapFileReportText';
import { validateMapFile } from './validateMapFile';
import type { MapFileReport } from './validateMapFile';

const report = (fixture: string): MapFileReport =>
  validateMapFile(readFixture(fixture));

describe('formatMapFileReport', () => {
  it('marks a file without errors as valid', () => {
    const [status] = formatMapFileReport('v2.json', report('v2.json'));

    expect(status).toBe(
      'v2.json: VALID, version 2, declared (0 errors, 0 warnings)'
    );
  });

  it('names a version the import reads from the layout', () => {
    const [status] = formatMapFileReport(
      'v1.json',
      report('v1-node-list.json')
    );

    expect(status).toMatch(/^v1\.json: VALID, version 1, read from the layout/);
  });

  it('marks a file with an error as invalid', () => {
    const [status] = formatMapFileReport(
      'newer.json',
      report('invalid-newer-version.json')
    );

    expect(status).toMatch(/^newer\.json: INVALID, no version \(1 errors/);
  });

  it('lists the errors before the warnings, one finding per line', () => {
    const file: MapFileReport = {
      version: 2,
      versionDeclared: true,
      findings: [
        { severity: 'warning', path: 'arrows[0]', reason: 'dropped' },
        { severity: 'error', path: 'nodes[1]', reason: 'no id' },
      ],
    };

    expect(formatMapFileReport('map.json', file).slice(1)).toEqual([
      '  error    nodes[1]: no id',
      '  warning  arrows[0]: dropped',
    ]);
  });
});

describe('unreadableFileReport', () => {
  it('reports the reason as an error on the file', () => {
    expect(unreadableFileReport('ENOENT').findings).toEqual([
      { severity: 'error', path: 'file', reason: 'ENOENT' },
    ]);
  });

  it('formats as an invalid file with no version', () => {
    const [status] = formatMapFileReport(
      'gone.json',
      unreadableFileReport('ENOENT')
    );

    expect(status).toBe(
      'gone.json: INVALID, no version (1 errors, 0 warnings)'
    );
  });
});
