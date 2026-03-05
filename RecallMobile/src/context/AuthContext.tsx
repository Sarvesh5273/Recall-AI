import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '@env';

interface AuthState {
  token: string | null;
  shopId: string | null;
  shopName: string | null;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (token: string, shopId: string, shopName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    token: null,
    shopId: null,
    shopName: null,
    isLoading: true,
  });

  // On startup — restore token from AsyncStorage and verify with /auth/me
  useEffect(() => {
    const restore = async () => {
      try {
        const token = await AsyncStorage.getItem('recall_token');
        if (!token) {
          setState(s => ({ ...s, isLoading: false }));
          return;
        }

        // Verify token is still valid
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const json = await res.json();
          setState({
            token,
            shopId: json.shop_id,
            shopName: json.shop_name,
            isLoading: false
          });
        } else {
          // Token expired or invalid — clear it
          await AsyncStorage.removeItem('recall_token');
          setState(s => ({ ...s, isLoading: false }));
        }
      } catch {
        setState(s => ({ ...s, isLoading: false }));
      }
    };
    restore();
  }, []);

  const login = async (token: string, shopId: string, shopName: string) => {
    await AsyncStorage.setItem('recall_token', token);
    setState({ token, shopId, shopName, isLoading: false });
  };

  const logout = async () => {
    await AsyncStorage.removeItem('recall_token');
    setState({ token: null, shopId: null, shopName: null, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};