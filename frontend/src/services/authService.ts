import type { User } from '../types';
import type { PendingOtp } from '../store/authStore';
import { OTP_DEMO_CODE } from '../utils/constants';
import { ApiError } from './api';
import { backend, type AuthConfig } from './backend';

// Sign-in goes through the WildGuard backend, which texts a one-time code to
// the number entered (or prints it in the server window when no SMS gateway is
// configured). Only when the backend cannot be reached at all does the
// original offline mock take over, so the dashboard can still open in demo
// mode — a backend answer (wrong code, failed SMS, rate limit) is never
// mistaken for "offline".
const offline = (err: unknown) => !(err instanceof ApiError && err.fromBackend);

const mock = {
  async sendOtp(phone: string): Promise<{ ok: true; phone: string }> {
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true, phone };
  },
  async verifyOtp(phone: string, otp: string): Promise<{ token: string; user: User }> {
    await new Promise((r) => setTimeout(r, 800));
    if (otp !== OTP_DEMO_CODE && !/^\d{6}$/.test(otp)) {
      throw new Error('Invalid OTP');
    }
    // Demo: any 6-digit OTP works, but 123456 is the recommended demo code.
    const token = `mock.jwt.${btoa(phone)}.${Date.now()}`;
    const user: User = {
      id: `USR-${phone.slice(-4)}`,
      phone,
      name: 'Sania',
      role: 'ranger',
    };
    return { token, user };
  },
};

export const authService = {
  /** Backend sign-in settings, or null when the backend is unreachable. */
  async config(): Promise<AuthConfig | null> {
    try {
      return await backend.authConfig();
    } catch {
      return null;
    }
  },

  async sendOtp(phone: string): Promise<PendingOtp> {
    try {
      const r = await backend.sendOtp(phone);
      return {
        phone: r.phone,
        maskedPhone: r.masked_phone,
        delivery: r.delivery,
        provider: r.provider,
        demoCodeEnabled: r.demo_code_enabled,
        resendAt: Date.now() + r.resend_in * 1000,
        expiresAt: Date.now() + r.expires_in * 1000,
      };
    } catch (err) {
      if (!offline(err)) throw err;
      await mock.sendOtp(phone);
      return {
        phone,
        maskedPhone: phone,
        delivery: 'offline',
        demoCodeEnabled: true,
        resendAt: Date.now() + 30000,
        expiresAt: Date.now() + 300000,
      };
    }
  },

  async verifyOtp(otp: string, pending: PendingOtp): Promise<{ token: string; user: User }> {
    if (pending.delivery === 'offline') return mock.verifyOtp(pending.phone, otp);
    return backend.verifyOtp(pending.phone, otp);
  },

  async logout(): Promise<void> {
    try {
      await backend.logout();
    } catch {
      /* offline or already signed out */
    }
  },
};
