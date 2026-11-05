import { useAuthStore } from '../store/authStore';
import { authService } from '../services/authService';

export function useAuth() {
  const setPendingPhone = useAuthStore((s) => s.setPendingPhone);
  const setPendingOtp = useAuthStore((s) => s.setPendingOtp);
  const setSession = useAuthStore((s) => s.setSession);
  const clearSession = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const pendingPhone = useAuthStore((s) => s.pendingPhone);
  const pendingOtp = useAuthStore((s) => s.pendingOtp);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const sendOtp = async (phone: string) => {
    const info = await authService.sendOtp(phone);
    setPendingPhone(info.phone);
    setPendingOtp(info);
    return info;
  };

  const resendOtp = async () => {
    const phone = pendingOtp?.phone ?? pendingPhone;
    if (!phone) throw new Error('No pending phone');
    return sendOtp(phone);
  };

  const verifyOtp = async (otp: string) => {
    const pending = useAuthStore.getState().pendingOtp;
    if (!pending) throw new Error('Request a code first');
    const { token, user } = await authService.verifyOtp(otp, pending);
    setSession(token, user);
  };

  const logout = () => {
    authService.logout();
    clearSession();
  };

  return { sendOtp, resendOtp, verifyOtp, logout, user, pendingPhone, pendingOtp, isAuthenticated };
}
