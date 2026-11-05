import { useEffect, useRef, useState } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { ShieldCheck, ArrowLeft, KeyRound, MessageSquare, Terminal, WifiOff, Loader, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { OTP_DEMO_CODE } from '../../utils/constants';

interface Props {
  onBack: () => void;
  onVerified: () => void;
}

const LENGTH = 6;

export default function OTPScreen({ onBack, onVerified }: Props) {
  const { verifyOtp, resendOtp, pendingOtp, pendingPhone } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const shake = useAnimationControls();

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const resendIn = Math.max(0, Math.ceil(((pendingOtp?.resendAt ?? 0) - now) / 1000));
  const expired = !!pendingOtp && now > pendingOtp.expiresAt;

  const submit = async (code = digits.join('')) => {
    if (loading) return;
    setError(null);
    setNotice(null);
    if (code.length !== LENGTH) {
      setError(`Enter all ${LENGTH} digits`);
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(code);
      onVerified();
    } catch (err) {
      setError((err as Error).message || 'Invalid OTP, try again');
      setDigits(Array(LENGTH).fill(''));
      shake.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.4 } });
      refs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const setDigit = (i: number, v: string) => {
    const cleaned = v.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = cleaned;
    setDigits(next);
    setError(null);
    if (cleaned && i < LENGTH - 1) refs.current[i + 1]?.focus();
    // Submit as soon as the last digit lands — no extra click needed.
    if (cleaned && next.every(Boolean)) submit(next.join(''));
  };

  const onKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < LENGTH - 1) refs.current[i + 1]?.focus();
  };

  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!text) return;
    const arr = text.split('').concat(Array(LENGTH).fill('')).slice(0, LENGTH);
    setDigits(arr);
    refs.current[Math.min(LENGTH - 1, text.length - 1)]?.focus();
    if (text.length === LENGTH) submit(text);
  };

  const resend = async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const info = await resendOtp();
      setDigits(Array(LENGTH).fill(''));
      refs.current[0]?.focus();
      setNotice(info.delivery === 'sms' ? `New code sent to ${info.maskedPhone}` : 'New code generated');
    } catch (err) {
      setError((err as Error).message || 'Could not resend the code');
    } finally {
      setResending(false);
    }
  };

  const delivery = pendingOtp?.delivery ?? 'offline';
  const target = pendingOtp?.maskedPhone ?? pendingPhone;

  return (
    <div data-testid="otp-screen" className="glass-strong rounded-3xl p-8 sm:p-10">
      <button
        onClick={onBack}
        data-testid="back-to-phone"
        className="flex items-center gap-1.5 text-xs text-white/50 hover:text-white/90 transition mb-6"
      >
        <ArrowLeft size={14} /> Use a different number
      </button>

      <div className="inline-flex items-center gap-2 pill border border-moss-500/30 bg-moss-500/10 text-moss-300 mb-5">
        <ShieldCheck size={12} />
        <span className="uppercase tracking-[0.18em] text-[10px]">Verify identity</span>
      </div>

      <h2 className="font-display text-3xl font-semibold tracking-tight">Enter the 6-digit code</h2>
      <div className="mt-3 flex items-start gap-2 text-sm text-white/55" data-testid="otp-delivery">
        {delivery === 'sms' ? (
          <>
            <MessageSquare size={15} className="mt-0.5 text-moss-300 shrink-0" />
            <span>
              Sent by SMS to <span className="font-mono text-moss-300">{target}</span>
            </span>
          </>
        ) : delivery === 'console' ? (
          <>
            <Terminal size={15} className="mt-0.5 text-white/40 shrink-0" />
            <span>
              Code for <span className="font-mono text-moss-300">{target}</span> is shown in the backend window
              (no SMS gateway configured yet).
            </span>
          </>
        ) : (
          <>
            <WifiOff size={15} className="mt-0.5 text-amber2-300 shrink-0" />
            <span>
              Demo mode for <span className="font-mono text-moss-300">{target}</span> — the detection server is offline.
            </span>
          </>
        )}
      </div>
      {pendingOtp?.demoCodeEnabled && (
        <p className="mt-1 text-[11px] text-white/30 font-mono">Demo code: {OTP_DEMO_CODE}</p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="mt-8"
      >
        <motion.div animate={shake} className="grid grid-cols-6 gap-2 sm:gap-3" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                refs.current[i] = el;
              }}
              data-testid={`otp-digit-${i}`}
              inputMode="numeric"
              autoComplete={i === 0 ? 'one-time-code' : 'off'}
              aria-label={`Digit ${i + 1}`}
              maxLength={1}
              value={d}
              disabled={loading}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              onFocus={(e) => e.target.select()}
              className="w-full min-w-0 h-14 sm:h-16 text-center font-mono text-2xl glass rounded-xl border border-white/10 outline-none focus:ring-2 focus:ring-moss-400/40 focus:border-moss-400/30 transition disabled:opacity-60"
            />
          ))}
        </motion.div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm text-threat-400"
            data-testid="otp-error"
            role="alert"
          >
            {error}
          </motion.div>
        )}
        {!error && expired && (
          <div className="mt-4 text-sm text-amber2-300">This code has expired — request a new one.</div>
        )}
        {notice && !error && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 text-sm text-moss-300 inline-flex items-center gap-1.5"
          >
            <CheckCircle2 size={14} /> {notice}
          </motion.div>
        )}

        <div className="mt-6 flex items-center justify-between text-xs">
          <button
            type="button"
            data-testid="resend-otp"
            disabled={resendIn > 0 || resending}
            onClick={resend}
            className="font-mono uppercase tracking-[0.18em] text-white/40 hover:text-moss-300 disabled:opacity-50 disabled:hover:text-white/40 inline-flex items-center gap-1.5"
          >
            {resending && <Loader size={11} className="animate-spin" />}
            {resending ? 'Sending…' : resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
          </button>
          <div className="font-mono text-[10px] text-white/30 uppercase tracking-wider">
            {pendingOtp && !expired ? `Valid ${Math.ceil((pendingOtp.expiresAt - now) / 60000)} min` : 'Encrypted'}
          </div>
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
            {loading ? <Loader size={16} className="animate-spin" /> : <KeyRound size={16} />}
            {loading ? 'Verifying…' : 'Verify & continue'}
          </span>
        </motion.button>
      </form>
    </div>
  );
}
