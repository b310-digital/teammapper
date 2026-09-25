/** The protocols a node link may use. */
const ALLOWED_LINK_PROTOCOLS: readonly string[] = ['http:', 'https:'];

/**
 * Whether `href` is an absolute http or https URL. Rejects `javascript:`,
 * `data:` and the other schemes, which HTML sanitizers keep because a bare
 * URL holds no markup.
 */
export const isSafeLinkHref = (
  href: string | null | undefined
): href is string => {
  if (!href) return false;
  try {
    return ALLOWED_LINK_PROTOCOLS.includes(new URL(href).protocol);
  } catch {
    return false;
  }
};
