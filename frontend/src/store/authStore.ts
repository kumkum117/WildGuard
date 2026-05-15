// @ts-nocheck
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  pendingPhone: string | null;
  setPendingPhone: (phone: string) => void;
  setSession: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      pendingPhone: null,
      setPendingPhone: (phone) => set({ pendingPhone: phone }),
      setSession: (token, user) => {
        localStorage.setItem('wg_token', token);
        set({ token, user, isAuthenticated: true });
      },
      logout: () => {
        localStorage.removeItem('wg_token');
        set({ user: null, token: null, isAuthenticated: false, pendingPhone: null });
      },
    }),
    { name: 'wg-auth' }
  )
);
