// Diagnostic: fetch a user's kind-0 profile from MSP's default relays and print
// the raw content + which name-ish fields are present. Helps diagnose why the
// onboarding identity card shows an npub instead of a name.
//
// Usage:
//   node scripts/check-profile.mjs npub1...        (or a hex pubkey)
import { SimplePool } from 'nostr-tools/pool';
import { nip19 } from 'nostr-tools';

const RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.primal.net',
  'wss://nos.lol',
  'wss://relay.ditto.pub',
];

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/check-profile.mjs <npub or hex pubkey>');
  process.exit(1);
}

let pubkey = arg;
if (arg.startsWith('npub')) {
  pubkey = nip19.decode(arg).data;
}
console.log('pubkey (hex):', pubkey);
console.log('querying relays:', RELAYS.join(', '), '\n');

const pool = new SimplePool();
const event = await pool.get(RELAYS, { kinds: [0], authors: [pubkey] });

if (!event) {
  console.log('❌ No kind-0 profile event found on these relays.');
} else {
  console.log('✅ Found kind-0, created_at:', new Date(event.created_at * 1000).toISOString());
  let content;
  try { content = JSON.parse(event.content); } catch { content = null; }
  console.log('\nraw content JSON:\n', event.content, '\n');
  if (content) {
    console.log('keys present:', Object.keys(content).join(', '));
    console.log('  name        =', JSON.stringify(content.name));
    console.log('  display_name =', JSON.stringify(content.display_name));
    console.log('  displayName  =', JSON.stringify(content.displayName));
    console.log('\nMSP would resolve displayName to:', JSON.stringify(content.display_name || content.name));
  }
}

pool.close(RELAYS);
process.exit(0);
