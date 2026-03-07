import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';

interface AuthState {
  token: string | null;
  shopId: string | null;
  shopName: string | null;
  plan: string;
  isLoading: boolean;
  localPinSet: boolean;   // PIN saved in AsyncStorage on THIS device
  pinVerified: boolean;   // PIN lock screen passed this session (in-memory, resets on app close)
}

interface AuthContextType extends AuthState {
  login: (token: string, shopId: string, shopName: string) => Promise<void>;
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
            plan: json.plan ?? 'free',
            isLoading: false,
            localPinSet: !!pin,
            pinVerified: false,   // always false on fresh launch — must pass PIN lock
          });
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

  const login = async (token: string, shopId: string, shopName: string) => {
    await AsyncStorage.setItem('recall_token', token);
    await AsyncStorage.setItem('recall_shop_id', shopId);
    await AsyncStorage.setItem('recall_shop_name', shopName);
    setState(s => ({
      ...s,
      token,
      shopId,
      shopName,
      // pinVerified stays false — after login, user must set/enter PIN
    }));
  };

  const logout = async () => {
    await AsyncStorage.multiRemove([
      'recall_token', 'recall_shop_id', 'recall_shop_name',
      'recall_phone', 'recall_pin',
    ]);
    setState({
      token: null, shopId: null, shopName: null, plan: 'free',
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