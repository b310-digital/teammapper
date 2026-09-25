/** The protocols a node link may use. */
export const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:'] as const;

/**
 * Whether `href` is an absolute http or https URL. Rejects `javascript:` and
 * every other scheme, which HTML sanitizers leave untouched because a bare URL
 * holds no markup.
 */
export const isSafeLinkHref = (href: string | null | undefined): boolean => {
  if (!href) return false;
  try {
    const { protocol } = new URL(href);
    return (ALLOWED_LINK_PROTOCOLS as readonly string[]).includes(protocol);
  } catch {
    return false;
  }
};
