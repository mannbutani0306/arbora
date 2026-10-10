import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface ASTStepNode {
  id: string;
  label: string;
  category: 'fn' | 'stmt' | 'expr' | 'term';
  x: number; // percentage in SVG / box
  y: number;
  parentId?: string;
  step: number;
}

const TREE_NODES: ASTStepNode[] = [
  { id: 'fn', label: 'Function solve(x)', category: 'fn', x: 50, y: 14, step: 1 },
  { id: 'param', label: 'Param "x"', category: 'term', x: 25, y: 38, parentId: 'fn', step: 2 },
  { id: 'ret', label: 'ReturnStatement', category: 'stmt', x: 75, y: 38, parentId: 'fn', step: 2 },
  { id: 'add', label: 'BinaryExpr (+)', category: 'expr', x: 75, y: 62, parentId: 'ret', step: 3 },
  { id: 'mul', label: 'BinaryExpr (*)', category: 'expr', x: 60, y: 84, parentId: 'add', step: 4 },
  { id: 'lit1', label: 'Literal 1', category: 'term', x: 90, y: 84, parentId: 'add', step: 4 },
  { id: 'var_x', label: 'Identifier "x"', category: 'term', x: 48, y: 99, parentId: 'mul', step: 5 },
  { id: 'lit2', label: 'Literal 2', category: 'term', x: 70, y: 99, parentId: 'mul', step: 5 },
];

export function MiniAstVisualizer() {
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 6;

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev >= totalSteps ? 1 : prev + 1));
    }, 1400);

    return () => clearInterval(timer);
  }, [totalSteps]);

  const activeLine = currentStep <= 2 ? 1 : currentStep <= 5 ? 2 : 3;

  return (
    <div className="w-full max-w-lg bg-white border border-[#E7E5E4] rounded-xl shadow-xs overflow-hidden flex flex-col">
      {/* Code Snippet Header */}
      <div className="border-b border-[#E7E5E4] bg-[#FAFAF9]/60 px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#E7E5E4]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#E7E5E4]" />
          <div className="w-2.5 h-2.5 rounded-full bg-[#E7E5E4]" />
        </div>
        <span className="font-mono text-xs text-[#78716C]">solve.ar</span>
        <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
          Step {Math.min(currentStep, 5)}/5
        </span>
      </div>

      {/* 3-line code snippet */}
      <div className="p-3.5 bg-white font-mono text-xs leading-relaxed border-b border-[#E7E5E4]">
        <div
          className={`flex items-center px-2 py-0.5 rounded transition-colors duration-200 ${
            activeLine === 1 ? 'bg-emerald-50/70 text-emerald-950 font-medium' : 'text-[#78716C]'
          }`}
        >
          <span className="w-5 text-[#78716C]/60 select-none text-[11px]">1</span>
          <span>
            <span className="text-emerald-600">fn</span> solve(x) &#123;
          </span>
        </div>
        <div
          className={`flex items-center px-2 py-0.5 rounded transition-colors duration-200 ${
            activeLine === 2 ? 'bg-emerald-50/70 text-emerald-950 font-medium' : 'text-[#78716C]'
          }`}
        >
          <span className="w-5 text-[#78716C]/60 select-none text-[11px]">2</span>
          <span>
            &nbsp;&nbsp;<span className="text-indigo-600">return</span> x * 2 + 1;
          </span>
        </div>
        <div
          className={`flex items-center px-2 py-0.5 rounded transition-colors duration-200 ${
            activeLine === 3 ? 'bg-emerald-50/70 text-emerald-950 font-medium' : 'text-[#78716C]'
          }`}
        >
          <span className="w-5 text-[#78716C]/60 select-none text-[11px]">3</span>
          <span>&#125;</span>
        </div>
      </div>

      {/* Mini AST Canvas */}
      <div className="relative w-full h-64 bg-[#FAFAF9]/40 p-3 select-none overflow-hidden">
        {/* SVG Connectors */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 110" preserveAspectRatio="none">
          {TREE_NODES.filter((n) => n.parentId && n.step <= currentStep).map((node) => {
            const parent = TREE_NODES.find((p) => p.id === node.parentId);
            if (!parent) return null;
            return (
              <motion.line
                key={`line-${node.id}`}
                x1={`${parent.x}%`}
                y1={`${parent.y}%`}
                x2={`${node.x}%`}
                y2={`${node.y}%`}
                stroke="#E7E5E4"
                strokeWidth="1.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.25 }}
              />
            );
          })}
        </svg>

        {/* Tree Nodes */}
        {TREE_NODES.map((node) => {
          const isVisible = node.step <= currentStep;
          if (!isVisible) return null;

          const isLatest = node.step === currentStep;

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0.7, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className={`absolute px-2 py-1 rounded-md text-[11px] font-mono whitespace-nowrap shadow-2xs border transition-colors ${
                isLatest
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/10'
                  : 'bg-white border-[#E7E5E4] text-[#1C1917]'
              }`}
            >
              {node.label}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
