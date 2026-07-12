'use client';

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getToken, setToken, removeToken, login as apiLogin, logout as apiLogout } from '@/lib/auth';

interface AuthContextValue {
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const stored = getToken();
    setTokenState(stored);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!token && pathname !== '/login') {
      router.replace('/login');
    } else if (token && pathname === '/login') {
      router.replace('/dashboard');
    }
  }, [token, isLoading, pathname, router]);

  const login = useCallback(async (username: string, password: string) => {
    const t = await apiLogin(username, password);
    setToken(t);
    setTokenState(t);
    router.replace('/dashboard');
  }, [router]);

  const logout = useCallback(async () => {
    if (token) await apiLogout(token);
    removeToken();
    setTokenState(null);
    router.replace('/login');
  }, [token, router]);

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
