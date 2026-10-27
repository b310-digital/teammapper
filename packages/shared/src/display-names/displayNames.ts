/** The most characters, counted in code points, a display name keeps. */
export const DISPLAY_NAME_MAX_LENGTH = 20;

/**
 * Every character a display name may not hold: anything but letters, marks,
 * digits, the space and `-'._`.
 */
const DISALLOWED = /[^\p{L}\p{M}\p{N} \-'._]/gu;

const SPACES = / +/g;

/**
 * The display name as every client stores, sends and shows it. Any client
 * writes its own awareness state, so a receiver applies this to every name it
 * reads, too. The result is plain text: a template must interpolate it, never
 * bind it as HTML.
 *
 * 1. A value that is no string becomes the empty string.
 * 2. Every disallowed character goes, tabs and line breaks included.
 * 3. Every run of spaces collapses to one space, and the ends are trimmed.
 * 4. The name keeps its first `DISPLAY_NAME_MAX_LENGTH` characters.
 *
 * The empty string means no display name.
 */
export const normalizeDisplayName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(DISALLOWED, '').replace(SPACES, ' ').trim();
  return Array.from(cleaned).slice(0, DISPLAY_NAME_MAX_LENGTH).join('').trim();
};

/**
 * The initials the client list shows: the first character of the first word
 * and, for a name of two or more words, of the last word, upper-cased. The
 * empty string for a name without words.
 */
export const displayNameInitials = (name: string): string => {
  const words = normalizeDisplayName(name).split(' ').filter(Boolean);
  if (words.length === 0) return '';
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map(word => Array.from(word)[0].toLocaleUpperCase()).join('');
};
