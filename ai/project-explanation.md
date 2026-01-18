# MSP 2.0 - Project Explanation

## Overview

MSP 2.0 (Music Side Project Studio) is a web-based RSS feed editor for creating Podcasting 2.0 compatible music album feeds with Value 4 Value (V4V) Lightning payment splits. It allows musicians to create professional podcast-style RSS feeds for their albums, with support for Bitcoin Lightning payments and Nostr integration for cloud sync.

## Tech Stack

- **Frontend**: React 19 + TypeScript
- **Build Tool**: Vite 7
- **Backend**: Vercel Serverless Functions
- **Storage**: Vercel Blob Storage
- **Protocols**: Nostr (NIP-07, NIP-46), Podcasting 2.0, Blossom
- **Payment**: Bitcoin Lightning (keysend, lnaddress)

## Project Architecture

### Entry Points

1. **[src/main.tsx](src/main.tsx#L7-L9)** - React application bootstrap
2. **[src/App.tsx](src/App.tsx#L198-L208)** - Main routing logic, conditionally renders:
   - Admin panel at `/admin` route
   - Main editor for all other routes

### Core State Management

The application uses React Context for state management:

#### 1. Feed Store ([src/store/feedStore.tsx](src/store/feedStore.tsx))

**Purpose**: Manages the album/feed data and edit state

**Key Actions** (lines 8-31):
- `SET_ALBUM` - Load a complete album
- `UPDATE_ALBUM` - Update album metadata
- `ADD_PERSON/UPDATE_PERSON/REMOVE_PERSON` - Manage credits
- `ADD_RECIPIENT/UPDATE_RECIPIENT/REMOVE_RECIPIENT` - Manage payment splits
- `ADD_TRACK/UPDATE_TRACK/REMOVE_TRACK/REORDER_TRACKS` - Manage tracks
- Track-level person/recipient overrides

**State Structure** (lines 34-37):
- `album: Album` - The complete feed data
- `isDirty: boolean` - Whether unsaved changes exist

**Persistence** (lines 270-281):
- Auto-saves to localStorage on changes
- Loads from localStorage on mount

#### 2. Nostr Store ([src/store/nostrStore.tsx](src/store/nostrStore.tsx))

**Purpose**: Manages Nostr authentication and connection state

**Connection Methods**:
- NIP-07: Browser extension (Alby, nos2x)
- NIP-46: Remote signer via bunker URI

**Key Actions** (lines 20-31):
- `LOGIN_SUCCESS` - User authenticated
- `UPDATE_PROFILE` - Refresh profile metadata
- `LOGOUT` - Clear session
- `RESTORE_SESSION` - Resume previous session

**Session Management** (lines 107-181):
- On mount, checks for NIP-07 extension
- Attempts to restore previous session
- For NIP-46, tries to reconnect to remote signer
- Fetches profile metadata in background

**Login Flow** (lines 185-251):
- NIP-07: Direct extension access
- NIP-46: Generate connection URI or parse bunker URI
- Store connection method in localStorage

### Type Definitions

#### Feed Types ([src/types/feed.ts](src/types/feed.ts))

**Core Interfaces**:
- `Album` (lines 50-94) - Complete feed metadata
- `Track` (lines 30-50) - Individual song/episode
- `Person` (lines 3-8) - Credits (musician, producer, etc.)
- `ValueRecipient` (lines 10-16) - Lightning payment split
- `ValueBlock` (lines 18-22) - Payment configuration
- `Funding` (lines 24-27) - Support links (Patreon, Ko-fi)

**Important Features**:
- Tracks can override album-level persons and value splits
- Supports both `node` and `lnaddress` payment types
- Medium is always 'music' or 'musicL' (live)

#### Nostr Types ([src/types/nostr.ts](src/types/nostr.ts))

**Core Interfaces**:
- `NostrUser` (lines 37-43) - User profile
- `NostrAuthState` (lines 46-52) - Auth status
- `NostrEvent` (lines 4-12) - Standard Nostr event
- `NostrMusicTrackInfo` (lines 75-89) - Kind 36787 music track
- `SavedAlbumInfo` (lines 55-61) - Kind 30054 feed summary

## Major Components

### 1. Editor Component ([src/components/Editor/Editor.tsx](src/components/Editor/Editor.tsx))

**Purpose**: Main form for editing album and track data

**Structure** (lines 711 total):
- Album Info section (lines 60-139)
- Artwork section (lines 142-188)
- Credits/Persons section (lines 191-268)
- Value/Payment splits section (lines 271-401)
- Funding links section (lines 404-470)
- Tracks section (lines 473-711) - with per-track overrides

**Key Features**:
- Collapsible track sections to manage large albums
- Duration auto-formatting (HH:MM:SS)
- Dynamic role options based on person group
- Value recipient validation (split percentages)

### 2. Import Modal ([src/components/modals/ImportModal.tsx](src/components/modals/ImportModal.tsx))

**Import Sources** (lines 19-27):
1. **File Upload** - Upload XML from disk
2. **Paste XML** - Direct XML input
3. **From URL** - Fetch remote RSS feed
4. **Nostr Event** - Parse kind 36787 JSON event
5. **MSP Hosted** - Load from hosted feed by ID
6. **From Nostr** - Load kind 30054 feeds from relays
7. **From Nostr Music** - Import kind 36787 music tracks

**Key Functions**:
- `fetchSavedAlbums` (lines 35-48) - Query Nostr relays for user's feeds
- `handleLoadFromNostr` (lines 50-62) - Load specific feed by d-tag
- `fetchMusicTracks` (lines 65-80) - Query Nostr for music tracks
- `handleImportMusicAlbum` (lines 82-94) - Convert Nostr Music to RSS
- `handleImportHosted` (lines 110-140) - Fetch hosted feed, optionally store credentials

### 3. Save Modal ([src/components/modals/SaveModal.tsx](src/components/modals/SaveModal.tsx))

**Save Destinations** (lines 25):
1. **Local Storage** - Browser localStorage
2. **Download XML** - Save file to disk
3. **Copy to Clipboard** - Copy RSS XML
4. **Host on MSP** - Upload to Vercel Blob
5. **Save to Nostr** - Publish kind 30054 event
6. **Publish Nostr Music** - Publish kind 36787 events per track
7. **Publish to Blossom** - Upload to Blossom server

**Hosted Feed Management**:
- Creates feed with podcast GUID as ID
- Generates secure edit token (32-byte random)
- Stores credentials in localStorage
- Restore flow to reconnect to existing feeds (lines 117-180)

**Nostr Music Publishing** (lines 322-385):
- Publishes each track as separate kind 36787 event
- Shows progress UI with track-by-track status
- Converts value splits to Nostr zap splits

### 4. Admin Page ([src/components/admin/AdminPage.tsx](src/components/admin/AdminPage.tsx))

**Purpose**: View and manage all hosted feeds (admin only)

**Auth Flow** (lines 20-26):
- Checks for NIP-07 extension
- Requires Nostr login
- Validates against authorized pubkeys

**Components**:
- `FeedList` ([src/components/admin/FeedList.tsx](src/components/admin/FeedList.tsx)) - Lists all feeds
- `DeleteConfirmModal` - Confirmation for destructive actions

## Utility Modules

### XML Processing

#### XML Generator ([src/utils/xmlGenerator.ts](src/utils/xmlGenerator.ts))

**Main Function**: `generateRssFeed(album: Album): string` (line 137)

**Process**:
1. Creates XML declaration
2. Adds RSS root with Podcasting 2.0 namespaces
3. Generates channel metadata (lines 152-196)
4. Adds album-level persons, value block, funding
5. Generates each track as `<item>` (lines 76-119)
6. Handles track-level overrides for persons/value

**Key Features**:
- XML escaping for special characters (lines 9-16)
- Proper indentation (line 19)
- Conditional method switching (keysend vs lnaddress) based on recipient types (lines 54-56)

#### XML Parser ([src/utils/xmlParser.ts](src/utils/xmlParser.ts))

**Main Function**: `parseRssFeed(xmlString: string): Album` (line 9)

**Process**:
1. Parse XML with fast-xml-parser (lines 10-17)
2. Extract channel metadata (lines 26-53)
3. Parse persons array (lines 76-87)
4. Parse value block and recipients (lines 89-92)
5. Parse funding links (lines 95-100)
6. Parse each item as track (lines 103-108)

**Helper Functions**:
- `getText` (lines 113-122) - Extract text content
- `getAttr` (lines 125-132) - Extract attributes
- `parsePerson` (lines 135-147)
- `parseValueBlock` (lines 161-189)
- `parseTrack` (lines 192-305)

**Important**: Detects if tracks override album-level persons/value by comparing with album defaults (lines 276-295)

### Nostr Integration

#### Nostr Sync ([src/utils/nostrSync.ts](src/utils/nostrSync.ts))

**Key Functions**:

1. **`saveAlbumToNostr`** (lines 101-136)
   - Generates RSS XML
   - Creates kind 30054 event
   - Signs with current signer
   - Publishes to multiple relays
   - Returns success count

2. **`loadAlbumsFromNostr`** (lines 139-181)
   - Queries all kind 30054 events by user
   - Collects from multiple relays
   - Returns list of saved albums with metadata

3. **`loadAlbumByDTag`** (lines 184-235)
   - Loads specific album by d-tag (podcast GUID)
   - Finds most recent event
   - Parses RSS XML from content
   - Returns Album object

4. **`fetchNostrMusicTracks`** (lines 333-387)
   - Queries kind 36787 events by user
   - Parses music track metadata
   - Returns list of tracks

5. **`publishNostrMusicTracks`** (lines 471-560)
   - Converts each track to kind 36787
   - Publishes with progress callbacks
   - Includes zap splits, artwork, lyrics

6. **`groupTracksByAlbum`** (lines 390-425)
   - Groups tracks by album name
   - Used for import UI

#### Nostr Signer ([src/utils/nostrSigner.ts](src/utils/nostrSigner.ts))

**Signer Interface** (lines 22-26):
```
- getPublicKey(): Promise<string>
- signEvent(event): Promise<VerifiedEvent>
- close?(): void
```

**Implementation Classes**:
- `Nip07Signer` (lines 33-49) - Browser extension wrapper
- `Nip46SignerWrapper` (lines 52-73) - Remote signer wrapper

**Key Functions**:

1. **`initNip07Signer`** (lines 138-148)
   - Checks for window.nostr
   - Creates Nip07Signer instance
   - Stores connection method

2. **`initNip46SignerFromBunker`** (lines 151-219)
   - Parses bunker URI or generates connection URI
   - Creates BunkerSigner with SimplePool
   - Waits for connection
   - Returns pubkey

3. **`reconnectNip46`** (lines 251-279)
   - Loads stored bunker pointer
   - Reconnects to previous session
   - Used on app startup

4. **`getSigner`/`hasSigner`** (lines 281-289)
   - Access current active signer
   - Check if authenticated

#### Nostr Relay ([src/utils/nostrRelay.ts](src/utils/nostrRelay.ts))

**Key Functions**:

1. **`connectRelay`** (lines 13-32)
   - Opens WebSocket connection
   - Sets timeout
   - Returns connected WebSocket

2. **`collectEvents`** (lines 35-67)
   - Listens for events on subscription
   - Handles EOSE (end of stored events)
   - Returns array of events

3. **`publishEventToRelays`** (lines 70-98)
   - Publishes to multiple relays in parallel
   - Waits for OK/ERROR messages
   - Returns success/fail counts

### Hosted Feed API

#### Client Utils ([src/utils/hostedFeed.ts](src/utils/hostedFeed.ts))

**Key Functions**:

1. **`createHostedFeed`** (lines 49-67)
   - POSTs to `/api/hosted`
   - Uploads XML to blob storage
   - Returns feedId, editToken, URLs

2. **`updateHostedFeed`** (lines 72-88)
   - PUTs to `/api/hosted/[feedId]`
   - Requires X-Edit-Token header
   - Updates existing feed

3. **`deleteHostedFeed`** (lines 93-104)
   - DELETEs feed from blob storage
   - Requires edit token

4. **`buildHostedUrl`** (lines 114-117)
   - Constructs public feed URL

**Storage** (lines 11-28):
- Stores feed credentials in localStorage
- Key format: `msp2-hosted-{podcastGuid}`
- Stores feedId, editToken, timestamps

#### Server Endpoint ([api/hosted/index.ts](api/hosted/index.ts))

**GET `/api/hosted`** (lines 29-57)
- Admin only (requires X-Admin-Key or Nostr auth)
- Lists all feeds from blob storage
- Returns metadata for each feed

**POST `/api/hosted`** (lines 64-136)
- Creates new feed
- Validates podcast GUID (UUID format)
- Validates XML format
- Checks for duplicates (returns 409 if exists)
- Generates or uses provided edit token
- Stores XML and metadata to blob storage
- Returns feedId, editToken, URLs

**PUT `/api/hosted/[feedId]`** (lines 1-89 in [api/hosted/[feedId].ts](api/hosted/[feedId].ts))
- Updates existing feed
- Validates edit token against stored hash
- Updates XML and metadata
- Returns success message

**DELETE `/api/hosted/[feedId]`** (lines 91-120 in [api/hosted/[feedId].ts](api/hosted/[feedId].ts))
- Deletes feed from storage
- Requires valid edit token
- Returns confirmation

### Storage Management ([src/utils/storage.ts](src/utils/storage.ts))

**Storage Keys** (lines 7-12):
- `msp2-album-data` - Current album in editor
- `msp2-nostr-user` - Logged in Nostr user
- `msp2-hosted-{guid}` - Hosted feed credentials per album
- `msp2-pending-hosted` - Temp storage during import

**Storage Objects**:
1. **`albumStorage`** (lines 55-59) - Save/load current album
2. **`nostrUserStorage`** (lines 62-66) - Save/load Nostr user
3. **`hostedFeedStorage`** (lines 76-83) - Manage hosted credentials
4. **`pendingHostedStorage`** (lines 86-90) - Temp storage for import flow

## Data Flow Diagrams

### Creating a New Feed

```
User clicks "New"
  ↓
App.tsx: handleNew() [line 71]
  ↓
Confirms with user
  ↓
feedStore: SET_ALBUM action [line 48]
  ↓
createEmptyAlbum() [src/types/feed.ts line 127]
  ↓
Editor renders empty form
  ↓
User fills in album info, adds tracks
  ↓
feedStore: UPDATE_ALBUM, ADD_TRACK, etc [lines 53-265]
  ↓
feedReducer updates state, sets isDirty=true [line 144]
  ↓
useEffect saves to localStorage [line 275]
```

### Importing from XML URL

```
User clicks "Import" → selects "From URL"
  ↓
ImportModal: mode='url' [line 15]
  ↓
User enters URL, clicks Import
  ↓
handleImport() in ImportModal [line 145]
  ↓
fetchFeedFromUrl(feedUrl) [src/utils/xmlParser.ts line 310]
  ↓
Fetch XML, parse with parseRssFeed() [line 9]
  ↓
Returns Album object
  ↓
onImport(xml) callback → App.tsx: handleImport() [line 59]
  ↓
parseRssFeed(xml) [line 61]
  ↓
Validates medium is 'music' [lines 64-73]
  ↓
feedStore: SET_ALBUM [line 75]
  ↓
Editor displays imported data
```

### Saving to Nostr

```
User clicks "Save" → selects "Save to Nostr"
  ↓
SaveModal: mode='nostr' [line 25]
  ↓
User clicks Save button
  ↓
handleSaveNostr() [line 345]
  ↓
Checks isLoggedIn [line 347]
  ↓
generateRssFeed(album) [line 358]
  ↓
saveAlbumToNostr(xml) [src/utils/nostrSync.ts line 101]
  ↓
createFeedEvent() - creates kind 30054 [line 92]
  ↓
signer.signEvent(unsignedEvent) [line 118]
  ↓
publishEventToRelays() [src/utils/nostrRelay.ts line 70]
  ↓
Parallel publish to all relays
  ↓
Returns success count
  ↓
SaveModal shows result message
  ↓
feedStore: SET_ALBUM with isDirty=false [line 48]
```

### Loading from Nostr

```
User clicks "Import" → "From Nostr"
  ↓
ImportModal: mode='nostr' [line 15]
  ↓
useEffect calls fetchSavedAlbums() [line 154]
  ↓
loadAlbumsFromNostr() [src/utils/nostrSync.ts line 139]
  ↓
Query relays for kind 30054 where author = pubkey
  ↓
collectEvents() from all relays [src/utils/nostrRelay.ts line 35]
  ↓
Extract metadata (id, d-tag, title) [line 166-173]
  ↓
Display list of albums in modal
  ↓
User clicks album
  ↓
handleLoadFromNostr(dTag) [line 50]
  ↓
loadAlbumByDTag(dTag) [src/utils/nostrSync.ts line 184]
  ↓
Query relays for kind 30054 where d-tag = podcastGuid
  ↓
Find most recent event
  ↓
parseRssFeed(event.content) [line 222]
  ↓
onLoadAlbum(album) → App.tsx: handleLoadAlbum() [line 68]
  ↓
feedStore: SET_ALBUM [line 69]
  ↓
Editor displays loaded album
```

### Hosting a Feed

```
User clicks "Save" → "Host on MSP"
  ↓
SaveModal: mode='hosted' [line 25]
  ↓
Check for existing hostedInfo [lines 60-67]
  ↓
If new: generate edit token [lines 54-58]
  ↓
Display token warning, require acknowledgment [lines 628-645]
  ↓
User acknowledges, clicks Host
  ↓
handleHostFeed() [line 392]
  ↓
generateRssFeed(album) [line 396]
  ↓
If new feed:
  createHostedFeed(xml, title, guid, token) [line 399]
    ↓
  POST /api/hosted [api/hosted/index.ts line 64]
    ↓
  Validate XML, check duplicates
    ↓
  Hash token, upload to Vercel Blob [lines 106-119]
    ↓
  Return feedId, editToken, URLs
    ↓
  saveHostedFeedInfo() [line 407]
    ↓
  Store credentials in localStorage
  ↓
If existing feed:
  updateHostedFeed(feedId, token, xml, title) [line 412]
    ↓
  PUT /api/hosted/[feedId] [api/hosted/[feedId].ts line 1]
    ↓
  Validate token hash
    ↓
  Update blob storage [lines 54-66]
  ↓
Display feed URL, copy button
```

### Publishing Nostr Music Tracks

```
User clicks "Save" → "Publish Nostr Music"
  ↓
SaveModal: mode='nostrMusic' [line 25]
  ↓
User clicks Publish
  ↓
handlePublishNostrMusic() [line 322]
  ↓
publishNostrMusicTracks(album, onProgress) [src/utils/nostrSync.ts line 471]
  ↓
For each track:
  ↓
  convertTrackToNostrMusic() [line 489]
    ↓
  Build kind 36787 event:
    - d: track GUID
    - title, artist, album
    - track number, genre
    - audio URL, image URL
    - released date, language
    - zap splits (from value recipients)
    - content: lyrics, credits [line 518-534]
  ↓
  signer.signEvent() [line 541]
  ↓
  publishEventToRelays() [line 542]
  ↓
  Callback onProgress with track status [line 543-547]
  ↓
Display progress UI with per-track results
```

### Admin Panel Authentication

```
User navigates to /admin
  ↓
App.tsx: isAdminRoute = true [line 196]
  ↓
Renders AdminPage [line 198]
  ↓
AdminPage checks authState [lines 20-26]
  ↓
If no extension: "Nostr Extension Required" [line 48]
  ↓
If not logged in: "Login Required" + button [line 55]
  ↓
User clicks Sign In
  ↓
nostrStore.login() [line 59]
  ↓
Authenticates via NIP-07/NIP-46
  ↓
If authState = 'ready': render FeedList [line 68]
  ↓
FeedList.fetchFeeds() [src/components/admin/FeedList.tsx line 22]
  ↓
GET /api/hosted with Nostr auth header [line 23]
  ↓
Server validates auth [api/hosted/index.ts line 37]
  ↓
List feeds from blob storage [line 44]
  ↓
Display table of feeds [line 91-126]
  ↓
User can delete feed → shows DeleteConfirmModal
```

## Common Development Tasks

### Adding a New Album Field

1. Add property to `Album` interface in [src/types/feed.ts](src/types/feed.ts#L50-L94)
2. Update `createEmptyAlbum()` with default value (line 127)
3. Add reducer case to `feedReducer` in [src/store/feedStore.tsx](src/store/feedStore.tsx#L48-L273) (if needed)
4. Add form field to [src/components/Editor/Editor.tsx](src/components/Editor/Editor.tsx) in appropriate section
5. Update `generateRssFeed()` in [src/utils/xmlGenerator.ts](src/utils/xmlGenerator.ts#L137) to export field
6. Update `parseRssFeed()` in [src/utils/xmlParser.ts](src/utils/xmlParser.ts#L9) to import field
7. Add field description to [src/data/fieldInfo.ts](src/data/fieldInfo.ts) for tooltip

### Adding a New Save Destination

1. Add new mode to SaveModal state type (line 25)
2. Add button/tab to SaveModal UI (around line 500-600)
3. Implement handler function in SaveModal (like `handleSaveNostr`)
4. Create utility function in appropriate utils file
5. Update relevant API endpoint if server-side (in `api/` directory)

### Adding a New Import Source

1. Add new mode to ImportModal state type (line 15)
2. Add button/tab to ImportModal UI (around line 200-300)
3. Implement handler function in ImportModal (like `handleImportNostrEvent`)
4. Create utility function if needed
5. Call `onImport(xml)` or `onLoadAlbum(album)` to load data

### Modifying Nostr Event Structure

1. Update interface in [src/types/nostr.ts](src/types/nostr.ts)
2. Update creation function in [src/utils/nostrSync.ts](src/utils/nostrSync.ts) (e.g., `createFeedEvent`)
3. Update parsing function in same file (e.g., `parseNostrMusicTrackInfo`)
4. Update any UI components that display the data

### Adding Admin Features

1. Add button/action to [src/components/admin/FeedList.tsx](src/components/admin/FeedList.tsx)
2. Create API endpoint in `api/admin/` directory
3. Implement authentication check using [api/_utils/adminAuth.ts](api/_utils/adminAuth.ts)
4. Update admin UI to display results

## Key Configuration Files

- **[package.json](package.json)** - Dependencies, scripts
- **[vite.config.ts](vite.config.ts)** - Vite build configuration
- **[vercel.json](vercel.json)** - Vercel deployment settings, API routes
- **[tsconfig.json](tsconfig.json)** - TypeScript compiler options
- **[eslint.config.js](eslint.config.js)** - Linting rules

## Environment Variables

The project uses these environment variables:

- `MSP_ADMIN_KEY` - Legacy admin key for API access (optional)
- Vercel automatically provides `BLOB_READ_WRITE_TOKEN` for blob storage

Admin authentication is now Nostr-based by default, checking against authorized pubkeys in [api/_utils/adminAuth.ts](api/_utils/adminAuth.ts).

## Important Considerations

### Security

1. **Edit Tokens**: Generated client-side (32 random bytes), never transmitted during feed creation
2. **Token Hashing**: Server stores SHA-256 hash, never plaintext
3. **Token Storage**: Stored in localStorage, user responsible for backup
4. **Nostr Authentication**: NIP-98 signature validation for admin endpoints

### Data Persistence

1. **Local Storage**: Current album auto-saves on every change
2. **Nostr**: Kind 30054 events are replaceable (d-tag = podcast GUID)
3. **Hosted Feeds**: Stored in Vercel Blob, tied to podcast GUID (one per album)
4. **No Server Database**: Everything is client-side or blob storage

### Podcasting 2.0 Compliance

- Uses official namespace: `https://podcastindex.org/namespace/1.0`
- Implements: `podcast:guid`, `podcast:person`, `podcast:value`, `podcast:funding`, `podcast:locked`
- Value method auto-switches: `keysend` if all nodes, `lnaddress` if any lnaddress
- Medium always set to `music` or `musicL` (live)

### Value 4 Value (V4V)

- Split percentages stored as integers (e.g., 45 = 45%)
- Server-side validation ensures splits sum to 100
- Supports both Lightning node addresses and Lightning addresses (lnaddress)
- Custom key/value pairs for additional metadata
- Per-track overrides allow different splits per song

## Development Workflow

### Setup

```bash
npm install
npm run dev
```

### Building

```bash
npm run build
```

### Deployment

The project is configured for Vercel. Push to main branch to deploy.

### Testing

- Use "Load Test Data" in dev mode (dropdown menu)
- Use `/admin` route to view all hosted feeds
- Use browser DevTools → Application → Local Storage to inspect state

## Related Documentation

- [Podcasting 2.0 Namespace](https://github.com/Podcastindex-org/podcast-namespace)
- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [NIP-07 Browser Extension](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [NIP-46 Remote Signer](https://github.com/nostr-protocol/nips/blob/master/46.md)
- [Value 4 Value Specification](https://value4value.info)
- [Blossom Protocol](https://github.com/hzrd149/blossom)

## Troubleshooting

### "No Nostr extension found"
- Install Alby, nos2x, or another NIP-07 browser extension
- Or use NIP-46 remote signer with bunker URI

### "Failed to publish to any relay"
- Check network connectivity
- Try different relays (modify DEFAULT_RELAYS in [src/utils/nostrRelay.ts](src/utils/nostrRelay.ts))
- Verify Nostr extension is working

### "Feed already exists"
- Each podcast GUID can only have one hosted feed
- Use "Restore" flow to reconnect to existing feed
- Or change podcast GUID to create new feed

### Lost edit token
- Use "Restore From Backup" in Save modal
- If you have a backup XML file, import it and use restore flow
- Without token, cannot update hosted feed (must create new one)

### Tracks not importing correctly
- Check XML format (must be valid RSS 2.0)
- Verify enclosure URLs are accessible
- Check for proper podcast namespace declarations

## Next Steps for New Developers

1. **Explore the UI**: Run `npm run dev` and create a test album
2. **Read the Type Definitions**: Start with [src/types/feed.ts](src/types/feed.ts)
3. **Trace a Data Flow**: Follow the "Creating a New Feed" flow above
4. **Examine State Management**: Understand feedStore and nostrStore
5. **Study XML Processing**: Review xmlGenerator and xmlParser
6. **Test Nostr Integration**: Set up a Nostr extension and try saving/loading
7. **Review API Endpoints**: Check the `api/` directory for server-side code
8. **Modify Something Small**: Add a new field or button to gain hands-on experience

Good luck! The codebase is well-organized and follows consistent patterns throughout. Most features follow similar patterns, so once you understand one flow (like import/export), others will make sense quickly.
