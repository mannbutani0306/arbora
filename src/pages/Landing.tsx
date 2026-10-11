import React from 'react';
import { Link } from 'react-router-dom';
import {
  Code2,
  GitFork,
  Sparkles,
  GitCompare,
  MessageSquare,
  Cpu,
  Terminal,
  Info,
  Share2,
  ArrowRight,
} from 'lucide-react';
import { MiniAstVisualizer } from '../components/MiniAstVisualizer';
import { Tooltip } from '../components/Tooltip';

export function Landing() {
  const pipelineSteps = [
    {
      label: 'Lex',
      icon: Code2,
      desc: 'Tokenizes source into typed stream with positions.',
    },
    {
      label: 'Parse',
      icon: GitFork,
      desc: 'Generates recursive-descent Abstract Syntax Tree.',
    },
    {
      label: 'Repair',
      icon: Sparkles,
      desc: 'AI recovers unbalanced delimiters and syntax errors.',
      ai: true,
    },
    {
      label: 'Compare',
      icon: GitCompare,
      desc: 'Diffs AST mutations across compiler transforms.',
    },
    {
      label: 'Explain',
      icon: MessageSquare,
      desc: 'Translates node mechanics into natural explanations.',
    },
  ];

  const features = [
    {
      icon: Cpu,
      title: 'Instant parsing',
      desc: 'Builds AST structures with sub-millisecond recursive descent.',
    },
    {
      icon: Sparkles,
      title: 'AI recovery',
      desc: 'Heals unclosed delimiters and missing operator tokens.',
      ai: true,
    },
    {
      icon: GitCompare,
      title: 'AST diffing',
      desc: 'Compares syntax variants side-by-side with semantic highlighting.',
    },
    {
      icon: Terminal,
      title: 'Zero runtime',
      desc: 'Executes directly inside your browser without backend latency.',
    },
    {
      icon: Info,
      title: 'Node inspection',
      desc: 'Click any node to view spans and bindings.',
    },
    {
      icon: Share2,
      title: 'Tree export',
      desc: 'Exports JSON trees, DOT diagrams, and token tables.',
    },
  ];

  const scrollToPipeline = () => {
    const el = document.getElementById('pipeline');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="max-w-6xl w-full mx-auto px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Hero Column */}
          <div className="lg:col-span-7 flex flex-col items-start">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#1C1917] leading-[1.08]">
              Code, grown into trees.
            </h1>

            <p className="mt-4 text-base sm:text-lg text-[#78716C] max-w-xl">
              Compile, inspect AST nodes, and repair broken code instantly.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/playground"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors shadow-2xs"
              >
                Open Playground
                <ArrowRight className="w-4 h-4" />
              </Link>
              <button
                type="button"
                onClick={scrollToPipeline}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-[#1C1917] bg-white border border-[#E7E5E4] hover:bg-stone-50 transition-colors"
              >
                How it works
              </button>
            </div>
          </div>

          {/* Right Hero Column: Mini AST visualizer */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <MiniAstVisualizer />
          </div>
        </div>
      </section>

      {/* Pipeline Strip */}
      <section id="pipeline" className="border-y border-[#E7E5E4] bg-white py-12 scroll-mt-14">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            {pipelineSteps.map((step) => {
              const Icon = step.icon;
              return (
                <Tooltip key={step.label} content={step.desc} position="top">
                  <div className="w-full flex flex-col items-center justify-center p-4 rounded-xl border border-[#E7E5E4] bg-[#FAFAF9]/60 hover:bg-white hover:border-stone-300 transition-all duration-150 group">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2.5 transition-colors ${
                        step.ai
                          ? 'bg-indigo-50 text-[#6366F1] group-hover:bg-indigo-100'
                          : 'bg-emerald-50 text-[#059669] group-hover:bg-emerald-100'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-[#1C1917]">{step.label}</span>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features: 6 small cards */}
      <section className="max-w-6xl w-full mx-auto px-6 py-20 sm:py-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feat) => {
            const Icon = feat.icon;
            return (
              <div
                key={feat.title}
                className="p-5 rounded-xl bg-white border border-[#E7E5E4] shadow-2xs hover:border-stone-300 transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3.5 ${
                    feat.ai ? 'bg-indigo-50 text-[#6366F1]' : 'bg-emerald-50 text-[#059669]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-[#1C1917]">{feat.title}</h2>
                <p className="mt-1 text-xs text-[#78716C] leading-relaxed">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </section>
      <div className="mt-auto border-t border-[#E7E5E4] bg-white py-4">
        <div className="mx-auto flex max-w-6xl justify-end px-6">
          <Link
            to="/research"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#A7F3D0] bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Open results
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
