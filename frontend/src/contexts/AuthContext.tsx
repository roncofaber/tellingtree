import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { API_PREFIX } from "@/lib/constants";
import { setTokens, clearTokens, setOnAuthFailure } from "@/api/client";
import * as authApi from "@/api/auth";
import type { User } from "@/types/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    fullName?: string
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Start as loading so ProtectedRoute waits for the silent-refresh attempt
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    // Clear state immediately so the UI responds without waiting for the network
    clearTokens();
    setUser(null);
    // Then ask the server to clear the HttpOnly cookie
    try { await authApi.logout(); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    setOnAuthFailure(() => { clearTokens(); setUser(null); });
  }, [logout]);

  // On mount: attempt silent refresh using the HttpOnly cookie.
  // If successful the user stays logged in across F5 / tab reopen.
  useEffect(() => {
    const tryRestore = async () => {
      try {
        const resp = await fetch(`${API_PREFIX}/auth/refresh`, {
          method: "POST",
          credentials: "include",
        });
        if (resp.ok) {
          const data = await resp.json();
          setTokens(data.access_token);
          const me = await authApi.getMe();
          setUser(me);
        }
      } catch {
        // No valid session — stay logged out
      } finally {
        setIsLoading(false);
      }
    };
    tryRestore();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = async (username: string, password: string) => {
    const token = await authApi.login({ username, password });
    // Refresh token is now in an HttpOnly cookie set by the server.
    // We only keep the short-lived access token in memory.
    setTokens(token.access_token);
    const me = await authApi.getMe();
    setUser(me);
  };

  const register = async (
    email: string,
    username: string,
    password: string,
    fullName?: string
  ) => {
    await authApi.register({ email, username, password, full_name: fullName });
    await login(username, password);
  };

  const refreshUser = async () => {
    try {
      const me = await authApi.getMe();
      setUser(me);
    } catch {
      // not logged in
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
