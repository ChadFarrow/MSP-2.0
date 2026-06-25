import { useState } from 'react';
import { useNostr } from '../../store/nostrStore';

interface ProfileHeaderProps {
  // Optional fallback display name (e.g. the publisher feed's author) when the
  // Nostr profile has no display name yet (common for fresh managed-key accounts).
  fallbackName?: string;
}

function shortNpub(npub: string): string {
  return npub.length > 16 ? `${npub.slice(0, 10)}…${npub.slice(-6)}` : npub;
}

export function ProfileHeader({ fallbackName }: ProfileHeaderProps) {
  const { state: nostrState } = useNostr();
  const user = nostrState.user;
  const [copied, setCopied] = useState(false);

  const name = user?.displayName || fallbackName || (user?.npub ? shortNpub(user.npub) : 'Artist');

  const handleCopyNpub = async () => {
    if (!user?.npub) return;
    try {
      await navigator.clipboard.writeText(user.npub);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — no-op
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginBottom: '28px' }}>
      <div
        style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          flexShrink: 0,
          overflow: 'hidden',
          backgroundColor: 'var(--surface-color)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '30px',
        }}
      >
        {user?.picture ? (
          <img
            src={user.picture}
            alt={name}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => ((e.target as HTMLImageElement).style.display = 'none')}
          />
        ) : (
          <span>🎤</span>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: '24px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {name}
        </h2>
        {user?.npub && (
          <button
            onClick={handleCopyNpub}
            title="Copy npub"
            style={{
              marginTop: '4px',
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontSize: '13px',
              fontFamily: 'monospace',
            }}
          >
            {copied ? '✓ Copied' : shortNpub(user.npub)}
          </button>
        )}
      </div>
    </div>
  );
}
