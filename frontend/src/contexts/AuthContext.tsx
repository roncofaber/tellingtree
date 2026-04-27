import {
  createContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_PREFIX } from "@/lib/constants";
import { setTokens, clearTokens, setOnAuthFailure } from "@/api/client";
import * as authApi from "@/api/auth";
import { setTheme } from "@/lib/theme";
import type { User, UserPreferences } from "@/types/api";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (
    email: string,
    username: string,
    password: string,
    fullName?: string,
    inviteToken?: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updatePreferences: (data: Partial<UserPreferences>) => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

function applyPreferences(prefs: UserPreferences | null | undefined) {
  if (prefs?.theme) setTheme(prefs.theme);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    clearTokens();
    setUser(null);
    queryClient.clear();
    try { await authApi.logout(); } catch { /* ignore */ }
  }, [queryClient]);

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
          applyPreferences(me.preferences);
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
    queryClient.clear();
    const token = await authApi.login({ username, password });
    setTokens(token.access_token);
    const me = await authApi.getMe();
    applyPreferences(me.preferences);
    setUser(me);
  };

  const register = async (
    email: string,
    username: string,
    password: string,
    fullName?: string,
    inviteToken?: string,
  ) => {
    await authApi.register({
      email, username, password,
      full_name: fullName,
      invite_token: inviteToken,
    });
    // After invite-only registration the user is in pending_approval and can't login yet,
    // so don't auto-login unless this was the bootstrap (zero users → first user is approved).
    try {
      await login(username, password);
    } catch {
      // pending approval — caller will route to a "pending" page
    }
  };

  const refreshUser = async () => {
    try {
      const me = await authApi.getMe();
      applyPreferences(me.preferences);
      setUser(me);
    } catch {
      // not logged in
    }
  };

  const updatePreferences = async (data: Partial<UserPreferences>) => {
    const updated = await authApi.updatePreferences(data);
    applyPreferences(updated.preferences);
    setUser(updated);
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
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
