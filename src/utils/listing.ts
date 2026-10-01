// Where a feed asks to be listed. Two tags carry it, and they mean different
// things:
//
// - <itunes:block>Yes</itunes:block> asks the podcast directories not to list
//   the feed. Apple Podcasts honours it, and so does Podcast Index (tested: it
//   acts on itunes:block and not on podcast:block).
// - <podcast:block>yes</podcast:block> with no id asks every service that reads
//   the Podcasting 2.0 namespace not to list it. A block with an id addresses one
//   named service; MSP has no control for those and passes them through.
//
// A musician may want to leave the podcast directories and still be found in
// music apps, so "directories" writes only itunes:block. "Everywhere" writes both,
// because each tag reaches services the other one does not.

export type Listing = 'listed' | 'directories' | 'everywhere';

export const LISTING_CHOICES: { value: Listing; label: string }[] = [
  { value: 'listed', label: 'Listed' },
  { value: 'directories', label: 'Hidden from podcast directories' },
  { value: 'everywhere', label: 'Hidden everywhere' },
];

interface BlockFlags {
  itunesBlock?: boolean;
  podcastBlock?: boolean;
}

/**
 * The choice that the two tags express, or 'custom' for the one combination the
 * control does not offer: a plain podcast:block with no itunes:block, which only
 * comes from an imported feed.
 */
export function listingOf(data: BlockFlags): Listing | 'custom' {
  if (data.podcastBlock) return data.itunesBlock ? 'everywhere' : 'custom';
  return data.itunesBlock ? 'directories' : 'listed';
}

export function listingFlags(listing: Listing): Required<BlockFlags> {
  return {
    itunesBlock: listing !== 'listed',
    podcastBlock: listing === 'everywhere',
  };
}
