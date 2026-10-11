import type { ASTNode, ParseResult, Token } from '../../types/ast';
import type { RepairResponse } from '../../ai/repair';
import type { ComparisonMetrics } from '../../core/compare';
import type { SampleRecord } from '../../lib/supabase';

export type PlaygroundMode = 'Strict' | 'Repair';
export type PlaygroundEngine =
  'Classical' | 'N-gram' | 'Gemini' | 'Arbora-T5' | 'Ensemble' | 'Compare';
export type PlaygroundTab =
  'Tokens' | 'Trace' | 'AST' | 'Errors' | 'Compare' | 'Explain' | 'Metrics';

export interface PlaygroundAnalysis {
  code: string;
  title: string;
  mode: PlaygroundMode;
  engine: PlaygroundEngine;
  parseResult: ParseResult | null;
  tokens: Token[];
  parseDuration: number;
  isParsing: boolean;
  repairResponse: RepairResponse | null;
  isRepairing: boolean;
  neuralAst: ASTNode | null;
  comparisonMetrics: ComparisonMetrics | null;
  samples: SampleRecord[];
}
