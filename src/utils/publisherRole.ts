import type { RemoteItem } from '../types/feed';

// What a publisher is to its catalog: the artist, or a label. It is written as
// `rel` on both sides of each publisher link — on the publisher feed's
// <podcast:remoteItem> for the album, and on the remoteItem inside the album's
// <podcast:publisher>. Both sides carry the same value, so an index sees them
// agree.
//
// `rel` on <podcast:remoteItem> is not in the spec yet. podcast-namespace PR
// #793 proposes it: a space-separated set of role tokens, so one party with two
// roles keeps one remoteItem (rel="artist producer"). Conforming parsers ignore
// an attribute they don't know, so writing it costs other readers nothing (the
// same reasoning that keeps `feedImg`).
//
// An absent rel means "not stated". MSP never writes a default role, so an index
// does not show a guess as a fact.

/** The starting role tokens of podcast-namespace PR #793, in its order. */
export const ROLE_TOKENS = [
  { value: 'artist', label: 'Artist' },
  { value: 'host', label: 'Host' },
  { value: 'author', label: 'Author' },
  { value: 'label', label: 'Label' },
  { value: 'producer', label: 'Producer' },
  { value: 'network', label: 'Network' },
  { value: 'hosting', label: 'Hosting' },
  { value: 'sponsor', label: 'Sponsor' },
] as const;

/** The choices of the one-role control that sets a whole catalog at once. */
export const PUBLISHER_ROLES = [
  { value: '', label: 'Not stated' },
  ...ROLE_TOKENS,
] as const;

/**
 * The tokens of a rel value, in their order, with no duplicates. PR #793
 * separates tokens with spaces; a comma is read as a separator too, because
 * some feeds wrote one before the PR. An unknown token is kept.
 */
export function roleTokens(rel: string | undefined): string[] {
  const tokens = (rel ?? '').split(/[\s,]+/).filter(Boolean);
  return [...new Set(tokens)];
}

/**
 * The rel value with `token` turned on or off. The known tokens keep the order
 * of ROLE_TOKENS, and an unknown token keeps its place after them. Gives '' when
 * no token is left, which means "not stated".
 */
export function withRoleToken(rel: string | undefined, token: string, on: boolean): string {
  const current = roleTokens(rel);
  const next = on
    ? (current.includes(token) ? current : [...current, token])
    : current.filter(existing => existing !== token);
  const known: string[] = ROLE_TOKENS.map(role => role.value);
  return [
    ...known.filter(value => next.includes(value)),
    ...next.filter(value => !known.includes(value)),
  ].join(' ');
}

/**
 * The role every catalog item states: '' when none states one (or the catalog
 * is empty), or null when the items differ — which only happens for an imported
 * feed that wrote different values per item.
 */
export function catalogRole(items: RemoteItem[]): string | null {
  const roles = new Set(items.map(item => item.rel || ''));
  if (roles.size === 0) return '';
  if (roles.size === 1) return [...roles][0];
  return null;
}

/** The item with `rel` set to the role, or with no `rel` when the role is ''. */
export function withRole(item: RemoteItem, role: string): RemoteItem {
  const next: RemoteItem = { ...item };
  if (role) {
    next.rel = role;
  } else {
    delete next.rel;
  }
  return next;
}
