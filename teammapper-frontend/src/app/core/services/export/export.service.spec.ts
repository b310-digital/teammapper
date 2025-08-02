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
  Root Node
    Child 1
    Child 2`;
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
    Child 1
      Grandchild`;
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
        {
          id: 'bold-colored',
          parent: 'root',
          name: 'Bold Colored',
          isRoot: false,
          font: { weight: 'bold' },
          colors: { background: '#00ff00' },
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  Root
    [Bold Node]
    (Colored Node)
    [Bold Colored]`;
      expect(result).toBe(expected);
    });

    it('should export nodes with links', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root',
          isRoot: true,
        } as ExportNodeProperties,
        {
          id: 'linked',
          parent: 'root',
          name: 'Linked Node',
          isRoot: false,
          link: { href: 'https://example.com' },
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  Root
    "[Linked Node](https://example.com)"`;
      expect(result).toBe(expected);
    });

    it('should ignore image comments', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root',
          isRoot: true,
        } as ExportNodeProperties,
        {
          id: 'image',
          parent: 'root',
          name: 'Node with Image',
          isRoot: false,
          image: { src: 'https://example.com/image.png', size: 48 },
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  Root
    Node with Image`;
      expect(result).toBe(expected);
    });

    it('should ignore detached nodes', () => {
      const nodes: ExportNodeProperties[] = [
        {
          id: 'root',
          parent: '',
          name: 'Root',
          isRoot: true,
        } as ExportNodeProperties,
        {
          id: 'attached',
          parent: 'root',
          name: 'Attached Node',
          isRoot: false,
        } as ExportNodeProperties,
        {
          id: 'detached',
          parent: 'root',
          name: 'Detached Node',
          isRoot: false,
          detached: true,
        } as ExportNodeProperties,
      ];

      const result = service.exportToMermaid(nodes);
      const expected = `mindmap
  Root
    Attached Node`;
      expect(result).toBe(expected);
    });
  });
});
