// @ts-nocheck
import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';

export function useAuth() {
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);
  const setSession = useAuthStore((s) => s.setSession);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const sendOtp = async (phone: string) => {
    await authService.sendOtp(phone);
    setPendingPhone(phone);
  };

  const verifyOtp = async (otp: string) => {
    if (!pendingPhone) throw new Error('No pending phone');
    const { token, user } = await authService.verifyOtp(pendingPhone, otp);
    setSession(token, user);
  };

  return { sendOtp, verifyOtp, logout, user, pendingPhone, isAuthenticated };
}
