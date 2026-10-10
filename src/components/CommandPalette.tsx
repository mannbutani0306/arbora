import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Code2,
  Play,
  FileText,
  BarChart2,
  History,
  Sparkles,
  HelpCircle,
  FileCode,
  LogIn,
  Layers,
  ArrowRight,
  X,
} from 'lucide-react';

interface CommandItem {
  id: string;
  title: string;
  category: 'Navigation' | 'Actions' | 'Tools';
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteProps {
  onOpenReport?: () => void;
  onRunCode?: () => void;
  onOpenSamples?: () => void;
  onStartTour?: () => void;
}

export function CommandPalette({
  onOpenReport,
  onRunCode,
  onOpenSamples,
  onStartTour,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Global hotkey: Ctrl+K or Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands: CommandItem[] = [
    {
      id: 'nav_playground',
      title: 'Open Playground',
      category: 'Navigation',
      icon: <Code2 className="w-3.5 h-3.5 text-[#059669]" />,
      action: () => {
        navigate('/playground');
        setOpen(false);
      },
    },
    {
      id: 'nav_benchmarks',
      title: 'Open Benchmarks',
      category: 'Navigation',
      icon: <BarChart2 className="w-3.5 h-3.5 text-[#6366F1]" />,
      action: () => {
        navigate('/benchmarks');
        setOpen(false);
      },
    },
    {
      id: 'nav_docs',
      title: 'Grammar & Docs',
      category: 'Navigation',
      icon: <FileText className="w-3.5 h-3.5 text-stone-600" />,
      action: () => {
        navigate('/docs');
        setOpen(false);
      },
    },
    {
      id: 'nav_history',
      title: 'Analysis History',
      category: 'Navigation',
      icon: <History className="w-3.5 h-3.5 text-stone-600" />,
      action: () => {
        navigate('/history');
        setOpen(false);
      },
    },
    {
      id: 'act_run',
      title: 'Parse Code',
      category: 'Actions',
      shortcut: 'Ctrl+Enter',
      icon: <Play className="w-3.5 h-3.5 text-[#059669]" />,
      action: () => {
        setOpen(false);
        if (onRunCode) onRunCode();
        else navigate('/playground');
      },
    },
    {
      id: 'act_samples',
      title: 'Load Samples',
      category: 'Actions',
      icon: <FileCode className="w-3.5 h-3.5 text-[#059669]" />,
      action: () => {
        setOpen(false);
        if (onOpenSamples) onOpenSamples();
        else navigate('/playground');
      },
    },
    {
      id: 'act_report',
      title: 'Export Report',
      category: 'Tools',
      icon: <FileText className="w-3.5 h-3.5 text-indigo-500" />,
      action: () => {
        setOpen(false);
        if (onOpenReport) onOpenReport();
      },
    },
    {
      id: 'act_tour',
      title: 'Start Tour',
      category: 'Tools',
      icon: <HelpCircle className="w-3.5 h-3.5 text-[#059669]" />,
      action: () => {
        setOpen(false);
        if (onStartTour) onStartTour();
      },
    },
  ];

  const filtered = commands.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.category.toLowerCase().includes(query.toLowerCase())
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        filtered[selectedIndex].action();
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[2px] flex items-start justify-center pt-20 p-4 animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg bg-white rounded-xl border border-[#E7E5E4] shadow-xl overflow-hidden text-[#1C1917] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="p-3 border-b border-[#E7E5E4] flex items-center gap-2.5">
          <Search className="w-4 h-4 text-[#78716C] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Type a command or navigate..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="flex-1 text-xs text-[#1C1917] placeholder:text-[#78716C] bg-transparent focus:outline-none font-sans"
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 text-[#78716C] border border-[#E7E5E4]">
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-[#78716C]">
              No commands found.
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    isSelected
                      ? 'bg-stone-100 text-[#1C1917] font-medium'
                      : 'text-[#1C1917] hover:bg-stone-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    {item.icon}
                    <span>{item.title}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-[#78716C]">
                    {item.shortcut && (
                      <kbd className="font-mono px-1.5 py-0.2 rounded bg-white border border-[#E7E5E4]">
                        {item.shortcut}
                      </kbd>
                    )}
                    <span className="capitalize">{item.category}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="px-3 py-2 bg-stone-50 border-t border-[#E7E5E4] flex items-center justify-between text-[10px] text-[#78716C]">
          <span>Navigate with arrows</span>
          <span>Enter to execute</span>
        </div>
      </div>
    </div>
  );
}
