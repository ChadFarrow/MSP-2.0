import { describe, it, expect, beforeEach, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import type { NostrEvent } from 'nostr-tools/pure';
import { matchFilters } from 'nostr-tools/filter';
import type { Filter } from 'nostr-tools/filter';
import { getConversationKey, encrypt, decrypt } from 'nostr-tools/nip44';
import { normalizeURL } from 'nostr-tools/utils';

// nostrSigner keeps the bunker pointer and client key in localStorage, which the `node`
// test environment doesn't have. Same stub as feedStore.test.ts.
const storage = vi.hoisted(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() { return store.size; }
  } as Storage;
  return store;
});

const NOSTR_CONNECT_KIND = 24133;

interface RelaySubscription {
  socket: FakeRelaySocket;
  id: string;
  filters: Filter[];
}

// An in-memory relay network. The signer's SimplePool opens its sockets through
// FakeRelaySocket, so every socket is recorded and a test can see which ones were left open.
// The real nostr-tools relay, pool and NIP-46 code run on top of it unchanged.
const network = {
  sockets: [] as FakeRelaySocket[],
  subscriptions: [] as RelaySubscription[],
  remoteSigner: null as FakeRemoteSigner | null,

  reset() {
    this.sockets = [];
    this.subscriptions = [];
    this.remoteSigner = null;
  },

  openSocketUrls(): string[] {
    return this.sockets.filter(s => s.readyState !== FakeRelaySocket.CLOSED).map(s => s.url);
  },

  // What a browser does on page unload.
  closeAllSockets() {
    for (const socket of this.sockets) socket.close();
  },

  publish(relay: string, event: NostrEvent) {
    for (const sub of this.subscriptions) {
      if (sub.socket.url === relay && matchFilters(sub.filters, event)) {
        sub.socket.deliver(['EVENT', sub.id, event]);
      }
    }
    this.remoteSigner?.receive(relay, event);
  },
};

class FakeRelaySocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState = FakeRelaySocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    network.sockets.push(this);
    setTimeout(() => {
      if (this.readyState !== FakeRelaySocket.CONNECTING) return;
      this.readyState = FakeRelaySocket.OPEN;
      this.onopen?.();
    }, 0);
  }

  send(data: string) {
    const [type, ...rest] = JSON.parse(data);
    if (type === 'REQ') {
      const [id, ...filters] = rest as [string, ...Filter[]];
      network.subscriptions.push({ socket: this, id, filters });
      this.deliver(['EOSE', id]);
    } else if (type === 'CLOSE') {
      network.subscriptions = network.subscriptions.filter(s => !(s.socket === this && s.id === rest[0]));
    } else if (type === 'EVENT') {
      const event = rest[0] as NostrEvent;
      this.deliver(['OK', event.id, true, '']);
      network.publish(this.url, event);
    }
  }

  deliver(message: unknown[]) {
    setTimeout(() => {
      if (this.readyState === FakeRelaySocket.OPEN) this.onmessage?.({ data: JSON.stringify(message) });
    }, 0);
  }

  close() {
    if (this.readyState === FakeRelaySocket.CLOSED) return;
    this.readyState = FakeRelaySocket.CLOSED;
    network.subscriptions = network.subscriptions.filter(s => s.socket !== this);
    setTimeout(() => this.onclose?.({ code: 1000, reason: '' }), 0);
  }
}

// A remote signer app (Amber, Primal, nsec.app) as the relays see it: it listens for
// kind 24133 requests addressed to it and answers on the relays it is currently using.
class FakeRemoteSigner {
  readonly userPubkey = getPublicKey(generateSecretKey());
  private readonly secretKey = generateSecretKey();
  readonly pubkey = getPublicKey(this.secretKey);
  private relays: string[];
  // The answer to `switch_relays`. A signer that prefers other relays moves there once asked.
  preferredRelays: string[] | null = null;

  constructor(relays: string[] = []) {
    this.relays = relays.map(normalizeURL);
  }

  receive(relay: string, event: NostrEvent) {
    if (!this.relays.includes(relay) || event.kind !== NOSTR_CONNECT_KIND) return;
    if (!event.tags.some(t => t[0] === 'p' && t[1] === this.pubkey)) return;

    const { id, method } = JSON.parse(decrypt(event.content, getConversationKey(this.secretKey, event.pubkey)));
    const result =
      method === 'get_public_key' ? this.userPubkey
      : method === 'switch_relays' ? JSON.stringify(this.preferredRelays)
      : 'ack';
    this.reply(event.pubkey, { id, result });

    if (method === 'switch_relays' && this.preferredRelays) {
      this.relays = this.preferredRelays.map(normalizeURL);
    }
  }

  // The QR-code (nostrconnect://) flow starts on the signer's side: it scans the URI and
  // answers with the secret on the relays the URI names.
  async scanConnectUri(uri: string, clientPubkey: string) {
    const params = new URL(uri).searchParams;
    this.relays = params.getAll('relay').map(normalizeURL);
    await vi.waitFor(() => {
      if (!network.subscriptions.some(s => s.filters.some(f => f['#p']?.includes(clientPubkey)))) {
        throw new Error('client is not listening yet');
      }
    });
    this.reply(clientPubkey, { id: 'nostrconnect', result: params.get('secret') });
  }

  private reply(clientPubkey: string, body: { id: string; result: string | null }) {
    const event = finalizeEvent({
      kind: NOSTR_CONNECT_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [['p', clientPubkey]],
      content: encrypt(JSON.stringify(body), getConversationKey(this.secretKey, clientPubkey)),
    }, this.secretKey);
    for (const relay of this.relays) network.publish(relay, event);
  }
}

// A fresh copy of nostrSigner, as after a page load: module state is gone, localStorage stays.
async function loadSigner() {
  vi.resetModules();
  const pool = await import('nostr-tools/pool');
  pool.useWebSocketImplementation(FakeRelaySocket);
  return import('./nostrSigner');
}

describe('NIP-46 remote signer', () => {
  beforeEach(() => {
    storage.clear();
    network.reset();
  });

  it('reconnects after a reload from a QR-code login, even when the signer prefers other relays', async () => {
    const remote = new FakeRemoteSigner();
    remote.preferredRelays = ['wss://signer-home.example'];
    network.remoteSigner = remote;

    const firstLoad = await loadSigner();
    const pubkey = await firstLoad.waitForNip46Connection(
      (uri, clientPubkey) => { void remote.scanConnectUri(uri, clientPubkey); },
      5000
    );
    expect(pubkey).toBe(remote.userPubkey);

    network.closeAllSockets();
    const afterReload = await loadSigner();

    expect(await afterReload.reconnectNip46(1000)).toBe(remote.userPubkey);
  });

  it('closes the socket for a relay only the bunker URI names, on logout', async () => {
    const remote = new FakeRemoteSigner(['wss://bunker-only.example']);
    network.remoteSigner = remote;

    const nostrSigner = await loadSigner();
    await nostrSigner.initNip46SignerFromBunker(
      `bunker://${remote.pubkey}?relay=wss://bunker-only.example&secret=s3cret`
    );
    expect(network.openSocketUrls()).toContain('wss://bunker-only.example/');

    nostrSigner.clearSigner();

    expect(network.openSocketUrls()).toEqual([]);
  });

  it('closes the sockets it opened when a reconnect gets no answer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const offline = new FakeRemoteSigner();  // never attached to the network

    const nostrSigner = await loadSigner();
    nostrSigner.storeBunkerPointer({ pubkey: offline.pubkey, relays: ['wss://bunker-only.example'], secret: 's3cret' });

    expect(await nostrSigner.reconnectNip46(200)).toBeNull();
    expect(network.sockets.length).toBeGreaterThan(0);
    expect(network.openSocketUrls()).toEqual([]);
  });
});
