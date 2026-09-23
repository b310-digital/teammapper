import { TestBed } from '@angular/core/testing';
import { ToastrService } from 'ngx-toastr';
import { ExportNodeProperties } from '@teammapper/shared';
import { ImportService } from './import.service';
import { MmpService } from '../mmp/mmp.service';
import { SettingsService } from '../settings/settings.service';
import { UtilsService } from '../utils/utils.service';
import { ExportService } from '../export/export.service';

jest.mock('dompurify', () => ({
  __esModule: true,
  default: { sanitize: jest.fn((str: string) => str) },
}));

const nodeDefaults = {
  name: 'New node',
  font: { style: 'normal', size: 20, weight: 'normal' },
  colors: { name: '#666666', background: '#ffffff', branch: '' },
  image: { size: 60 },
};

describe('ImportService', () => {
  let service: ImportService;
  let importMap: jest.Mock;

  beforeEach(() => {
    importMap = jest.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: MmpService, useValue: { importMap } },
        {
          provide: ToastrService,
          useValue: { success: jest.fn(), error: jest.fn() },
        },
        {
          provide: UtilsService,
          useValue: { translate: jest.fn().mockResolvedValue('') },
        },
        {
          provide: SettingsService,
          useValue: {
            getCachedUserSettings: () => ({
              mapOptions: {
                autoBranchColors: true,
                defaultNode: nodeDefaults,
                rootNode: nodeDefaults,
              },
            }),
          },
        },
      ],
    });
    service = TestBed.inject(ImportService);
  });

  const importedNodes = async (input: string) => {
    expect(await service.importFromMermaid(input)).toBe(true);
    expect(importMap).toHaveBeenCalledTimes(1);
    return JSON.parse(importMap.mock.calls[0][0]) as ExportNodeProperties[];
  };

  const byName = (nodes: ExportNodeProperties[], name: string) =>
    nodes.find(n => n.name === name);

  it('imports each mindmap block as its own tree', async () => {
    const nodes = await importedNodes(
      'mindmap\n  Main\n    A\n\nmindmap\n  Second\n    B'
    );

    expect(byName(nodes, 'Second')?.parent).toBe('');
    expect(byName(nodes, 'A')?.parent).toBe(byName(nodes, 'Main')?.id);
    expect(byName(nodes, 'B')?.parent).toBe(byName(nodes, 'Second')?.id);
  });

  it('splits at a mindmap header written in any case', async () => {
    const nodes = await importedNodes('Mindmap\n  Main\n\nMINDMAP\n  Second');

    expect(nodes.map(n => [n.name, n.parent])).toEqual([
      ['Main', ''],
      ['Second', ''],
    ]);
  });

  it('marks only the first block root with isRoot', async () => {
    const nodes = await importedNodes(
      'mindmap\n  Main\n\nmindmap\n  Second\n\nmindmap\n  Third'
    );

    expect(nodes.filter(n => n.isRoot).map(n => n.name)).toEqual(['Main']);
  });

  it('gives the children of a second root automatic branch colors', async () => {
    const nodes = await importedNodes(
      'mindmap\n  Main\n\nmindmap\n  Second\n    B'
    );

    expect(byName(nodes, 'Second')?.colors?.branch).toBe('');
    expect(byName(nodes, 'B')?.colors?.branch).toMatch(/^#/);
  });

  it('replaces nothing when one block fails to parse', async () => {
    const result = await service.importFromMermaid(
      'mindmap\n  Main\n\nmindmap\n  A\n  B'
    );

    expect(result).toBe(false);
    expect(importMap).not.toHaveBeenCalled();
  });

  it('round-trips a three-tree export to the same trees', async () => {
    const mermaid =
      'mindmap\n  Main\n    A\n      A1\n\nmindmap\n  Second\n    B\n\nmindmap\n  Third';

    const nodes = await importedNodes(mermaid);

    expect(new ExportService().exportToMermaid(nodes)).toBe(mermaid);
  });
});
