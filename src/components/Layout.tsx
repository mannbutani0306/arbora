import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { checkAiAvailability, isAiAvailable, subscribeAiAvailability } from '../ai/gatewayClient';

export function Layout() {
  const [aiAvailable, setAiAvailable] = useState(isAiAvailable());

  useEffect(() => {
    const unsubscribe = subscribeAiAvailability(setAiAvailable);
    const check = () => void checkAiAvailability();
    check();
    const interval = setInterval(check, 30_000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[#FAFAF9] text-[#1C1917]">
      <Navbar />
      {!aiAvailable && (
        <div className="px-4 py-1 text-center text-[11px] text-[#78716C] bg-white border-b border-[#E7E5E4]">
          AI offline
        </div>
      )}
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
