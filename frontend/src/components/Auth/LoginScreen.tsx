// @ts-nocheck
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Phone, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { isValidPhone } from '../../utils/validators';

interface Props {
  onSent: () => void;
}

export default function LoginScreen({ onSent }: Props) {
  const { sendOtp } = useAuth();
  const [phone, setPhone] = useState('+91 ');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidPhone(phone)) {
      setError('Enter a valid phone number');
      return;
    }
    setLoading(true);
    try {
      await sendOtp(phone);
      onSent();
    } catch {
      setError('Could not send OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="login-screen" className="glass-strong rounded-3xl p-8 sm:p-10">
      <div className="inline-flex items-center gap-2 pill border border-moss-500/30 bg-moss-500/10 text-moss-300 mb-6">
        <ShieldCheck size={12} />
        <span className="uppercase tracking-[0.18em] text-[10px]">Secure access</span>
      </div>

      <h2 className="font-display text-3xl font-semibold tracking-tight">
        Sign in to your <span className="text-moss-300">sentinel</span>
      </h2>
      <p className="mt-2 text-sm text-white/50">
        We'll send a 6-digit verification code to your registered phone number.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block">
          <span className="text-[11px] uppercase tracking-[0.22em] text-white/45 font-mono">
            Phone number
          </span>
          <div className="mt-2 flex items-center gap-2 glass rounded-xl px-4 py-3.5 focus-within:ring-1 focus-within:ring-moss-400/40 transition">
            <Phone size={16} className="text-white/40" />
            <input
              data-testid="phone-input"
              type="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="bg-transparent outline-none text-base font-mono tracking-wide w-full placeholder-white/25"
            />
          </div>
        </label>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-threat-400"
            data-testid="login-error"
          >
            {error}
          </motion.div>
        )}

        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ y: 1, scale: 0.98 }}
          type="submit"
          disabled={loading}
          data-testid="send-otp-btn"
          className="group relative w-full mt-2 px-5 py-3.5 rounded-xl bg-gradient-to-b from-moss-400 to-moss-600 text-forest-900 font-semibold tracking-tight shadow-glow-safe disabled:opacity-60 transition"
        >
          <span className="inline-flex items-center justify-center gap-2">
            {loading ? 'Sending OTP…' : 'Continue'}
            {!loading && <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />}
          </span>
        </motion.button>

        <div className="pt-4 text-center text-[11px] text-white/35 font-mono uppercase tracking-[0.2em]">
          By continuing, you accept the ranger code of conduct
        </div>
      </form>
    </div>
  );
}
