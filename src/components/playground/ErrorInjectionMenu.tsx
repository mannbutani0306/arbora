import { useState } from 'react';
import { Bug } from 'lucide-react';
import type { ErrorInjectionType } from '../../core/errorInjector';

export type InjectionChoice = ErrorInjectionType | 'random';

export function ErrorInjectionMenu({ onInject }: { onInject: (choice: InjectionChoice) => void }) {
  const [choice, setChoice] = useState<InjectionChoice>('random');
  return (
    <div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-1.5">
      <Bug className="h-3.5 w-3.5 text-amber-700" />
      <select
        aria-label="Error injection type"
        value={choice}
        onChange={(event) => setChoice(event.target.value as InjectionChoice)}
        className="max-w-36 bg-transparent px-1 py-1.5 text-xs text-amber-950 focus:outline-none"
      >
        <option value="delete">Delete token</option>
        <option value="insert">Insert token</option>
        <option value="swap">Swap tokens</option>
        <option value="replace">Replace token</option>
        <option value="natural">Natural mistake</option>
        <option value="random">Random</option>
      </select>
      <button
        type="button"
        onClick={() => onInject(choice)}
        title="Inject a parser-breaking error"
        className="rounded-md bg-amber-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-amber-700"
      >
        Inject
      </button>
    </div>
  );
}
