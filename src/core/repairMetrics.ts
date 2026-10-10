import { checkExactStructuralMatch } from './compare';
import { lex } from './lexer';
import { parse } from './parser';
import type { ASTNode } from '../types/ast';

export interface ScoredRepairCandidate {
  repairedCode: string;
  verified?: boolean;
}

export interface RepairScore {
  verifiedRate: number;
  top1Exact: boolean;
  top3Exact: boolean;
  top1AstMatch: boolean;
  top3AstMatch: boolean;
}

function withoutIdsAndSpans(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutIdsAndSpans);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== 'id' && key !== 'span')
      .map(([key, child]) => [key, withoutIdsAndSpans(child)])
  );
}

export function tokensEqual(a: string, b: string): boolean {
  const significant = (source: string) =>
    lex(source).tokens
      .filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
      .map((token) => `${token.type}:${token.lexeme}`);
  const left = significant(a);
  const right = significant(b);
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

export function astEqual(a: string, b: string): boolean {
  const parsedA = parse(a);
  const parsedB = parse(b);
  if (parsedA.errors.length > 0 || parsedB.errors.length > 0) return false;
  const treeA = parsedA.ast as ASTNode;
  const treeB = parsedB.ast as ASTNode;
  return (
    checkExactStructuralMatch(treeA, treeB) &&
    JSON.stringify(withoutIdsAndSpans(treeA)) ===
      JSON.stringify(withoutIdsAndSpans(treeB))
  );
}

export function scoreRepair(
  candidates: ScoredRepairCandidate[],
  groundTruth: string
): RepairScore {
  const verified = candidates.filter((candidate) => parse(candidate.repairedCode).errors.length === 0);
  const top3 = candidates.slice(0, 3);
  return {
    verifiedRate: candidates.length === 0 ? 0 : verified.length / candidates.length,
    top1Exact: Boolean(candidates[0] && tokensEqual(candidates[0].repairedCode, groundTruth)),
    top3Exact: top3.some((candidate) => tokensEqual(candidate.repairedCode, groundTruth)),
    top1AstMatch: Boolean(candidates[0] && astEqual(candidates[0].repairedCode, groundTruth)),
    top3AstMatch: top3.some((candidate) => astEqual(candidate.repairedCode, groundTruth)),
  };
}
