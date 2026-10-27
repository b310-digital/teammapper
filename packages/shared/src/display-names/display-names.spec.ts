import {
  DISPLAY_NAME_MAX_INPUT_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  displayNameInitials,
  normalizeDisplayName,
} from './index';

describe('normalizeDisplayName', () => {
  it.each([42, null, undefined, {}, ['Vorname'], true])(
    'turns the non-string %p into the empty string',
    value => {
      expect(normalizeDisplayName(value)).toBe('');
    }
  );

  it('collapses runs of whitespace and trims', () => {
    expect(normalizeDisplayName('  Vorname   Test ')).toBe('Vorname Test');
  });

  it('turns a tab and a line break into one space', () => {
    expect(normalizeDisplayName('Vorname\t\nTest')).toBe('Vorname Test');
  });

  it('turns a name of spaces only into the empty string', () => {
    expect(normalizeDisplayName('    ')).toBe('');
  });

  it('removes control characters', () => {
    expect(normalizeDisplayName('\u0000Vor\u0007name\u007f')).toBe('Vorname');
  });

  it('removes bidi overrides and other format characters', () => {
    // Right-to-left override, zero-width space, byte order mark.
    expect(normalizeDisplayName('Vorname\u202e\u200b\ufeffTest')).toBe(
      'VornameTest'
    );
  });

  it('keeps the joiners that emoji sequences and some scripts need', () => {
    // Zero-width joiner inside the emoji, zero-width non-joiner in the Persian.
    const name = '\u{1f469}\u200d\u{1f4bb} \u0645\u06cc\u200c\u062e';

    expect(normalizeDisplayName(name)).toBe(name);
  });

  it('cuts a 40-character name to its first 30 characters', () => {
    const name = 'abcdefghij'.repeat(4);

    expect(normalizeDisplayName(name)).toBe(name.slice(0, 30));
  });

  it('counts an emoji as one grapheme when it cuts', () => {
    expect(normalizeDisplayName('🦊'.repeat(40))).toBe('🦊'.repeat(30));
  });

  it('counts a joined emoji sequence as one grapheme when it cuts', () => {
    const family = '\u{1f468}\u200d\u{1f469}\u200d\u{1f467}';

    expect(normalizeDisplayName(family.repeat(31))).toBe(family.repeat(30));
  });

  // A peer may send megabytes; the work must not grow with the input.
  it('reads no further than the first DISPLAY_NAME_MAX_INPUT_LENGTH characters', () => {
    const name = ' '.repeat(DISPLAY_NAME_MAX_INPUT_LENGTH) + 'Vorname';

    expect(normalizeDisplayName(name)).toBe('');
  });

  it('drops a grapheme stacked with combining marks past the length cap', () => {
    const zalgo = 'a' + '\u0301'.repeat(DISPLAY_NAME_MAX_LENGTH);

    expect(normalizeDisplayName(`Vorname ${zalgo}`)).toBe('Vorname');
  });

  it('keeps the result within DISPLAY_NAME_MAX_LENGTH characters', () => {
    const heavy = ('a' + '\u0301'.repeat(20)).repeat(30);

    expect(normalizeDisplayName(heavy).length).toBeLessThanOrEqual(
      DISPLAY_NAME_MAX_LENGTH
    );
  });

  it('removes the filler characters that render blank', () => {
    // Hangul fillers and the braille blank.
    expect(normalizeDisplayName('\u3164\uffa0\u115f\u1160\u2800')).toBe('');
  });

  it('trims the space the cut leaves at the end', () => {
    expect(normalizeDisplayName(`${'a'.repeat(29)} b`)).toBe('a'.repeat(29));
  });

  it('leaves markup as it is, for the template to render as text', () => {
    const markup = '<img src=x onerror=alert(1)>';

    expect(normalizeDisplayName(markup)).toBe(markup);
  });
});

describe('displayNameInitials', () => {
  it('returns the empty string for an empty name', () => {
    expect(displayNameInitials('')).toBe('');
  });

  it('returns the upper-cased first letter of a one-word name', () => {
    expect(displayNameInitials('vorname')).toBe('V');
  });

  it('takes the first and the last word of a longer name', () => {
    expect(displayNameInitials('Vorname Zweitname Test')).toBe('VT');
  });

  it('keeps a leading emoji whole', () => {
    expect(displayNameInitials('🦊 Fox')).toBe('🦊F');
  });

  it('keeps a combining accent with its letter', () => {
    expect(displayNameInitials('e\u0301vorname test')).toBe('E\u0301T');
  });

  it('upper-cases letters outside ASCII', () => {
    expect(displayNameInitials('åvorname ötest')).toBe('ÅÖ');
  });

  it('reads the name as normalized, so stray whitespace adds no word', () => {
    expect(displayNameInitials('  vorname   test  ')).toBe('VT');
  });
});
