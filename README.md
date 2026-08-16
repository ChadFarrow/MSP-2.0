# MSP 2.0 - Music Side Project Studio

A web-based RSS feed editor for creating Podcasting 2.0 compatible music album feeds, video feeds, and publisher catalogs with Value 4 Value support.

## Features

### Album Mode
- Create and edit podcast RSS feeds for music albums
- Podcasting 2.0 namespace support (podcast:person, podcast:value, podcast:funding, etc.)
- Value 4 Value (V4V) Lightning payment splits
- Per-track value recipient overrides
- Funding links for listener support (Patreon, Ko-fi, etc.)
- Publisher reference linking (connect albums to a publisher feed)
- Additional artwork via `<podcast:image>` — banners, canvas backgrounds, social cards at feed and track level, with dimensions auto-detected from the image
- Track lyrics via `<podcast:transcript>` (SubRip, VTT, JSON and plain text)
- Enclosure file sizes measured automatically (HEAD request, falling back to a duration-based estimate)
- Track order kept in sync with pub dates — podcast apps sort newest-first, so track 1 carries the newest date. Imported feeds that are out of order get a one-click fix rather than a silent rewrite
- Import/export feeds as XML
- Local storage persistence

### Video Mode
- Create RSS feeds for video content (podcast:medium = video)
- Same feature set as Album mode with video-specific defaults
- Video enclosure type support (video/mp4, etc.)

### Publisher Mode
- Create publisher/label catalog feeds
- Manage multiple album feeds under one publisher identity
- Podcast Index integration (search and add feeds by name or GUID)
- Bulk download catalog feeds with publisher references
- Host publisher feeds on MSP with automatic Podcast Index notification
- Nostr or email identity linking for token-free editing

### Integrations
- Nostr cloud sync (NIP-07 browser extension + NIP-46 remote signer)
- Nostr Music publishing (kind 36787 track events + kind 34139 playlist) with NIP-09 unpublish
- NIP-71 `naddr` video resolution (paste an `naddr` into a Video URL field to auto-fill)
- Podcast Index search, feed submission, and pubnotify
- MSP feed hosting with edit tokens, Nostr-linked and email-linked ownership
- Email magic-link feed ownership — passwordless sign-in for people who don't use Nostr
- Blossom server uploads (BUD-01) for file hosting
- nsite (NIP-5A) publishing — decentralized feed hosting via Blossom + site manifest
- OP3 analytics prefix support for privacy-respecting download stats
- Podping broadcasts via self-hosted [podping-hivepinger](https://github.com/brianoflondon/podping-hivepinger) — auto-fires on Host on MSP updates, with a standalone toolbar button for manual pings
- Feed URL checking — pasted URLs are cleaned up, and MSP verifies a feed is actually reachable before submitting it to Podcast Index
- Dark/light theme support

### Experimental features
A **Show Experimental Features** toggle in the hamburger menu (off by default) reveals
the power-user options in the Import and Save modals. Anything marked 🧪 below is hidden
until that toggle is on.

## Tech Stack

- React 19 + TypeScript 5.9
- Vite 7
- Vercel (hosting + serverless API + Blob storage)
- Nostr (NIP-07, NIP-46, NIP-98)

## Project Structure

Test files (`*.test.ts`) sit alongside the modules they cover and are omitted here.

```
src/
├── components/
│   ├── Editor/
│   │   ├── Editor.tsx              # Album/video editor
│   │   └── PublisherEditor/        # Publisher mode components
│   │       ├── index.tsx
│   │       ├── PublisherInfoSection.tsx
│   │       ├── PublisherArtworkSection.tsx
│   │       ├── CatalogFeedsSection.tsx
│   │       ├── PublisherValueSection.tsx
│   │       ├── PublisherFundingSection.tsx
│   │       ├── DownloadCatalogSection.tsx
│   │       ├── PublishSection.tsx
│   │       └── PublisherFeedReminderSection.tsx
│   ├── modals/
│   │   ├── ImportModal.tsx         # Import feed modal
│   │   ├── SaveModal.tsx           # Save options modal
│   │   ├── PreviewModal.tsx        # Feed preview modal
│   │   ├── InfoModal.tsx           # Info/about modal (renders public/info.md)
│   │   ├── NostrConnectModal.tsx   # NIP-46 remote signer
│   │   ├── NewFeedChoiceModal.tsx  # Start blank vs. use template
│   │   ├── PodpingModal.tsx        # Manual Podping broadcast (toolbar button)
│   │   ├── ConfirmModal.tsx        # Confirmation dialog
│   │   └── ModalWrapper.tsx        # Shared modal layout
│   ├── auth/
│   │   ├── EmailLoginModal.tsx     # Email magic-link login + feed claim
│   │   └── SignInPrompt.tsx        # Sign-in nudge before hosting
│   ├── admin/
│   │   ├── AdminPage.tsx           # Admin panel
│   │   ├── FeedList.tsx            # Feed management list
│   │   └── DeleteConfirmModal.tsx  # Feed deletion confirm
│   ├── AddRecipientSelect.tsx      # Recipient auto-complete
│   ├── ArtworkFields.tsx           # Artwork fields
│   ├── FundingFields.tsx           # Funding link fields
│   ├── InfoIcon.tsx                # Tooltip component
│   ├── NostrLoginButton.tsx        # Nostr auth button
│   ├── PodcastImagesList.tsx       # <podcast:image> additional artwork
│   ├── PodcastIndexIcon.tsx        # Podcast Index toolbar mark
│   ├── RecipientsList.tsx          # Value recipients with community support
│   ├── Section.tsx                 # Collapsible section
│   └── Toggle.tsx                  # Toggle switch
├── pages/
│   └── VerifyMagicLink.tsx         # /auth/verify magic-link landing page
├── store/
│   ├── feedStore.tsx               # Album, video & publisher state
│   ├── nostrStore.tsx              # Nostr auth state
│   ├── experimentalStore.tsx       # Show Experimental Features toggle
│   └── themeStore.tsx              # Dark/light theme state
├── types/
│   ├── feed.ts                     # Album/track/publisher types
│   └── nostr.ts                    # Nostr types
├── utils/
│   ├── addressUtils.ts             # Lightning address detection
│   ├── adminAuth.ts                # Admin auth (client-side)
│   ├── audioUtils.ts               # Audio duration + enclosure size detection
│   ├── blossom.ts                  # Blossom server uploads
│   ├── comparison.ts               # Value block comparison
│   ├── dateUtils.ts                # RFC-822 + Nostr `released` date formatting
│   ├── emailSession.ts             # Email magic-link session handling
│   ├── hostedFeed.ts               # MSP hosted feed management
│   ├── imageMetadata.ts            # Image dimension/MIME detection
│   ├── nostr.ts                    # Nostr key utilities
│   ├── nostrMusicConverter.ts      # Album ↔ Nostr Music conversion
│   ├── nostrRelay.ts               # Relay connection management
│   ├── nostrSigner.ts              # NIP-46 remote signer + timeout wrappers
│   ├── nostrSync.ts                # Relay sync (kind 30054)
│   ├── nostrVideoConverter.ts      # NIP-71 naddr video resolution
│   ├── nsite.ts                    # nsite (NIP-5A) publishing
│   ├── publisherPublish.ts         # Publisher feed hosting
│   ├── regenerateGuids.ts          # Fresh GUIDs for template imports
│   ├── storage.ts                  # localStorage utilities
│   ├── testData.ts                 # Dev-mode sample album generator
│   ├── trackOrder.ts               # Track order ↔ pubDate sequencing
│   ├── urlValidation.ts            # Feed URL normalization + rules
│   ├── valueValidation.ts          # Value block guardrails
│   ├── verifyFeedUrl.ts            # Feed reachability pre-flight
│   ├── videoUtils.ts               # Video feed utilities
│   ├── xmlGenerator.ts             # RSS XML generation
│   └── xmlParser.ts                # RSS XML parsing
├── data/
│   └── fieldInfo.ts                # Form field tooltips
├── App.tsx                         # Main app with mode switching
└── App.css                         # Styles

api/
├── _utils/
│   ├── accountStore.ts             # Email account + magic-link blob storage
│   ├── adminAuth.ts                # Nostr NIP-98 auth verification
│   ├── emailAuth.ts                # Email session JWTs + email hashing
│   ├── feedHydrate.ts              # Shared hosted-feed hydration
│   ├── feedProbe.ts                # Shared feed reachability probe
│   ├── feedReachability.ts         # Submit guard (refuses blocked feeds)
│   ├── feedUtils.ts                # Shared feed utilities (PI + Podping)
│   ├── podcastIndex.ts             # Podcast Index auth headers
│   ├── rateLimiter.ts              # In-memory IP rate limiter
│   ├── safeFetch.ts                # SSRF-checked fetch + redirect walking
│   ├── sendEmail.ts                # Resend magic-link delivery
│   ├── urlSafety.ts                # SSRF guards (private host/address checks)
│   ├── urlValidation.ts            # Feed URL normalization (mirrors src/)
│   └── xmlUtils.ts                 # RSS XML helpers (podcast:medium)
├── account/
│   └── feeds.ts                    # List an email account's feeds
├── admin/
│   ├── challenge.ts                # Auth challenge generation
│   └── verify.ts                   # Auth verification
├── auth/
│   ├── magic-link.ts               # Request a magic link
│   └── verify.ts                   # Redeem a magic link → session
├── feed/
│   └── [npub]/[guid].ts            # Nostr-stored feed retrieval
├── hosted/
│   ├── index.ts                    # Create/list hosted feeds
│   └── [feedId].ts                 # Get/update/delete hosted feeds
├── example-feed.ts                 # Reference feed showing MSP's output
├── op3check.ts                     # Whether OP3 has stats for a GUID
├── pisearch.ts                     # Podcast Index search
├── pisubmit.ts                     # Podcast Index feed submission
├── podping.ts                      # Manual podping broadcast (rate-limited)
├── podping-verify.ts               # Check a podping landed on Hive
├── proxy-feed.ts                   # Feed proxy for CORS
├── pubnotify.ts                    # Podcast Index pub notification
└── verify-feed-url.ts              # Feed reachability check
```

Want to see what MSP actually produces? [`/api/example-feed`](https://musicsideproject.com/api/example-feed)
serves a reference feed with Value 4 Value splits, person credits, track-level value
overrides and lyrics.

## Development

```bash
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server (proxies `/api/*` to production) |
| `npm run build` | TypeScript compile + Vite build |
| `npm run lint` | ESLint |
| `npm run test` | Run the test suite (Vitest) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run preview` | Preview the production build |

A `.env` file is required for the API functions (Podcast Index credentials, Vercel Blob
token, Podping and email settings). There is no `.env.example` — see the Development
section of `CLAUDE.md` for the full list, and ask the team for credentials.

> **Typecheck with `npm run build`, not `tsc --noEmit`.** The root `tsconfig.json` is
> references-only, so `tsc --noEmit` checks zero files and always passes. Use
> `npm run build` or `npx tsc -b`.

## Publisher Mode

Switch to Publisher mode using the dropdown in the header to create a publisher/label catalog feed.

### Creating a Publisher Feed
1. Enter your publisher name and catalog title
2. Add catalog feeds by searching Podcast Index or entering feed GUIDs directly
3. Configure optional value splits and funding links
4. Download catalog feeds with publisher references added

### Publishing to MSP
Once all your catalog feeds are hosted on MSP, the "Publish on MSP" section appears:
1. Host your publisher feed on MSP servers
2. Automatically notify Podcast Index of your publisher feed
3. Add `<podcast:publisher>` references to all catalog feeds

## Import Options (Album/Video Mode)

- **Upload File** - Upload an RSS/XML feed file from your device
- **Paste XML** - Paste RSS/XML content directly
- **From URL** - Fetch a feed from any URL
- **MSP Hosted** - Load a feed hosted on MSP servers using its Feed ID, or pick from your account's feeds
- **From Nostr Music** - Import tracks from Nostr Music library (requires login)
- **Nostr Event 🧪** - Import from a Nostr Music event (kind 36787)
- **From Nostr 🧪** - Load your previously saved feeds from Nostr (kind 30054, requires login)
- **naddr paste (Video mode)** - Paste a NIP-71 `naddr` (or a URL containing one) into a Video URL field to auto-resolve URL, MIME type, and duration

## Save Options

There are nine destinations. Album and Video mode see all nine; Publisher mode sees the
same list minus **Publish to Nostr Music**.

- **Local Storage** - Save to your browser's local storage. Data persists until you clear browser data.
- **Download XML** - Download the RSS feed as an XML file to your computer.
- **Copy to Clipboard** - Copy the RSS XML to your clipboard for pasting elsewhere.
- **Host on MSP** - Host your feed on MSP servers. Get a permanent subscribable URL (`https://musicsideproject.com/api/hosted/{feedId}.xml`) to use in any podcast app. Sign in with email or Nostr so the feed is owned by your account and editable from any device. Enable **Draft mode** to host without notifying Podcast Index or sending a podping.
- **Submit to PodcastIndex** - Submit a feed URL to Podcast Index so it gets indexed and becomes discoverable in apps like Fountain, Castamatic, and others.
- **Publish to Nostr Music** - Publish each track as a kind 36787 event plus a kind 34139 playlist event for Nostr-native music apps like Sunami. Audio files must already be hosted somewhere — the events just point at them. Includes an Unpublish button that sends a NIP-09 deletion request (requires login).
- **Save RSS feed to Nostr 🧪** - Embed the full RSS XML in a kind 30054 event for personal cross-device sync. Only MSP reads this event — not subscribable in podcast apps (requires login).
- **Publish RSS feed to a Blossom server 🧪** - Upload your feed to a Blossom server with a kind 1063 (NIP-94) pointer event so `${origin}/api/feed/{npub}/{podcastGuid}.xml` always resolves to the latest upload. Subscribable in podcast apps (requires login).
- **Publish RSS feed to nsite 🧪** - Publish via Blossom + a NIP-5A site manifest (kind 35128). Subscribable via any nsite gateway URL, and auto-submitted to Podcast Index (requires login).

Podping is not a save destination — it has its own button on the bottom toolbar.

## Feed URLs

Any field where you paste a feed URL gets two layers of help:

- **Cleanup** — stray spaces, tabs, newlines and zero-width characters around the URL are
  trimmed as you type. Whitespace *inside* the URL is reported rather than silently
  removed, because deleting it would submit a URL you don't actually have — rename the
  file at your host instead.
- **Reachability** — before submitting to Podcast Index, MSP checks the feed actually
  answers. This is advisory: a failed check warns you and relabels the button to
  "Submit anyway", it never blocks you. A feed sitting behind bot protection is the case
  worth heeding — it registers in Podcast Index and then stays permanently blank because
  the crawler gets a 403.

## Nostr Integration

Sign in with a NIP-07 compatible browser extension (Alby, nos2x, etc.) or connect a NIP-46 remote signer (Amber, nsecBunker) to:
- Save RSS feeds to Nostr relays (kind 30054, for cross-device sync)
- Load feeds from any device with your Nostr key
- Publish Nostr Music (kind 36787 track events + kind 34139 playlist), with NIP-09 unpublish
- Publish to Blossom servers (BUD-01 auth, NIP-94 pointer events)
- Publish to nsite (NIP-5A site manifests, kind 35128)
- Link your identity to MSP-hosted feeds for token-free editing

Default relays:
- wss://relay.damus.io
- wss://relay.primal.net
- wss://nos.lol

Nostr Music publishing (kinds 36787/34139) and its NIP-09 deletions additionally use
`wss://drops.basspistol.org`, a public relay that only accepts music kinds.

## Email Feed Ownership

If you'd rather not use Nostr, you can own MSP-hosted feeds with just an email address.
It's a third owner type alongside the edit token and Nostr — every hosted feed write
accepts any of the three.

- **Passwordless.** Enter your email, get a magic link, click it. No password to pick or forget.
- **Your address is never stored.** MSP keeps only a keyed HMAC of it, so the raw email
  isn't in the database to leak.
- The link lands on `/auth/verify`, which redeems it once and hands back a session.
- An existing feed can be **claimed** by proving you hold its edit token, which then ties
  it to your email for good.

Requires `RESEND_API_KEY`, `MSP_EMAIL_FROM`, `MSP_SESSION_SECRET` and `MSP_EMAIL_HASH_KEY`
to be set, plus SPF/DKIM/DMARC records on the sending domain. Unconfigured, the feature
cleanly no-ops.

## Podping

MSP broadcasts feed-update [Podpings](https://podping.org/) via a companion service:
[ChadFarrow/msp-podping-service](https://github.com/ChadFarrow/msp-podping-service) (a Dockerized
[podping-hivepinger](https://github.com/brianoflondon/podping-hivepinger) behind a Caddy
bearer-auth sidecar, deployed on Railway).

- **Automatic**: every `Host on MSP` create/update fires a podping in the background
- **Manual**: standalone **Podping** button on the bottom toolbar
- **Direct API**: `GET /api/podping?url=<feedUrl>&reason=update` (rate-limited to 10/hour per IP)

A 200 from the podping endpoint only means the ping was *queued* — the Hive broadcast is
asynchronous. The manual Podping button therefore follows up by polling
`/api/podping-verify` to confirm the ping actually landed on-chain, reporting
"✅ Podping received", "Not received yet — it may still be queued", or "Couldn't check
Hive right now". The automatic podpings stay fire-and-forget.

Note that a delivered podping only tells indexers to go and look. If your own host then
answers their crawler with a 403 (Cloudflare Bot Fight Mode is the usual culprit on
WordPress sites), the feed registers and stays blank. That's what the reachability check
above is guarding against.

Requires two Vercel env vars to activate: `PODPING_ENDPOINT_URL` (Railway URL, trailing slash)
and `PODPING_BEARER_TOKEN` (matches the service's `PODPING_SHARED_SECRET`). Both unset →
MSP silently skips the broadcast and falls back to Podcast Index pubnotify only.

## License

MIT
