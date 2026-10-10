import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArboraLogo } from './ArboraLogo';
import { useAuth } from '../lib/AuthContext';

export function Navbar() {
  const location = useLocation();
  const { user, signOut } = useAuth();

  const links = [
    { label: 'Playground', to: '/playground' },
    { label: 'History', to: '/history' },
    { label: 'Benchmarks', to: '/benchmarks' },
    { label: 'Docs', to: '/docs' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full bg-[#FAFAF9]/90 backdrop-blur-md border-b border-[#E7E5E4]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2 group">
          <ArboraLogo size={28} showWordmark={true} />
        </Link>

        {/* Nav Links */}
        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors duration-150 ${
                  isActive
                    ? 'text-[#1C1917] font-medium bg-stone-100'
                    : 'text-[#78716C] hover:text-[#1C1917] hover:bg-stone-100/60'
                }`}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="h-4 w-[1px] bg-[#E7E5E4] mx-1" />

          {/* User / Sign In */}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#78716C] max-w-[120px] truncate hidden md:inline">
                {user.email?.split('@')[0]}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#78716C] hover:text-[#1C1917] hover:bg-stone-100 transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link
              to="/auth"
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-[#1C1917] hover:bg-stone-100 transition-colors"
            >
              Sign in
            </Link>
          )}

          {/* Open Playground Action */}
          <Link
            to="/playground"
            className="hidden sm:inline-flex px-3.5 py-1.5 rounded-lg text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
          >
            Playground
          </Link>
        </nav>
      </div>
    </header>
  );
}

