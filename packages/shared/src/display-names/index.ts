/** The most graphemes a display name keeps. */
export const DISPLAY_NAME_MAX_GRAPHEMES = 30;

/**
 * The most UTF-16 code units normalizeDisplayName reads. A peer may send a
 * name of any size, and the cut keeps the work on it small.
 */
export const DISPLAY_NAME_MAX_INPUT_LENGTH = 1024;

/**
 * The most UTF-16 code units a display name keeps. A grapheme may stack any
 * number of combining marks, so 30 graphemes alone bound nothing.
 */
export const DISPLAY_NAME_MAX_LENGTH = 256;

const WHITESPACE = /\s+/gu;

/**
 * Format characters, without the zero-width non-joiner and joiner: emoji
 * sequences and scripts such as Persian need those two, and neither can
 * reorder or hide text the way a bidi override can.
 */
const FORMAT = /(?![\u200c\u200d])\p{Cf}/gu;

const CONTROL = /\p{Cc}/gu;

/**
 * Letters that render blank, the Hangul fillers and the braille blank, which
 * would make a name look empty.
 */
const FILLER = /[\u115f\u1160\u3164\uffa0\u2800]/gu;

const SEGMENTER = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const graphemes = (value: string): string[] =>
  Array.from(SEGMENTER.segment(value), ({ segment }) => segment);

/**
 * The leading graphemes of `value` up to both caps. The grapheme that would
 * pass `DISPLAY_NAME_MAX_LENGTH` ends the name, so no grapheme is split.
 */
const cut = (value: string): string => {
  let result = '';
  let count = 0;
  for (const { segment } of SEGMENTER.segment(value)) {
    if (count === DISPLAY_NAME_MAX_GRAPHEMES) break;
    if (result.length + segment.length > DISPLAY_NAME_MAX_LENGTH) break;
    result += segment;
    count += 1;
  }
  return result;
};

/**
 * The display name as every client stores, sends and shows it. Any client
 * writes its own awareness state, so a receiver applies this to every name it
 * reads, too. The result is plain text: a template must interpolate it, never
 * bind it as HTML.
 *
 * 1. A value that is no string becomes the empty string. Of a string, only
 *    the first `DISPLAY_NAME_MAX_INPUT_LENGTH` code units count.
 * 2. Format characters and blank fillers go. A tab or a line break becomes a
 *    space, and every other control character goes.
 * 3. Every run of whitespace collapses to one space, and the ends are trimmed.
 * 4. The name keeps its first `DISPLAY_NAME_MAX_GRAPHEMES` graphemes, and at
 *    most `DISPLAY_NAME_MAX_LENGTH` code units.
 *
 * The empty string means no display name.
 */
export const normalizeDisplayName = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .slice(0, DISPLAY_NAME_MAX_INPUT_LENGTH)
    .replace(FORMAT, '')
    .replace(FILLER, '')
    .replace(WHITESPACE, ' ')
    .replace(CONTROL, '')
    .replace(WHITESPACE, ' ')
    .trim();
  return cut(cleaned).trim();
};

/**
 * The initials the client list shows: the first grapheme of the first word
 * and, for a name of two or more words, of the last word, upper-cased. The
 * empty string for a name without words.
 */
export const displayNameInitials = (name: string): string => {
  const words = normalizeDisplayName(name).split(' ').filter(Boolean);
  if (words.length === 0) return '';
  const picked = words.length > 1 ? [words[0], words[words.length - 1]] : words;
  return picked.map(word => graphemes(word)[0].toLocaleUpperCase()).join('');
};
