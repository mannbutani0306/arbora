import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArboraLogo } from './ArboraLogo';

interface SplashProps {
  onComplete: () => void;
}

export function Splash({ onComplete }: SplashProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // Check session storage
    const seen = sessionStorage.getItem('arbora_splash_seen');
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (seen === 'true' || prefersReduced) {
      setVisible(false);
      onComplete();
      return;
    }

    // Exactly 2 seconds total splash duration
    const timer = setTimeout(() => {
      sessionStorage.setItem('arbora_splash_seen', 'true');
      setVisible(false);
      setTimeout(onComplete, 250); // slight exit transition
    }, 2000);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="arbora-splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white"
        >
          <div className="flex flex-col items-center">
            {/* Centered Arbora logo */}
            <ArboraLogo size={80} animated={true} />

            {/* Wordmark fades in beneath */}
            <motion.h1
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.4, ease: 'easeOut' }}
              className="mt-4 font-semibold text-2xl tracking-tight text-[#1C1917]"
            >
              Arbora
            </motion.h1>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
