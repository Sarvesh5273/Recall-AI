// TODO: Migrate fetch() calls to use apiFetch() from ../utils/api for automatic 401 handling
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';
import { database } from '../database';

// ── CATALOG SYNC ──────────────────────────────────────────────────────────────
// Pulls master catalog from backend into WatermelonDB on login.
// Version check prevents unnecessary re-syncs — only updates when catalog changes.
// Survives uninstall: catalog restores from cloud on first login.
const syncCatalogIfNeeded = async (token: string) => {
  try {
    const res = await fetch(`${API_BASE_URL}/master-catalog`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return;

    const json = await res.json();
    const remoteVersion = json.version;
    const localVersion = await AsyncStorage.getItem('catalog_version');

    // Skip if already up to date — zero Cosmos cost
    if (localVersion === remoteVersion) {
      console.log(`Catalog up to date (v${remoteVersion}) — skipping sync`);
      return;
    }

    // Write new catalog to WatermelonDB
    const catalogCollection = database.get('catalog');
    await database.write(async () => {
      // Clear old catalog first
      const existing = await catalogCollection.query().fetch();
      for (const item of existing) {
        await (item as any).destroyPermanently();
      }
      // Write fresh catalog
      for (const item of json.data) {
        await catalogCollection.create((record: any) => {
          record._raw.id = item.uid;
          record.uid = item.uid;
          record.name = item.en;
          record.aliases = JSON.stringify(item.aliases || []);
        });
      }
    });

    await AsyncStorage.setItem('catalog_version', remoteVersion);
    console.log(`Catalog synced: ${json.total} items (v${remoteVersion})`);
  } catch (err) {
    // Non-critical — app still works with existing local catalog
    console.warn('Catalog sync failed (non-critical):', err);
  }
};
// ─────────────────────────────────────────────────────────────────────────────

interface AuthState {
  token: string | null;
  shopId: string | null;
  shopName: string | null;
  phone: string | null;
  plan: string;
  isLoading: boolean;
  localPinSet: boolean;   // PIN saved in AsyncStorage on THIS device
  pinVerified: boolean;   // PIN lock screen passed this session (in-memory, resets on app close)
}

interface AuthContextType extends AuthState {
  login: (token: string, shopId: string, shopName: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  setPinVerified: () => void;         // called by PINLockScreen on correct PIN
  setLocalPinSet: () => void;         // called by SetPINScreen after saving PIN locally
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    token: null,
    shopId: null,
    shopName: null,
    phone: null,
    plan: 'free',
    isLoading: true,
    localPinSet: false,
    pinVerified: false,
  });

  useEffect(() => {
    const restore = async () => {
      try {
        const token = await AsyncStorage.getItem('recall_token');

        if (!token) {
          setState(s => ({ ...s, isLoading: false }));
          return;
        }

        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const json = await res.json();
          const pin = await AsyncStorage.getItem('recall_pin');
          setState({
            token,
            shopId: json.shop_id,
            shopName: json.shop_name,
            phone: json.phone ?? null,
            plan: json.plan ?? 'free',
            isLoading: false,
            localPinSet: !!pin,
            pinVerified: false,
          });
          // Sync catalog in background on every app open
          syncCatalogIfNeeded(token);
        } else {
          // Token expired or revoked
          await AsyncStorage.multiRemove(['recall_token', 'recall_shop_id', 'recall_shop_name', 'recall_phone']);
          setState(s => ({ ...s, isLoading: false }));
        }
      } catch {
        // Network error on startup — don't lock user out
        setState(s => ({ ...s, isLoading: false }));
      }
    };
    restore();
  }, []);

  const login = async (token: string, shopId: string, shopName: string, phone: string = '') => {
    await AsyncStorage.setItem('recall_token', token);
    await AsyncStorage.setItem('recall_shop_id', shopId);
    await AsyncStorage.setItem('recall_shop_name', shopName);
    await AsyncStorage.setItem('recall_phone', phone);
    setState(s => ({
      ...s,
      token,
      shopId,
      shopName,
      phone: phone || null,
    }));
    // Sync catalog in background — non-blocking, won't delay login
    syncCatalogIfNeeded(token);
  };

  const logout = async () => {
    await AsyncStorage.multiRemove([
      'recall_token', 'recall_shop_id', 'recall_shop_name',
      'recall_phone', 'recall_pin',
    ]);
    setState({
      token: null, shopId: null, shopName: null, phone: null, plan: 'free',
      isLoading: false, localPinSet: false, pinVerified: false,
    });
  };

  // Called by PINLockScreen after correct PIN entered
  const setPinVerified = () => {
    setState(s => ({ ...s, pinVerified: true }));
  };

  // Called by SetPINScreen (local mode) after saving PIN to AsyncStorage
  const setLocalPinSet = () => {
    setState(s => ({ ...s, localPinSet: true }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setPinVerified, setLocalPinSet }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
