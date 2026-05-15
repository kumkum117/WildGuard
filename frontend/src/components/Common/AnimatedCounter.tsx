// @ts-nocheck
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function AnimatedCounter({
  value,
  duration = 900,
  suffix = '',
}: {
  value: number;
  duration?: number;
  suffix?: string;
}) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const from = display;
    const diff = value - from;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + diff * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <motion.span
      key={value}
      initial={{ opacity: 0.6, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="font-mono tabular-nums"
    >
      {display.toLocaleString()}
      {suffix}
    </motion.span>
  );
}
