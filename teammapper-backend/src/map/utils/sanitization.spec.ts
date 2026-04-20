import {
  sanitizeName,
  sanitizeImageSrc,
  sanitizeLinkHref,
  sanitizeColor,
  sanitizeFontStyle,
  sanitizeFontWeight,
  sanitizeNodeFields,
} from './sanitization'
import { MmpNode } from '../entities/mmpNode.entity'

describe('sanitizeName', () => {
  it('should strip HTML tags from name', () => {
    expect(sanitizeName('<img src=x onerror=alert(1)>Hello')).toBe('Hello')
  })

  it('should strip script tags', () => {
    expect(sanitizeName('<script>alert(1)</script>World')).toBe('World')
  })

  it('should pass through plain text unchanged', () => {
    expect(sanitizeName('My Node')).toBe('My Node')
  })

  it('should return empty string for empty input', () => {
    expect(sanitizeName('')).toBe('')
  })

  it('should return empty string for null/undefined', () => {
    expect(sanitizeName(null)).toBe('')
    expect(sanitizeName(undefined)).toBe('')
  })
})

describe('sanitizeImageSrc', () => {
  it('should accept valid JPEG data URI', () => {
    const src = 'data:image/jpeg;base64,/9j/4AAQSkZJRg=='
    expect(sanitizeImageSrc(src)).toBe(src)
  })

  it('should accept valid PNG data URI', () => {
    const src = 'data:image/png;base64,iVBORw0KGgo='
    expect(sanitizeImageSrc(src)).toBe(src)
  })

  it('should accept valid GIF data URI', () => {
    const src = 'data:image/gif;base64,R0lGODlh'
    expect(sanitizeImageSrc(src)).toBe(src)
  })

  it('should accept valid WebP data URI', () => {
    const src = 'data:image/webp;base64,UklGR'
    expect(sanitizeImageSrc(src)).toBe(src)
  })

  it('should reject SVG data URI', () => {
    expect(sanitizeImageSrc('data:image/svg+xml;base64,PHN2Zy4=')).toBe('')
  })

  it('should reject javascript URI', () => {
    expect(sanitizeImageSrc('javascript:alert(1)')).toBe('')
  })

  it('should reject external URLs', () => {
    expect(sanitizeImageSrc('https://evil.com/image.jpg')).toBe('')
  })

  it('should return empty string for empty/null/undefined', () => {
    expect(sanitizeImageSrc('')).toBe('')
    expect(sanitizeImageSrc(null)).toBe('')
    expect(sanitizeImageSrc(undefined)).toBe('')
  })
})

describe('sanitizeLinkHref', () => {
  it('should accept https URLs', () => {
    expect(sanitizeLinkHref('https://example.com')).toBe('https://example.com')
  })

  it('should accept http URLs', () => {
    expect(sanitizeLinkHref('http://example.com')).toBe('http://example.com')
  })

  it('should reject javascript protocol', () => {
    expect(sanitizeLinkHref('javascript:alert(document.cookie)')).toBe('')
  })

  it('should reject data protocol', () => {
    expect(sanitizeLinkHref('data:text/html,<script>alert(1)</script>')).toBe(
      ''
    )
  })

  it('should reject vbscript protocol', () => {
    expect(sanitizeLinkHref('vbscript:MsgBox("XSS")')).toBe('')
  })

  it('should reject invalid URLs', () => {
    expect(sanitizeLinkHref('not-a-url')).toBe('')
  })

  it('should return empty string for empty/null/undefined', () => {
    expect(sanitizeLinkHref('')).toBe('')
    expect(sanitizeLinkHref(null)).toBe('')
    expect(sanitizeLinkHref(undefined)).toBe('')
  })
})

describe('sanitizeColor', () => {
  it('should accept 6-digit hex color', () => {
    expect(sanitizeColor('#ff0000')).toBe('#ff0000')
  })

  it('should accept 8-digit hex color with alpha', () => {
    expect(sanitizeColor('#ff0000cc')).toBe('#ff0000cc')
  })

  it('should reject 3-digit hex color', () => {
    expect(sanitizeColor('#f00')).toBe('')
  })

  it('should reject rgb color', () => {
    expect(sanitizeColor('rgb(255, 0, 0)')).toBe('')
  })

  it('should reject named color', () => {
    expect(sanitizeColor('red')).toBe('')
  })

  it('should reject HTML injection', () => {
    expect(sanitizeColor('<script>alert(1)</script>')).toBe('')
  })

  it('should return empty string for empty/null/undefined', () => {
    expect(sanitizeColor('')).toBe('')
    expect(sanitizeColor(null)).toBe('')
    expect(sanitizeColor(undefined)).toBe('')
  })
})

describe('sanitizeFontStyle', () => {
  it('should accept normal', () => {
    expect(sanitizeFontStyle('normal')).toBe('normal')
  })

  it('should accept italic', () => {
    expect(sanitizeFontStyle('italic')).toBe('italic')
  })

  it('should reject invalid value and return normal', () => {
    expect(sanitizeFontStyle('expression(alert(1))')).toBe('normal')
  })

  it('should return normal for empty/null/undefined', () => {
    expect(sanitizeFontStyle('')).toBe('normal')
    expect(sanitizeFontStyle(null)).toBe('normal')
    expect(sanitizeFontStyle(undefined)).toBe('normal')
  })
})

describe('sanitizeFontWeight', () => {
  it('should accept normal', () => {
    expect(sanitizeFontWeight('normal')).toBe('normal')
  })

  it('should accept bold', () => {
    expect(sanitizeFontWeight('bold')).toBe('bold')
  })

  it('should reject invalid value and return normal', () => {
    expect(sanitizeFontWeight('900')).toBe('normal')
  })

  it('should return normal for empty/null/undefined', () => {
    expect(sanitizeFontWeight('')).toBe('normal')
    expect(sanitizeFontWeight(null)).toBe('normal')
    expect(sanitizeFontWeight(undefined)).toBe('normal')
  })
})

describe('sanitizeNodeFields', () => {
  it('should sanitize all string fields on a partial node', () => {
    const node: Partial<MmpNode> = {
      name: '<script>xss</script>Hello',
      imageSrc: 'data:image/svg+xml;base64,PHN2Zz4=',
      linkHref: 'javascript:alert(1)',
      colorsName: '<b>red</b>',
      colorsBackground: '#ffffff',
      colorsBranch: '#000000',
      fontStyle: 'expression(alert(1))',
      fontWeight: '900',
    }

    const result = sanitizeNodeFields(node)

    expect(result).toEqual({
      name: 'Hello',
      imageSrc: '',
      linkHref: '',
      colorsName: '',
      colorsBackground: '#ffffff',
      colorsBranch: '#000000',
      fontStyle: 'normal',
      fontWeight: 'normal',
    })
  })

  it('should not touch fields that are not present', () => {
    const node: Partial<MmpNode> = {
      id: 'test-id',
      coordinatesX: 10,
      root: true,
    }

    const result = sanitizeNodeFields(node)

    expect(result).toEqual({
      id: 'test-id',
      coordinatesX: 10,
      root: true,
    })
    expect(result).not.toHaveProperty('name')
    expect(result).not.toHaveProperty('imageSrc')
  })

  it('should pass through non-string fields unchanged', () => {
    const node: Partial<MmpNode> = {
      name: 'Safe',
      coordinatesX: 100,
      coordinatesY: 200,
      fontSize: 14,
      locked: true,
      nodeMapId: 'map-123',
    }

    const result = sanitizeNodeFields(node)

    expect(result).toEqual({
      name: 'Safe',
      coordinatesX: 100,
      coordinatesY: 200,
      fontSize: 14,
      locked: true,
      nodeMapId: 'map-123',
    })
  })

  it('should handle undefined string fields without adding them', () => {
    const node: Partial<MmpNode> = { id: 'test' }

    const result = sanitizeNodeFields(node)

    expect(result.name).toBeUndefined()
    expect(result.linkHref).toBeUndefined()
  })
})
