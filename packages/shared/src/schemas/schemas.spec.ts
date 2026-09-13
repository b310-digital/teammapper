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
  NodeSchema,
  sanitizeIssues,
} from './index';

describe('Shared Validation Schemas', () => {
  describe('Sub-schemas', () => {
    it('validates ColorSchema', () => {
      expect(v.safeParse(ColorSchema, { name: '#ff0000', branch: '#00ff00' }).success).toBe(true);
      expect(v.safeParse(ColorSchema, { name: 'invalid-hex' }).success).toBe(false);
    });

    it('validates CoordinatesSchema', () => {
      expect(v.safeParse(CoordinatesSchema, { x: 10, y: 20 }).success).toBe(true);
      expect(v.safeParse(CoordinatesSchema, { x: 'invalid', y: 20 }).success).toBe(false);
    });

    it('validates FontSchema', () => {
      expect(v.safeParse(FontSchema, { size: 12, style: 'normal', weight: 'bold' }).success).toBe(true);
    });

    it('validates ImageSchema', () => {
      expect(v.safeParse(ImageSchema, { src: 'https://example.com/pic.png', size: 100 }).success).toBe(true);
    });

    it('validates LinkSchema', () => {
      expect(v.safeParse(LinkSchema, { href: 'https://example.com' }).success).toBe(true);
      expect(v.safeParse(LinkSchema, { href: 'javascript:alert(1)' }).success).toBe(false);
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
      locked: false,
      detached: false,
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
      delete (withoutFolding as { hasHiddenChildNodes?: boolean }).hasHiddenChildNodes;
      const result = v.safeParse(NodeSchema, withoutFolding);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.output.hidden).toBe(false);
        expect(result.output.hasHiddenChildNodes).toBe(false);
      }
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
      const invalid = { ...validNode, image: { src: 'data:image/png;base64,' + 'a'.repeat(200_001) } };
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
      expect(v.safeParse(MapDeleteSchema, { adminId: 'valid-id' }).success).toBe(true);
      expect(v.safeParse(MapDeleteSchema, { adminId: '' }).success).toBe(false);
    });
  });
});
