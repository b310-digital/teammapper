import * as v from 'valibot';
import {
  ColorSchema,
  CoordinatesSchema,
  FontSchema,
  ImageSchema,
  LinkSchema,
  MapCreateSchema,
  MapDeleteSchema,
  MapOptionsSchema,
  MermaidCreateSchema,
  NodeBasicsSchema,
  NodeSchema,
  sanitizeIssues,
  NodePropertySchemas,
} from './index';
import type { NodeProperty } from '../models';

describe('Shared Validation Schemas', () => {
  describe('NodePropertySchemas', () => {
    it.each<[NodeProperty, unknown]>([
      ['name', 'A name'],
      ['protected', true],
      ['coordinates', { x: 1, y: 2 }],
      ['imageSrc', 'image:5f0c4b1e-3a8d-4c6e-9f2a-7b1d2e3f4a5b'],
      ['imageSize', 60],
      ['linkHref', 'https://example.com'],
      ['backgroundColor', '#f9f9f9'],
      ['branchColor', ''],
      ['fontWeight', 'bold'],
      ['fontStyle', 'italic'],
      ['fontSize', 16],
      ['nameColor', null],
      ['hidden', false],
    ])('accepts %s %p', (property, value) => {
      expect(v.safeParse(NodePropertySchemas[property], value).success).toBe(
        true
      );
    });

    it.each<[NodeProperty, unknown]>([
      ['name', 42],
      ['protected', 'yes'],
      ['coordinates', { x: 'left', y: 0 }],
      ['imageSize', '60'],
      ['linkHref', 'javascript:alert(1)'],
      ['backgroundColor', 'red'],
      ['fontWeight', 'x'.repeat(1000)],
      ['fontSize', 'big'],
      ['hidden', 1],
    ])('refuses %s %p', (property, value) => {
      expect(v.safeParse(NodePropertySchemas[property], value).success).toBe(
        false
      );
    });
  });

  describe('Sub-schemas', () => {
    it('validates ColorSchema with valid hex, null, or empty object', () => {
      expect(v.safeParse(ColorSchema, {}).success).toBe(true);
      expect(
        v.safeParse(ColorSchema, { name: null, background: null, branch: null })
          .success
      ).toBe(true);
      expect(
        v.safeParse(ColorSchema, {
          name: '#ff0000',
          background: '#000000',
          branch: '#aaBBcc',
        }).success
      ).toBe(true);
      expect(v.safeParse(ColorSchema, { name: '#fff' }).success).toBe(true);
      expect(v.safeParse(ColorSchema, { name: 'invalid-hex' }).success).toBe(
        false
      );
      expect(v.safeParse(ColorSchema, { name: 'red' }).success).toBe(false);
      expect(
        v.safeParse(ColorSchema, { name: 'expression(alert(1))' }).success
      ).toBe(false);
      expect(v.safeParse(ColorSchema, { name: 123 }).success).toBe(false);
    });

    it('accepts an empty color, which means no color', () => {
      expect(v.safeParse(ColorSchema, { branch: '' }).success).toBe(true);
    });

    it('validates CoordinatesSchema', () => {
      expect(v.safeParse(CoordinatesSchema, { x: 10, y: 20 }).success).toBe(
        true
      );
      expect(v.safeParse(CoordinatesSchema, { x: 10 }).success).toBe(false);
      expect(v.safeParse(CoordinatesSchema, { y: 20 }).success).toBe(false);
      expect(
        v.safeParse(CoordinatesSchema, { x: 'invalid', y: 20 }).success
      ).toBe(false);
    });

    it('validates FontSchema', () => {
      expect(v.safeParse(FontSchema, {}).success).toBe(true);
      expect(
        v.safeParse(FontSchema, { size: 12, style: 'normal', weight: 'bold' })
          .success
      ).toBe(true);
      expect(v.safeParse(FontSchema, { size: 'big' }).success).toBe(false);
      expect(v.safeParse(FontSchema, { style: 'a'.repeat(20) }).success).toBe(
        true
      );
      expect(v.safeParse(FontSchema, { style: 'a'.repeat(21) }).success).toBe(
        false
      );
      expect(v.safeParse(FontSchema, { weight: 'a'.repeat(21) }).success).toBe(
        false
      );
    });

    it('validates ImageSchema', () => {
      expect(v.safeParse(ImageSchema, {}).success).toBe(true);
      expect(v.safeParse(ImageSchema, { src: null }).success).toBe(true);
      expect(
        v.safeParse(ImageSchema, {
          src: 'https://example.com/pic.png',
          size: 100,
        }).success
      ).toBe(true);
      expect(
        v.safeParse(ImageSchema, { src: 'data:image/png;base64,abc' }).success
      ).toBe(true);
      expect(
        v.safeParse(ImageSchema, { src: 'a'.repeat(200_000) }).success
      ).toBe(true);
      expect(
        v.safeParse(ImageSchema, { src: 'a'.repeat(200_001) }).success
      ).toBe(false);
    });

    it('validates LinkSchema', () => {
      expect(v.safeParse(LinkSchema, {}).success).toBe(true);
      expect(v.safeParse(LinkSchema, { href: null }).success).toBe(true);
      expect(v.safeParse(LinkSchema, { href: '' }).success).toBe(true);
      expect(
        v.safeParse(LinkSchema, { href: 'https://example.com' }).success
      ).toBe(true);
      expect(
        v.safeParse(LinkSchema, { href: 'http://example.com' }).success
      ).toBe(true);
      expect(
        v.safeParse(LinkSchema, { href: 'javascript:alert(1)' }).success
      ).toBe(false);
      expect(
        v.safeParse(LinkSchema, { href: 'data:text/html,<script>' }).success
      ).toBe(false);
      expect(
        v.safeParse(LinkSchema, { href: 'https://x.co/' + 'a'.repeat(2035) })
          .success
      ).toBe(true);
      expect(
        v.safeParse(LinkSchema, { href: 'https://x.co/' + 'a'.repeat(2036) })
          .success
      ).toBe(false);
    });

    it('validates NodeBasicsSchema', () => {
      const validBasics = {
        name: 'Root',
        colors: { name: '#fff', background: null, branch: null },
        font: { style: null, size: null, weight: null },
        image: { src: null, size: null },
      };
      expect(v.safeParse(NodeBasicsSchema, validBasics).success).toBe(true);
      expect(
        v.safeParse(NodeBasicsSchema, {
          name: 'Test',
          colors: {},
          font: {},
          image: {},
        }).success
      ).toBe(true);
      const withoutColors = { ...validBasics };
      delete (withoutColors as Partial<typeof validBasics>).colors;
      expect(v.safeParse(NodeBasicsSchema, withoutColors).success).toBe(false);
      expect(
        v.safeParse(NodeBasicsSchema, { ...validBasics, name: 'a'.repeat(513) })
          .success
      ).toBe(false);
    });
  });

  describe('NodeSchema', () => {
    const validNode = {
      id: 'node-1',
      parent: null,
      isRoot: true,
      name: 'Root Node',
      coordinates: { x: 100, y: 200 },
      colors: {
        name: '#ffffff',
        background: '#000000',
        branch: '#ff0000',
        link: '#0000ff',
      },
      font: {
        style: 'italic',
        size: 14,
        weight: 'bold',
      },
      image: {
        src: 'https://example.com/image.png',
        size: 50,
      },
      link: {
        href: 'https://example.com',
      },
      protected: true,
      k: 1.5,
      hidden: true,
      hasHiddenChildNodes: true,
    };

    it('successfully parses a canonical valid node with folding properties', () => {
      const result = v.safeParse(NodeSchema, validNode);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.hidden).toBe(true);
        expect(result.output.hasHiddenChildNodes).toBe(true);
      }
    });

    it('defaults hidden and hasHiddenChildNodes to false when omitted', () => {
      const withoutFolding = { ...validNode };
      delete (withoutFolding as { hidden?: boolean }).hidden;
      delete (withoutFolding as { hasHiddenChildNodes?: boolean })
        .hasHiddenChildNodes;
      const result = v.safeParse(NodeSchema, withoutFolding);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.hidden).toBe(false);
        expect(result.output.hasHiddenChildNodes).toBe(false);
      }
    });

    it('keeps protected and defaults it to false when omitted', () => {
      expect(v.parse(NodeSchema, validNode).protected).toBe(true);
      const withoutProtection = { ...validNode };
      delete (withoutProtection as { protected?: boolean }).protected;
      expect(v.parse(NodeSchema, withoutProtection).protected).toBe(false);
    });

    it('accepts and drops the locked field of older files', () => {
      const legacy = { ...validNode, locked: true };
      const result = v.safeParse(NodeSchema, legacy);
      expect(result.success).toBe(true);
      if (result.success) expect(result.output).not.toHaveProperty('locked');
    });

    it('permits non-breaking schema additions (tolerant validation)', () => {
      const withExtraField = { ...validNode, futureFeatureFlag: 'enabled' };
      const result = v.safeParse(NodeSchema, withExtraField);
      expect(result.success).toBe(true);
    });

    it('fails when id is empty', () => {
      const invalid = { ...validNode, id: '' };
      const result = v.safeParse(NodeSchema, invalid);
      expect(result.success).toBe(false);
    });

    it('fails when name exceeds 512 characters', () => {
      const invalid = { ...validNode, name: 'a'.repeat(513) };
      const result = v.safeParse(NodeSchema, invalid);
      expect(result.success).toBe(false);
    });

    it('fails when link href is not http/https', () => {
      const invalid = { ...validNode, link: { href: 'javascript:alert(1)' } };
      const result = v.safeParse(NodeSchema, invalid);
      expect(result.success).toBe(false);
    });

    it('fails when image src exceeds 200,000 characters', () => {
      const invalid = {
        ...validNode,
        image: { src: 'data:image/png;base64,' + 'a'.repeat(200_001) },
      };
      const result = v.safeParse(NodeSchema, invalid);
      expect(result.success).toBe(false);
    });
  });

  describe('sanitizeIssues', () => {
    const sensitiveSchema = v.object({
      adminId: v.pipe(v.string(), v.uuid()),
      modificationSecret: v.pipe(v.string(), v.minLength(10)),
    });

    it('strips input, received, and message to avoid leaking secrets', () => {
      const result = v.safeParse(sensitiveSchema, {
        adminId: 'secret-admin-token-123',
        modificationSecret: 'short',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const sanitized = sanitizeIssues(result.issues);
        const serialized = JSON.stringify(sanitized);
        expect(serialized).not.toContain('secret-admin-token-123');
        expect(serialized).not.toContain('short');
        expect(sanitized[0].expected).toBeDefined();
        expect(sanitized[0].path).toBeDefined();
      }
    });
  });

  describe('Map schemas', () => {
    it('validates MapOptionsSchema', () => {
      const options = { fontMaxSize: 32, fontMinSize: 10, fontIncrement: 2 };
      expect(v.safeParse(MapOptionsSchema, options).success).toBe(true);
    });

    it('validates MapCreateSchema', () => {
      const request = {
        rootNode: {
          name: 'Central Idea',
          colors: { branch: '#123456' },
          font: { size: 16 },
          image: {},
        },
      };
      expect(v.safeParse(MapCreateSchema, request).success).toBe(true);
    });

    it('validates MapDeleteSchema', () => {
      expect(
        v.safeParse(MapDeleteSchema, { adminId: 'valid-id' }).success
      ).toBe(true);
      expect(v.safeParse(MapDeleteSchema, { adminId: '' }).success).toBe(false);
    });

    it('validates MermaidCreateSchema', () => {
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'A mindmap about cats',
          language: 'en',
        }).success
      ).toBe(true);
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'Japanese mindmap',
          language: 'ja',
        }).success
      ).toBe(true);
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: '',
          language: 'en',
        }).success
      ).toBe(false);
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'valid',
          language: 'unsupported-lang',
        }).success
      ).toBe(false);
    });

    it('defaults the MermaidCreateSchema shape when omitted', () => {
      const result = v.safeParse(MermaidCreateSchema, {
        mindmapDescription: 'valid',
        language: 'en',
      });
      expect(result.success && result.output.levels).toBe(2);
      expect(result.success && result.output.childrenPerNode).toBe(4);
    });

    it.each([
      { levels: 0 },
      { levels: 4 },
      { levels: 1.5 },
      { levels: '2' },
      { childrenPerNode: 0 },
      { childrenPerNode: 5 },
      { childrenPerNode: Number.NaN },
      { childrenPerNode: null },
    ])('rejects MermaidCreateSchema shape %o', shape => {
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'valid',
          language: 'en',
          ...shape,
        }).success
      ).toBe(false);
    });

    it('accepts the MermaidCreateSchema shape bounds', () => {
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'valid',
          language: 'en',
          levels: 3,
          childrenPerNode: 1,
        }).success
      ).toBe(true);
    });

    it.each([
      { levels: 3, childrenPerNode: 2 },
      { levels: 2, childrenPerNode: 3 },
      { levels: 2, childrenPerNode: 4 },
    ])('accepts the MermaidCreateSchema shape %o', shape => {
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'valid',
          language: 'en',
          ...shape,
        }).success
      ).toBe(true);
    });

    it.each([
      { levels: 3, childrenPerNode: 3 },
      { levels: 3, childrenPerNode: 4 },
    ])('rejects the MermaidCreateSchema shape %o as too many nodes', shape => {
      expect(
        v.safeParse(MermaidCreateSchema, {
          mindmapDescription: 'valid',
          language: 'en',
          ...shape,
        }).success
      ).toBe(false);
    });
  });
});
