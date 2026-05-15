// @ts-nocheck
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import AuthLayout from '../components/Auth/AuthLayout';
import LoginScreen from '../components/Auth/LoginScreen';
import OTPScreen from '../components/Auth/OTPScreen';
import { useAuthStore } from '../store/authStore';

export default function LoginPage() {
  const nav = useNavigate();
  const isAuthed = useAuthStore((s) => s.isAuthenticated);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  useEffect(() => {
    if (isAuthed) nav('/', { replace: true });
  }, [isAuthed, nav]);

  return (
    <AuthLayout>
      <AnimatePresence mode="wait">
        {step === 'phone' ? (
          <motion.div
            key="phone"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.3 }}
          >
            <LoginScreen onSent={() => setStep('otp')} />
          </motion.div>
        ) : (
          <motion.div
            key="otp"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.3 }}
          >
            <OTPScreen
              onBack={() => setStep('phone')}
              onVerified={() => nav('/', { replace: true })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
