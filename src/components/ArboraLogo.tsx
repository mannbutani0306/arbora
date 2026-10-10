import React from 'react';
import { motion } from 'motion/react';

interface ArboraLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  showWordmark?: boolean;
}

export function ArboraLogo({
  size = 40,
  animated = false,
  className = '',
  showWordmark = false,
}: ArboraLogoProps) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const duration = animated && !prefersReduced ? 1.2 : 0;

  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0 overflow-visible"
        aria-label="Arbora logo"
      >
        {/* Leaf Outline */}
        <motion.path
          d="M 50 92 C 22 75 16 46 28 26 C 36 14 44 8 50 8 C 56 8 64 14 72 26 C 84 46 78 75 50 92 Z"
          stroke="#059669"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="rgba(5, 150, 105, 0.04)"
          initial={animated && !prefersReduced ? { pathLength: 0 } : { pathLength: 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration * 0.8, ease: 'easeInOut' }}
        />

        {/* Central Stem (Tree Trunk) */}
        <motion.path
          d="M 50 92 L 50 68 L 50 42 L 50 20"
          stroke="#059669"
          strokeWidth="2"
          strokeLinecap="round"
          initial={animated && !prefersReduced ? { pathLength: 0 } : { pathLength: 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration * 0.7, delay: duration * 0.2, ease: 'easeOut' }}
        />

        {/* Binary Tree Branch - Level 1 (Left & Right) */}
        <motion.path
          d="M 50 68 L 32 50 M 50 68 L 68 50"
          stroke="#059669"
          strokeWidth="1.8"
          strokeLinecap="round"
          initial={animated && !prefersReduced ? { pathLength: 0 } : { pathLength: 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration * 0.6, delay: duration * 0.35, ease: 'easeOut' }}
        />

        {/* Binary Tree Branch - Level 2 (Sub-branches forming veins) */}
        <motion.path
          d="M 32 50 L 22 34 M 32 50 L 42 36 M 68 50 L 58 36 M 68 50 L 78 34"
          stroke="#059669"
          strokeWidth="1.6"
          strokeLinecap="round"
          initial={animated && !prefersReduced ? { pathLength: 0 } : { pathLength: 1 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: duration * 0.6, delay: duration * 0.5, ease: 'easeOut' }}
        />

        {/* AST Tree Nodes (Circles) */}
        {/* Root Node */}
        <motion.circle
          cx="50"
          cy="68"
          r="3"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25, delay: duration * 0.3 }}
        />
        {/* Level 1 Nodes */}
        <motion.circle
          cx="32"
          cy="50"
          r="2.8"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25, delay: duration * 0.48 }}
        />
        <motion.circle
          cx="68"
          cy="50"
          r="2.8"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.25, delay: duration * 0.48 }}
        />
        {/* Level 2 Leaf Nodes */}
        <motion.circle
          cx="22"
          cy="34"
          r="2.2"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, delay: duration * 0.65 }}
        />
        <motion.circle
          cx="42"
          cy="36"
          r="2.2"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, delay: duration * 0.65 }}
        />
        <motion.circle
          cx="58"
          cy="36"
          r="2.2"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, delay: duration * 0.65 }}
        />
        <motion.circle
          cx="78"
          cy="34"
          r="2.2"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, delay: duration * 0.65 }}
        />
        {/* Apex Node */}
        <motion.circle
          cx="50"
          cy="20"
          r="2.4"
          fill="#059669"
          initial={animated && !prefersReduced ? { scale: 0 } : { scale: 1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.2, delay: duration * 0.7 }}
        />
      </svg>

      {showWordmark && (
        <span className="font-semibold text-lg tracking-tight text-[#1C1917]">
          Arbora
        </span>
      )}
    </div>
  );
}
