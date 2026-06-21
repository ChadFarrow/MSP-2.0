// One-off: purge PII from auth/users/* keypair blobs.
// Re-stores each record stripped of email/displayName/picture at a new
// unguessable (addRandomSuffix) path, then deletes the old PII-bearing blob.
// Preserves pubkey + encryptedNsec, so the user's Nostr identity is unchanged.
//
// Usage:
//   node --env-file=.env.local scripts/migrate-auth-blobs.mjs          # dry run
//   node --env-file=.env.local scripts/migrate-auth-blobs.mjs --apply  # do it
import { list, put, del } from '@vercel/blob';

const APPLY = process.argv.includes('--apply');
const PII_FIELDS = ['email', 'displayName', 'picture'];

const { blobs } = await list({ prefix: 'auth/users/' });
console.log(`Found ${blobs.length} blob(s) under auth/users/\n`);

for (const blob of blobs) {
  const rec = await (await fetch(blob.url)).json();
  const pii = PII_FIELDS.filter((f) => f in rec);
  const suffixed = /-[A-Za-z0-9]+\.json$/.test(blob.pathname);
  const needsMigration = pii.length > 0 || !suffixed;

  console.log(`• ${blob.pathname}`);
  console.log(`    pii: ${pii.length ? pii.join(', ') : 'none'} | suffixed: ${suffixed} | needs migration: ${needsMigration}`);

  if (!needsMigration) { console.log('    (skip)\n'); continue; }
  if (!APPLY) { console.log('    [dry run — would re-store stripped + delete old]\n'); continue; }

  const stripped = {
    pubkey: rec.pubkey,
    encryptedNsec: rec.encryptedNsec,
    createdAt: rec.createdAt ?? new Date().toISOString(),
  };
  // base path without any existing random suffix → addRandomSuffix appends a fresh one
  const base = `${blob.pathname.replace(/-[A-Za-z0-9]+\.json$/, '.json').replace(/\.json$/, '')}.json`;
  const written = await put(base, JSON.stringify(stripped), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: true,
  });
  console.log(`    re-stored → ${written.pathname}`);
  await del(blob.url);
  console.log(`    deleted old → ${blob.pathname}\n`);
}

console.log(APPLY ? 'Done.' : '\nDry run complete. Re-run with --apply to migrate.');
