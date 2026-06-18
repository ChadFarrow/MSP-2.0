// MSP 2.0 - Nostr Authentication State Management
import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { NostrAuthState, NostrUser } from '../types/nostr';
import {
  hexToNpub,
  loadStoredUser,
  saveUser,
  clearStoredUser
} from '../utils/nostr';
import {
  hasNip07Extension,
  initNip07Signer,
  initManagedKeySigner,
  initNip46SignerFromBunker,
  waitForNip46Connection,
  reconnectNip46,
  clearSigner,
  loadConnectionMethod,
  loadBunkerPointer,
} from '../utils/nostrSigner';
import { hexToBytes } from '@noble/hashes/utils';
import { fetchNostrProfile } from '../utils/nostrSync';

// Action types
type NostrAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_HAS_EXTENSION'; payload: boolean }
  | { type: 'SET_CONNECTION_METHOD'; payload: 'nip07' | 'nip46' | null }
  | { type: 'LOGIN_SUCCESS'; payload: { user: NostrUser; method: 'nip07' | 'nip46' | 'managed' } }
  | { type: 'UPDATE_PROFILE'; payload: { displayName?: string; picture?: string; nip05?: string } }
  | { type: 'LOGOUT' }
  | { type: 'RESTORE_SESSION'; payload: { user: NostrUser; method: 'nip07' | 'nip46' | 'managed' } };

// Initial state
const initialState: NostrAuthState = {
  isLoggedIn: false,
  user: null,
  isLoading: true,
  error: null,
  hasExtension: false,
  connectionMethod: null,
};

// Reducer
function nostrReducer(state: NostrAuthState, action: NostrAction): NostrAuthState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false };
    case 'SET_HAS_EXTENSION':
      return { ...state, hasExtension: action.payload };
    case 'SET_CONNECTION_METHOD':
      return { ...state, connectionMethod: action.payload };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        isLoggedIn: true,
        user: action.payload.user,
        connectionMethod: action.payload.method,
        isLoading: false,
        error: null
      };
    case 'UPDATE_PROFILE':
      if (!state.user) return state;
      const updatedUser = {
        ...state.user,
        displayName: action.payload.displayName || state.user.displayName,
        picture: action.payload.picture || state.user.picture,
        nip05: action.payload.nip05 || state.user.nip05
      };
      saveUser(updatedUser);
      return { ...state, user: updatedUser };
    case 'LOGOUT':
      return {
        ...state,
        isLoggedIn: false,
        user: null,
        error: null,
        connectionMethod: null,
      };
    case 'RESTORE_SESSION':
      return {
        ...state,
        isLoggedIn: true,
        user: action.payload.user,
        connectionMethod: action.payload.method,
        isLoading: false
      };
    default:
      return state;
  }
}

// Context
interface NostrContextType {
  state: NostrAuthState;
  login: () => Promise<void>;
  loginWithNip46: (bunkerUri?: string, onUriGenerated?: (uri: string) => void) => Promise<void>;
  loginWithGoogle: () => void;
  logout: () => void;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

// Provider
export function NostrProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(nostrReducer, initialState);

  // Fetch Nostr profile and dispatch UPDATE_PROFILE
  const refreshProfile = useCallback((pubkey: string) => {
    fetchNostrProfile(pubkey).then((profile) => {
      if (profile) {
        dispatch({
          type: 'UPDATE_PROFILE',
          payload: {
            displayName: profile.display_name || profile.name,
            picture: profile.picture,
            nip05: profile.nip05
          }
        });
      }
    });
  }, []);

  // Check for extension and restore session on mount
  useEffect(() => {
    async function init() {
      const storedUser = loadStoredUser();
      const storedMethod = loadConnectionMethod();

      // Wait for NIP-07 extension to inject
      await new Promise(resolve => setTimeout(resolve, 500));
      const extensionAvailable = hasNip07Extension();
      dispatch({ type: 'SET_HAS_EXTENSION', payload: extensionAvailable });

      if (storedUser && storedMethod === 'nip46') {
        const bunkerPointer = loadBunkerPointer();
        if (bunkerPointer) {
          try {
            const pubkey = await reconnectNip46();
            if (pubkey && pubkey === storedUser.pubkey) {
              dispatch({ type: 'RESTORE_SESSION', payload: { user: storedUser, method: 'nip46' } });
              refreshProfile(pubkey);
              return;
            }
          } catch (e) {
            console.error('[Nostr] Failed to reconnect NIP-46:', e);
          }
          if (loadBunkerPointer()) {
            dispatch({ type: 'RESTORE_SESSION', payload: { user: storedUser, method: 'nip46' } });
            return;
          }
        }
        clearStoredUser();
        clearSigner();
        dispatch({ type: 'SET_LOADING', payload: false });
      } else if (storedUser && storedMethod === 'nip07' && extensionAvailable) {
        try {
          const pubkey = await initNip07Signer();
          if (pubkey === storedUser.pubkey) {
            dispatch({ type: 'RESTORE_SESSION', payload: { user: storedUser, method: 'nip07' } });
            fetchNostrProfile(pubkey).then((profile) => {
              if (profile) {
                dispatch({
                  type: 'UPDATE_PROFILE',
                  payload: {
                    displayName: profile.display_name || profile.name,
                    picture: profile.picture,
                    nip05: profile.nip05
                  }
                });
              }
            });
            return;
          } else {
            clearStoredUser();
            clearSigner();
          }
        } catch {
          clearStoredUser();
          clearSigner();
        }
        dispatch({ type: 'SET_LOADING', payload: false });
      } else if (storedMethod === 'managed') {
        // Restore managed (Google-authenticated) session
        try {
          const meRes = await fetch('/api/auth/me');
          if (meRes.ok) {
            const data = await meRes.json() as {
              pubkey: string; npub: string; displayName?: string; picture?: string;
            };
            let skInitialized = false;
            try {
              const kpRes = await fetch('/api/auth/keypair');
              if (kpRes.ok) {
                const { sk: skHex } = await kpRes.json() as { sk: string };
                initManagedKeySigner(hexToBytes(skHex));
                skInitialized = true;
              }
            } catch { /* signer init failed — restore UI session without signing */ }
            const user: NostrUser = {
              pubkey: data.pubkey,
              npub: data.npub,
              displayName: data.displayName ?? storedUser?.displayName,
              picture: data.picture ?? storedUser?.picture,
            };
            if (skInitialized) saveUser(user);
            dispatch({ type: 'RESTORE_SESSION', payload: { user, method: 'managed' } });
            return;
          }
        } catch { /* network error — fall through to clear */ }
        // Cookie expired or network failure
        clearStoredUser();
        clearSigner();
        dispatch({ type: 'SET_LOADING', payload: false });
      } else {
        // Check if returning from Google OAuth (first-time login, no stored method yet)
        const params = new URLSearchParams(window.location.search);
        if (params.get('auth') === 'success') {
          window.history.replaceState({}, '', window.location.pathname);
          try {
            const meRes = await fetch('/api/auth/me');
            if (meRes.ok) {
              const data = await meRes.json() as {
                pubkey: string; npub: string; displayName?: string; picture?: string;
              };
              let skInitialized = false;
              try {
                const kpRes = await fetch('/api/auth/keypair');
                if (kpRes.ok) {
                  const { sk: skHex } = await kpRes.json() as { sk: string };
                  initManagedKeySigner(hexToBytes(skHex));
                  skInitialized = true;
                }
              } catch { /* proceed without signer */ }
              const user: NostrUser = {
                pubkey: data.pubkey,
                npub: data.npub,
                displayName: data.displayName,
                picture: data.picture,
              };
              if (skInitialized) saveUser(user);
              dispatch({ type: 'LOGIN_SUCCESS', payload: { user, method: 'managed' } });
              return;
            }
          } catch { /* fall through */ }
        }
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }
    init();
  }, [refreshProfile]);

  // Login with NIP-07 (browser extension)
  const login = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      const pubkey = await initNip07Signer();
      const npub = hexToNpub(pubkey);

      const user: NostrUser = {
        pubkey,
        npub,
        displayName: undefined,
        picture: undefined,
        nip05: undefined
      };

      // Save to localStorage
      saveUser(user);

      dispatch({ type: 'LOGIN_SUCCESS', payload: { user, method: 'nip07' } });

      refreshProfile(pubkey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [refreshProfile]);

  // Login with NIP-46 (remote signer)
  const loginWithNip46 = useCallback(async (
    bunkerUri?: string,
    onUriGenerated?: (uri: string) => void
  ) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    try {
      let pubkey: string;

      if (bunkerUri) {
        // Bunker-initiated flow - user provided bunker:// URI
        pubkey = await initNip46SignerFromBunker(bunkerUri);
      } else if (onUriGenerated) {
        // Client-initiated flow - generate URI and wait for connection
        pubkey = await waitForNip46Connection((uri) => {
          onUriGenerated(uri);
        });
      } else {
        throw new Error('Either bunkerUri or onUriGenerated callback is required');
      }

      const npub = hexToNpub(pubkey);

      const user: NostrUser = {
        pubkey,
        npub,
        displayName: undefined,
        picture: undefined,
        nip05: undefined
      };

      // Save to localStorage
      saveUser(user);

      dispatch({ type: 'LOGIN_SUCCESS', payload: { user, method: 'nip46' } });

      refreshProfile(pubkey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      dispatch({ type: 'SET_ERROR', payload: message });
    }
  }, [refreshProfile]);

  const loginWithGoogle = useCallback(() => {
    window.location.href = '/api/auth/google-start';
  }, []);

  // Logout function
  const logout = useCallback(() => {
    clearStoredUser();
    clearSigner();
    dispatch({ type: 'LOGOUT' });
  }, []);

  return (
    <NostrContext.Provider value={{ state, login, loginWithNip46, loginWithGoogle, logout }}>
      {children}
    </NostrContext.Provider>
  );
}

// Hook
export function useNostr() {
  const context = useContext(NostrContext);
  if (context === undefined) {
    throw new Error('useNostr must be used within a NostrProvider');
  }
  return context;
}
