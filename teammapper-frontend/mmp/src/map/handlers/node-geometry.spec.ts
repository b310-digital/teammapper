import {
  MIN_TEXT_EXTENT,
  NODE_HEIGHT_PADDING,
  NODE_WIDTH_PADDING,
  estimateNodeExtent,
  estimateTextExtent,
} from './node-geometry';

/**
 * The one place the numbers behind the size approximation are pinned, so the
 * expectations below are literals on purpose: asserting against the imported
 * constants would move both sides of the comparison together and pin nothing.
 */

const FONT_SIZE = 16;
const LINE_HEIGHT_FACTOR = 1.2;
const WIDTH_PER_CHARACTER = 1 / 1.2;

describe('estimateTextExtent', () => {
  it('widens by one character width per character', () => {
    const twenty = 'a'.repeat(20);

    const extent = estimateTextExtent(twenty, FONT_SIZE);

    expect(extent.width).toBeCloseTo(20 * FONT_SIZE * WIDTH_PER_CHARACTER);
  });

  it('widens with the longest line, not the total character count', () => {
    const oneLong = estimateTextExtent('aaaaaaaaaa', FONT_SIZE);
    const twoShort = estimateTextExtent('aaaaa\naaaaa', FONT_SIZE);

    expect(twoShort.width).toBeLessThan(oneLong.width);
  });

  // Two and three lines rather than one and two: a single line at this font
  // size measures 19.2px, below MIN_TEXT_EXTENT, so the clamp would hide the
  // per-line step.
  it('grows in height by one line height per line', () => {
    const two = estimateTextExtent('first line\nsecond line', FONT_SIZE);
    const three = estimateTextExtent(
      'first line\nsecond line\nthird line',
      FONT_SIZE
    );

    expect(three.height - two.height).toBeCloseTo(
      FONT_SIZE * LINE_HEIGHT_FACTOR
    );
  });

  it('scales with the font size', () => {
    const label = 'a long enough label\nover three\nseparate lines';
    const small = estimateTextExtent(label, 10);
    const large = estimateTextExtent(label, 20);

    expect(large.width).toBeCloseTo(small.width * 2);
    expect(large.height).toBeCloseTo(small.height * 2);
  });

  it('never returns less than the minimum extent for a tiny label', () => {
    const extent = estimateTextExtent('a', FONT_SIZE);

    expect(extent.width).toBe(MIN_TEXT_EXTENT);
    expect(extent.height).toBe(MIN_TEXT_EXTENT);
  });

  it.each([
    ['unix', '\n'],
    ['windows', '\r\n'],
    ['classic mac', '\r'],
  ])('counts a %s line break', (_platform, newline) => {
    const extent = estimateTextExtent(
      `a long enough line${newline}and another`,
      FONT_SIZE
    );

    expect(extent.height).toBeCloseTo(2 * FONT_SIZE * LINE_HEIGHT_FACTOR);
  });
});

describe('estimateNodeExtent', () => {
  it('adds 45px of width and 30px of height for the node shape', () => {
    const label = 'a reasonably long label';

    const text = estimateTextExtent(label, FONT_SIZE);
    const box = estimateNodeExtent(label, FONT_SIZE);

    expect(box.width).toBeCloseTo(text.width + 45);
    expect(box.height).toBeCloseTo(text.height + 30);
    // The renderer pads the measured label box by the same amounts.
    expect(NODE_WIDTH_PADDING).toBe(45);
    expect(NODE_HEIGHT_PADDING).toBe(30);
  });

  it('pads the minimum extent too, so no node is drawn tiny', () => {
    const box = estimateNodeExtent('a', FONT_SIZE);

    expect(box.width).toBe(MIN_TEXT_EXTENT + 45);
    expect(box.height).toBe(MIN_TEXT_EXTENT + 30);
  });
});
