# MSP 2.0 - Music Side Project Studio

A web-based RSS feed editor for creating Podcasting 2.0 compatible music album feeds with Value 4 Value support.

## Features

- Create and edit podcast RSS feeds for music albums
- Podcasting 2.0 namespace support (podcast:person, podcast:value, etc.)
- Value 4 Value (V4V) Lightning payment splits
- Per-track value recipient overrides
- Nostr integration for cloud sync (NIP-07)
- Import/export feeds as XML
- Local storage persistence

## Tech Stack

- React 18 + TypeScript
- Vite
- Nostr (NIP-07 browser extension support)

## Project Structure

```
src/
├── components/
│   ├── Editor/
│   │   └── Editor.tsx        # Main form editor
│   ├── modals/
│   │   ├── ImportModal.tsx   # Import feed modal
│   │   └── SaveModal.tsx     # Save options modal
│   ├── InfoIcon.tsx          # Tooltip component
│   ├── NostrLoginButton.tsx  # Nostr auth button
│   ├── Section.tsx           # Collapsible section
│   └── Toggle.tsx            # Toggle switch
├── store/
│   ├── feedStore.tsx         # Album state management
│   └── nostrStore.tsx        # Nostr auth state
├── types/
│   ├── feed.ts               # Album/track types
│   └── nostr.ts              # Nostr types
├── utils/
│   ├── nostr.ts              # Nostr utilities
│   ├── nostrSync.ts          # Relay sync (kind 30054)
│   ├── xmlGenerator.ts       # RSS XML generation
│   └── xmlParser.ts          # RSS XML parsing
├── data/
│   └── fieldInfo.ts          # Form field tooltips
├── App.tsx                   # Main app component
└── App.css                   # Styles
```

## Development

```bash
npm install
npm run dev
```

## Nostr Integration

Sign in with a NIP-07 compatible browser extension (Alby, nos2x, etc.) to:
- Save feeds to Nostr relays (kind 30054)
- Load feeds from any device with your Nostr key

Default relays:
- wss://relay.damus.io
- wss://relay.primal.net
- wss://nos.lol
- wss://relay.nostr.band

## License

MIT
