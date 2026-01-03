import { useNostr } from '../store/nostrStore';
import { truncateNpub } from '../utils/nostr';

export function NostrLoginButton() {
  const { state } = useNostr();
  const { isLoggedIn, user, isLoading } = state;

  // Loading state
  if (isLoading) {
    return (
      <span className="nostr-loading">...</span>
    );
  }

  // Logged in state - show user info only (sign out is in hamburger menu)
  if (isLoggedIn && user) {
    return (
      <div className="nostr-user-info">
        {user.picture && (
          <img
            src={user.picture}
            alt=""
            className="nostr-avatar"
          />
        )}
        <span className="nostr-npub" title={user.npub}>
          {user.displayName || truncateNpub(user.npub)}
        </span>
      </div>
    );
  }

  // Not logged in - show nothing (sign in is in hamburger menu)
  return null;
}
