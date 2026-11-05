// @ts-nocheck
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

/** The code that was just sent, as described by the backend (or the offline demo). */
export interface PendingOtp {
  phone: string;            // normalised number the code was sent to
  maskedPhone: string;
  delivery: 'sms' | 'console' | 'offline';
  provider?: string;
  demoCodeEnabled: boolean;
  resendAt: number;         // epoch ms
  expiresAt: number;        // epoch ms
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  pendingPhone: string | null;
  pendingOtp: PendingOtp | null;
  setPendingPhone: (phone: string) => void;
  setPendingOtp: (otp: PendingOtp | null) => void;
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
      pendingOtp: null,
      setPendingPhone: (phone) => set({ pendingPhone: phone }),
      setPendingOtp: (pendingOtp) => set({ pendingOtp }),
      setSession: (token, user) => {
        localStorage.setItem('wg_token', token);
        set({ token, user, isAuthenticated: true, pendingOtp: null });
      },
      logout: () => {
        localStorage.removeItem('wg_token');
        set({ user: null, token: null, isAuthenticated: false, pendingPhone: null, pendingOtp: null });
      },
    }),
    { name: 'wg-auth' }
  )
);
