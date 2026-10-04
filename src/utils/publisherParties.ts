import type { Album, PublisherReference } from '../types/feed';

// An album can name more than one publisher feed: the artist and the label
// that released it, or two artists. Each party is one
// <podcast:remoteItem medium="publisher"> inside <podcast:publisher>, the
// primary party first, and each publisher feed lists the album back with the
// same `rel`. podcast-namespace PR #793 proposes this; the current spec says
// the element holds exactly one item.
//
// MSP keeps the first party in `album.publisher` and the rest in
// `album.additionalPublishers`, so albums saved before this change load as
// they are.

type PublisherFields = Pick<Album, 'publisher' | 'additionalPublishers'>;

/** Every party the album names, primary first. Empty when it names none. */
export function publisherParties(album: PublisherFields): PublisherReference[] {
  return [
    ...(album.publisher ? [album.publisher] : []),
    ...(album.additionalPublishers ?? []),
  ];
}

/** The two fields for a list of parties: the first is the primary party. */
export function fromParties(parties: PublisherReference[]): PublisherFields {
  const [primary, ...rest] = parties;
  return {
    publisher: primary,
    additionalPublishers: rest.length > 0 ? rest : undefined,
  };
}

/** True when both references point at the same publisher feed. */
export function samePublisher(a: PublisherReference, b: PublisherReference): boolean {
  if (a.feedGuid && b.feedGuid) return a.feedGuid === b.feedGuid;
  return !!a.feedUrl && a.feedUrl === b.feedUrl;
}

/**
 * The album's parties with `party` set: it replaces the entry for the same
 * publisher feed in place, or becomes the primary party when the album names
 * none, or is added after the others. Every other party is kept.
 *
 * The publish and Download Catalog flows used to overwrite `album.publisher`,
 * which removed any other party the album named.
 */
export function withPublisherParty(album: PublisherFields, party: PublisherReference): PublisherFields {
  const parties = publisherParties(album);
  const index = parties.findIndex(existing => samePublisher(existing, party));
  if (index >= 0) {
    parties[index] = party;
  } else {
    parties.push(party);
  }
  return fromParties(parties);
}

/** A reference with `rel` set, or with no `rel` when the role is ''. */
export function withRel(party: PublisherReference, rel: string): PublisherReference {
  const next: PublisherReference = { ...party };
  if (rel) {
    next.rel = rel;
  } else {
    delete next.rel;
  }
  return next;
}
