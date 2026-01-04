// MSP 2.0 - Field Info Tooltips
// Extracted from Demu RSS Template documentation

export const getFieldInfo = (medium: string = 'music') => {
  const isPublisher = medium === 'publisher';

  return {
    // Album/Publisher Section
    title: isPublisher
      ? "The name of your publisher feed."
      : "The name of your album.",
    author: isPublisher
      ? "The publisher name. This appears in the <itunes:author> tag."
      : "The artist or band name. This appears in the <itunes:author> tag.",
    description: isPublisher
      ? "A brief description of the publisher and what feeds it contains."
      : "A brief description of the album, band members, recording info, etc.",
    link: isPublisher
      ? "The main website for your publisher."
      : "The main website you want listeners to visit (usually a band website).",
    language: "The language the feed is written in. See rssboard.org/rss-language-codes for codes.",
    podcastGuid: "A Globally Unique ID used to identify your feed across platforms and services.",
    explicit: "Mark if your content contains explicit language or themes.",

    // Artwork
    imageUrl: isPublisher
      ? "Direct link to your publisher image. Ensure CORS policy allows all origins and headers."
      : "Direct link to your album art image. Ensure CORS policy allows all origins and headers.",
    imageTitle: isPublisher
      ? "Title/alt text for the publisher image."
      : "Title/alt text for the album artwork.",
    imageDescription: isPublisher
      ? "Optional description of the image."
      : "Optional description of the artwork or album.",

    // Persons/Credits
    personName: "The person's name as it should appear in credits.",
    personHref: "Link to the person's website or social profile.",
    personImg: "Link to the person's profile picture.",
    personGroup: "Category: music (performers), writing (songwriters), production (producers/engineers).",
    personRole: "Specific role: band, vocalist, guitarist, songwriter, producer, etc.",

    // Value Block
    recipientName: "Name of the payment recipient.",
    recipientAddress: "Lightning node pubkey (66 hex chars) or Lightning address (user@wallet.com). Type is auto-detected.",
    recipientSplit: "Percentage of payment this recipient receives. Splits are totaled and divided proportionally (must be whole numbers).",
    recipientCustomKey: "TLV record key for routing to subwallets (e.g., 696969).",
    recipientCustomValue: "Subwallet identifier or user ID for the payment destination.",

    // Funding
    fundingUrl: "URL where listeners can support your podcast (e.g., Patreon, Ko-fi, your website).",
    fundingText: "Call-to-action text (max 128 characters). E.g., 'Support the show!' or 'Become a member!'",

    // Tracks
    trackTitle: "The song title.",
    trackDescription: "Optional description or notes about the track.",
    trackDuration: "Total duration in HH:MM:SS format. Required for podcast apps.",
    enclosureUrl: "Direct link to the MP3 file. Ensure CORS policy allows access.",
    enclosureLength: "File size in MB. Important for podcast apps to show download size.",
    trackArtUrl: "Optional track-specific artwork. If empty, album art is used.",
    transcriptUrl: "Link to an SRT file with time-coded lyrics for display during playback.",
    trackGuid: "Unique identifier for this track. Auto-generated, or use guidgenerator.com to create one.",
    trackExplicit: "Mark if this specific track contains explicit content.",
    overridePersons: "Enable to set different credits for this track than the album level. Track-level persons replace album-level.",
    overrideValue: "Enable to set different payment splits for this track. Used for featuring guest artists or different producers per track.",
  };
};

// Keep FIELD_INFO for backward compatibility (defaults to music)
export const FIELD_INFO = getFieldInfo('music');
