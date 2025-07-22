import { TestBed } from '@angular/core/testing';
import { ExportService } from './export.service';
import { ExportNodeProperties } from '@mmp/map/types';

describe('ExportService', () => {
  let service: ExportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ExportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('exportToMermaid', () => {
    it('should return default mindmap for empty nodes', () => {
      const result = service.exportToMermaid([]);
      expect(result).toBe('mindmap\n  root');
    });

    it('should return default mindmap when no root node exists', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: '1',
          parent: '0',
          name: 'Child',
          isRoot: false,
        } as ExportNodeProperties,
      ];
      const result = service.exportToMermaid(nodes);
      expect(result).toBe('mindmap\n  root');
    });

    it('should export a simple mindmap with root and children', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root Node',
          isRoot: true,
        } as ExportNodeProperties,
        {
          id: 'child1',
          parent: 'root',
          name: 'Child 1',
          isRoot: false,
        } as ExportNodeProperties,
        {
          id: 'child2',
          parent: 'root',
          name: 'Child 2',
          isRoot: false,
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  "Root Node"
    ("Child 1")
    ("Child 2")`;
      expect(result).toBe(expected);
    });

    it('should handle nested nodes', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root',
          isRoot: true,
        } as ExportNodeProperties,
        {
          id: 'child1',
          parent: 'root',
          name: 'Child 1',
          isRoot: false,
        } as ExportNodeProperties,
        {
          id: 'grandchild',
          parent: 'child1',
          name: 'Grandchild',
          isRoot: false,
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  Root
    ("Child 1")
      (Grandchild)`;
      expect(result).toBe(expected);
    });

    it('should escape quotes in node names', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root "with quotes"',
          isRoot: true,
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  "Root \\"with quotes\\""`;
      expect(result).toBe(expected);
    });

    it('should use different brackets for styled nodes', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root',
          isRoot: true,
        } as ExportNodeProperties,
        {
          id: 'bold',
          parent: 'root',
          name: 'Bold Node',
          isRoot: false,
          font: { weight: 'bold' },
        } as ExportNodeProperties,
        {
          id: 'colored',
          parent: 'root',
          name: 'Colored Node',
          isRoot: false,
          colors: { background: '#ff0000' },
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  Root
    ["Bold Node"]
    {{"Colored Node"}}`;
      expect(result).toBe(expected);
    });
  });
});