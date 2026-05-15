
import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { OTP_DEMO_CODE } from '../../utils/constants';

interface Props {
  onBack: () => void;
  onVerified: () => void;
}

export default function OTPScreen({ onBack, onVerified }: Props) {
  const { verifyOtp, pendingPhone } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(30);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const i = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const setDigit = (i: number, v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(-1);
    setDigits((d) => {
      const next = [...d];
      next[i] = cleaned;
      return next;
    });
    if (cleaned && i < 5) refs.current[i + 1]?.focus();
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    const arr = text.split('').concat(Array(6).fill('')).slice(0, 6);
    setDigits(arr);
    refs.current[Math.min(5, text.length - 1)]?.focus();
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    const otp = digits.join('');
    if (otp.length !== 6) {
      setError('Enter all 6 digits');
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(otp);
      onVerified();
    } catch {
      setError('Invalid OTP, try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div data-testid="otp-screen" className="glass-strong rounded-3xl p-8 sm:p-10">
      <button
        onClick={onBack}
        data-testid="back-to-phone"
        className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition mb-6"
      >
        <ArrowLeft size={14} /> Use a different number
      </button>

      <div className="inline-flex items-center gap-2 pill border border-moss-500/30 bg-moss-500/10 text-moss-300 mb-5">
        <ShieldCheck size={12} />
        <span className="uppercase tracking-[0.18em] text-[10px]">Verify identity</span>
      </div>

      <h2 className="font-display text-3xl font-semibold tracking-tight">Enter the 6-digit code</h2>
      <p className="mt-2 text-sm text-white/50">
        Sent to <span className="font-mono text-moss-300">{pendingPhone}</span>. Use{' '}
        <span className="font-mono text-moss-300">{OTP_DEMO_CODE}</span> for the demo.
      </p>

      <form onSubmit={submit} className="mt-8">
        <div className="grid grid-cols-6 gap-2 sm:gap-3" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-testid={`otp-digit-${i}`}
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              className="w-full min-w-0 h-14 sm:h-16 text-center font-mono text-2xl glass rounded-xl border border-white/10 outline-none focus:ring-2 focus:ring-moss-400/40 focus:border-moss-400/30 transition"
            />
          ))}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm text-threat-400"
            data-testid="otp-error"
          >
            {error}
          </motion.div>
        )}

        <div className="mt-6 flex items-center justify-between text-xs">
          <button
            type="button"
            data-testid="resend-otp"
            disabled={seconds > 0}
            onClick={() => setSeconds(30)}
            className="font-mono uppercase tracking-[0.18em] text-white/40 hover:text-moss-300 disabled:opacity-50 disabled:hover:text-white/40"
          >
            {seconds > 0 ? `Resend in ${seconds}s` : 'Resend OTP'}
          </button>
          <div className="font-mono text-[10px] text-white/30 uppercase tracking-wider">Encrypted</div>
        </div>

        <motion.button
          whileHover={{ y: -1 }}
          whileTap={{ y: 1, scale: 0.98 }}
          type="submit"
          disabled={loading}
          data-testid="verify-otp-btn"
          className="group relative w-full mt-6 px-5 py-3.5 rounded-xl bg-gradient-to-b from-moss-400 to-moss-600 text-forest-900 font-semibold tracking-tight shadow-glow-safe disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <KeyRound size={16} /> {loading ? 'Verifying…' : 'Verify & continue'}
          </span>
        </motion.button>
      </form>
    </div>
  );
}