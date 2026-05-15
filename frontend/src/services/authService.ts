// @ts-nocheck
import type { User } from '../types';
import { OTP_DEMO_CODE } from '../utils/constants';

// Mocked auth service. Replace with real API calls when backend ready.
export const authService = {
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
