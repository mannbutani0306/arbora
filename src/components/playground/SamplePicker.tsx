import { ChevronDown, FileCode } from 'lucide-react';
import type { SampleRecord } from '../../lib/supabase';

interface SamplePickerProps {
  samples: SampleRecord[];
  onSelect: (sample: SampleRecord) => void;
}

export function SamplePicker({ samples, onSelect }: SamplePickerProps) {
  return (
    <label className="flex items-center gap-2 text-xs text-[#78716C]">
      <FileCode className="h-3.5 w-3.5" />
      <span className="sr-only">Load sample</span>
      <select
        aria-label="Load sample"
        defaultValue=""
        onChange={(event) => {
          const sample = samples.find(({ id }) => id === event.target.value);
          if (sample) onSelect(sample);
          event.target.value = '';
        }}
        className="max-w-40 rounded-lg border border-[#E7E5E4] bg-white px-2 py-1.5 text-xs text-[#1C1917]"
      >
        <option value="" disabled>Samples</option>
        {samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.title}</option>)}
      </select>
      <ChevronDown className="pointer-events-none -ml-7 h-3 w-3" />
    </label>
  );
}
