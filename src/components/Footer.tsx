import React from 'react';
import { Link } from 'react-router-dom';
import { ArboraLogo } from './ArboraLogo';

export function Footer() {
  return (
    <footer className="w-full border-t border-[#E7E5E4] bg-white py-8">
      <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <ArboraLogo size={24} showWordmark={true} />
        </Link>

        {/* 3 links only */}
        <nav className="flex items-center gap-6 text-sm text-[#78716C]">
          <Link to="/playground" className="hover:text-[#1C1917] transition-colors">
            Playground
          </Link>
          <Link to="/benchmarks" className="hover:text-[#1C1917] transition-colors">
            Benchmarks
          </Link>
          <Link to="/research" className="hover:text-[#1C1917] transition-colors">
            Research
          </Link>
          <Link to="/docs" className="hover:text-[#1C1917] transition-colors">
            Docs
          </Link>
        </nav>
      </div>
    </footer>
  );
}
