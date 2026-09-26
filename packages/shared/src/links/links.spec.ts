import { isSafeLinkHref } from './index';

describe('isSafeLinkHref', () => {
  it.each(['https://example.com', 'http://example.com/path?q=1'])(
    'accepts %s',
    href => {
      expect(isSafeLinkHref(href)).toBe(true);
    }
  );

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'example.com',
    '',
    null,
    undefined,
  ])('rejects %s', href => {
    expect(isSafeLinkHref(href)).toBe(false);
  });
});
