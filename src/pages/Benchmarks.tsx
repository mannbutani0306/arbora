import React, { useState } from 'react';
import { OfflineResults } from './OfflineResults';
import { LiveBenchmarks } from './LiveBenchmarks';

type BenchmarkMode = 'offline' | 'live';

export function Benchmarks() {
  const [mode, setMode] = useState<BenchmarkMode>('offline');
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#1C1917]">Benchmarks</h1>
          <p className="mt-0.5 text-xs text-[#78716C]">
            Reproducible offline evidence and a separate live sample.
          </p>
        </div>
        <div
          role="group"
          aria-label="Benchmark mode"
          className="inline-flex rounded-lg border border-[#E7E5E4] bg-stone-100 p-0.5"
        >
          <button
            type="button"
            aria-pressed={mode === 'offline'}
            onClick={() => setMode('offline')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === 'offline' ? 'bg-white text-[#1C1917] shadow-2xs' : 'text-[#78716C]'}`}
          >
            Offline results
          </button>
          <button
            type="button"
            aria-pressed={mode === 'live'}
            onClick={() => setMode('live')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${mode === 'live' ? 'bg-white text-[#1C1917] shadow-2xs' : 'text-[#78716C]'}`}
          >
            Live run
          </button>
        </div>
      </div>
      {mode === 'offline' ? <OfflineResults /> : <LiveBenchmarks />}
    </div>
  );
}
