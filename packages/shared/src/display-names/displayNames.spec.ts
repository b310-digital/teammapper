import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameInitials,
  normalizeDisplayName,
} from './displayNames';

describe('normalizeDisplayName', () => {
  it.each([42, null, undefined, {}, ['Vorname'], true])(
    'turns the non-string %p into the empty string',
    value => {
      expect(normalizeDisplayName(value)).toBe('');
    }
  );

  it('collapses runs of spaces and trims', () => {
    expect(normalizeDisplayName('  Vorname   Test ')).toBe('Vorname Test');
  });

  it('turns a name of spaces only into the empty string', () => {
    expect(normalizeDisplayName('    ')).toBe('');
  });

  it('removes tabs and line breaks', () => {
    expect(normalizeDisplayName('Vor\tname\n Test')).toBe('Vorname Test');
  });

  it('removes control and format characters, joiners included', () => {
    // Null, bell, right-to-left override, zero-width non-joiner and joiner.
    expect(normalizeDisplayName('\u0000Vor\u0007na\u202eme\u200c\u200d')).toBe(
      'Vorname'
    );
  });

  it('removes emoji and symbols', () => {
    expect(normalizeDisplayName('\u{1f98a} Vorname! <3')).toBe('Vorname 3');
  });

  it('keeps letters outside ASCII, digits and the allowed punctuation', () => {
    const name = "Åsa O'Neil-Ma_2.";

    expect(normalizeDisplayName(name)).toBe(name);
  });

  it('keeps a combining accent with its letter', () => {
    expect(normalizeDisplayName('Re\u0301ne')).toBe('Re\u0301ne');
  });

  it('cuts a name to its first DISPLAY_NAME_MAX_LENGTH characters', () => {
    const name = 'abcdefghij'.repeat(3);

    expect(normalizeDisplayName(name)).toBe(
      name.slice(0, DISPLAY_NAME_MAX_LENGTH)
    );
  });

  it('trims the space the cut leaves at the end', () => {
    expect(normalizeDisplayName(`${'a'.repeat(19)} b`)).toBe('a'.repeat(19));
  });

  it('removes the characters markup needs', () => {
    expect(normalizeDisplayName('<b>Vorname</b>')).toBe('bVornameb');
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

  it('upper-cases letters outside ASCII', () => {
    expect(displayNameInitials('åvorname ötest')).toBe('ÅÖ');
  });

  it('reads the name as normalized, so stray whitespace adds no word', () => {
    expect(displayNameInitials('  vorname   test  ')).toBe('VT');
  });
});
