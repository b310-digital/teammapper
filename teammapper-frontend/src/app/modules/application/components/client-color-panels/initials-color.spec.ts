import { COLORS } from 'src/app/core/services/mmp/mmp-utils';
import {
  DEFAULT_COLOR,
  DEFAULT_SELF_COLOR,
} from 'src/app/core/services/map-sync/map-sync-context';
import { contrastRatio, initialsTextColor } from './initials-color';

describe('contrastRatio', () => {
  it('rates black on white at 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('rates a color against itself at 1', () => {
    expect(contrastRatio('#2196F3', '#2196f3')).toBeCloseTo(1, 5);
  });

  it('rates mid grey on white just below 4.5', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  it('reads the short hex form', () => {
    expect(contrastRatio('#000', '#fff')).toBeCloseTo(21, 5);
  });

  it('returns null for a value that is no hex color', () => {
    expect(contrastRatio('red', '#ffffff')).toBeNull();
  });
});

describe('initialsTextColor', () => {
  it('writes white on a dark color', () => {
    expect(initialsTextColor('#673AB7')).toBe('#ffffff');
  });

  it('writes black on a light color', () => {
    expect(initialsTextColor('#FFEB3B')).toBe('#000000');
  });

  it('writes black on a value that is no hex color', () => {
    expect(initialsTextColor('url(evil)')).toBe('#000000');
  });

  it.each([...COLORS, DEFAULT_SELF_COLOR, DEFAULT_COLOR])(
    'reaches a contrast of at least 4.5:1 on %s',
    color => {
      expect(
        contrastRatio(initialsTextColor(color), color)
      ).toBeGreaterThanOrEqual(4.5);
    }
  );
});
