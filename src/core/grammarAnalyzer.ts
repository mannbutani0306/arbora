/**
 * Programmatic Grammar Analyzer for CFGs.
 * Computes:
 * - Nullable non-terminals
 * - FIRST sets for all symbols and symbol sequences
 * - FOLLOW sets for all non-terminals
 * - LL(1) Predictive Parsing Table
 * - Conflict detection and diagnostics
 * - JSON serialization
 */

import { EPSILON, Grammar, ProductionRule } from './grammar';

export const EOF_SYMBOL = '$';

export interface LL1Conflict {
  nonTerminal: string;
  lookahead: string;
  conflictingRules: ProductionRule[];
  reason: 'FIRST_FIRST' | 'FIRST_FOLLOW';
}

export interface GrammarAnalysisResult {
  nullable: string[];
  firstSets: Record<string, string[]>;
  followSets: Record<string, string[]>;
  table: Record<string, Record<string, ProductionRule[]>>;
  conflicts: LL1Conflict[];
  isLL1: boolean;
}

export function computeNullable(grammar: Grammar): Set<string> {
  const nullable = new Set<string>();

  // Direct epsilon productions
  for (const rule of grammar.productions) {
    if (rule.rhs.length === 0 || (rule.rhs.length === 1 && rule.rhs[0] === EPSILON)) {
      nullable.add(rule.lhs);
    }
  }

  // Fixed point iteration
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of grammar.productions) {
      if (nullable.has(rule.lhs)) continue;

      if (rule.rhs.length > 0 && rule.rhs[0] !== EPSILON) {
        const allNullable = rule.rhs.every((sym) => nullable.has(sym));
        if (allNullable) {
          nullable.add(rule.lhs);
          changed = true;
        }
      }
    }
  }

  return nullable;
}

export function computeFirstSets(grammar: Grammar, nullable: Set<string>): Map<string, Set<string>> {
  const first = new Map<string, Set<string>>();

  // Terminals derive only themselves
  for (const term of grammar.terminals) {
    first.set(term, new Set([term]));
  }
  first.set(EPSILON, new Set([EPSILON]));
  first.set(EOF_SYMBOL, new Set([EOF_SYMBOL]));

  // Initialize non-terminals
  for (const nt of grammar.nonTerminals) {
    first.set(nt, new Set<string>());
  }

  let changed = true;
  while (changed) {
    changed = false;

    for (const rule of grammar.productions) {
      const targetSet = first.get(rule.lhs)!;
      const prevSize = targetSet.size;

      if (rule.rhs.length === 0 || (rule.rhs.length === 1 && rule.rhs[0] === EPSILON)) {
        targetSet.add(EPSILON);
      } else {
        let allCanBeEmpty = true;

        for (const sym of rule.rhs) {
          const symFirst = first.get(sym) || new Set([sym]);

          for (const item of symFirst) {
            if (item !== EPSILON) {
              targetSet.add(item);
            }
          }

          if (!nullable.has(sym) && sym !== EPSILON) {
            allCanBeEmpty = false;
            break;
          }
        }

        if (allCanBeEmpty) {
          targetSet.add(EPSILON);
        }
      }

      if (targetSet.size > prevSize) {
        changed = true;
      }
    }
  }

  return first;
}

export function computeSequenceFirst(
  seq: string[],
  first: Map<string, Set<string>>,
  nullable: Set<string>
): Set<string> {
  const result = new Set<string>();

  if (seq.length === 0 || (seq.length === 1 && seq[0] === EPSILON)) {
    result.add(EPSILON);
    return result;
  }

  let allEmpty = true;
  for (const sym of seq) {
    const symFirst = first.get(sym) || new Set([sym]);
    for (const item of symFirst) {
      if (item !== EPSILON) {
        result.add(item);
      }
    }

    if (!nullable.has(sym)) {
      allEmpty = false;
      break;
    }
  }

  if (allEmpty) {
    result.add(EPSILON);
  }

  return result;
}

export function computeFollowSets(
  grammar: Grammar,
  nullable: Set<string>,
  first: Map<string, Set<string>>
): Map<string, Set<string>> {
  const follow = new Map<string, Set<string>>();

  for (const nt of grammar.nonTerminals) {
    follow.set(nt, new Set<string>());
  }

  // Start symbol gets EOF
  follow.get(grammar.startSymbol)?.add(EOF_SYMBOL);

  let changed = true;
  while (changed) {
    changed = false;

    for (const rule of grammar.productions) {
      const lhsFollow = follow.get(rule.lhs)!;

      for (let i = 0; i < rule.rhs.length; i++) {
        const B = rule.rhs[i];
        if (!grammar.nonTerminals.includes(B)) continue;

        const bFollow = follow.get(B)!;
        const prevSize = bFollow.size;

        const beta = rule.rhs.slice(i + 1);
        const betaFirst = computeSequenceFirst(beta, first, nullable);

        for (const sym of betaFirst) {
          if (sym !== EPSILON) {
            bFollow.add(sym);
          }
        }

        if (betaFirst.has(EPSILON)) {
          for (const sym of lhsFollow) {
            bFollow.add(sym);
          }
        }

        if (bFollow.size > prevSize) {
          changed = true;
        }
      }
    }
  }

  return follow;
}

export function buildLL1Table(
  grammar: Grammar,
  nullable: Set<string>,
  first: Map<string, Set<string>>,
  follow: Map<string, Set<string>>
): { table: Record<string, Record<string, ProductionRule[]>>; conflicts: LL1Conflict[] } {
  const table: Record<string, Record<string, ProductionRule[]>> = {};
  const conflicts: LL1Conflict[] = [];

  for (const nt of grammar.nonTerminals) {
    table[nt] = {};
  }

  for (const rule of grammar.productions) {
    const rhsFirst = computeSequenceFirst(rule.rhs, first, nullable);

    // Rule 1: for each terminal a in FIRST(alpha)
    for (const a of rhsFirst) {
      if (a !== EPSILON) {
        if (!table[rule.lhs][a]) {
          table[rule.lhs][a] = [];
        }
        table[rule.lhs][a].push(rule);
      }
    }

    // Rule 2: if epsilon in FIRST(alpha), for each b in FOLLOW(A)
    if (rhsFirst.has(EPSILON)) {
      const aFollow = follow.get(rule.lhs) || new Set<string>();
      for (const b of aFollow) {
        if (!table[rule.lhs][b]) {
          table[rule.lhs][b] = [];
        }
        if (!table[rule.lhs][b].includes(rule)) {
          table[rule.lhs][b].push(rule);
        }
      }
    }
  }

  // Detect and catalog conflicts
  for (const nt of grammar.nonTerminals) {
    for (const lookahead of Object.keys(table[nt])) {
      const rules = table[nt][lookahead];
      if (rules.length > 1) {
        const hasEpsilonDerivation = rules.some((r) =>
          computeSequenceFirst(r.rhs, first, nullable).has(EPSILON)
        );
        conflicts.push({
          nonTerminal: nt,
          lookahead,
          conflictingRules: rules,
          reason: hasEpsilonDerivation ? 'FIRST_FOLLOW' : 'FIRST_FIRST',
        });
      }
    }
  }

  return { table, conflicts };
}

export function analyzeGrammar(grammar: Grammar): GrammarAnalysisResult {
  const nullableSet = computeNullable(grammar);
  const firstMap = computeFirstSets(grammar, nullableSet);
  const followMap = computeFollowSets(grammar, nullableSet, firstMap);
  const { table, conflicts } = buildLL1Table(grammar, nullableSet, firstMap, followMap);

  const firstSets: Record<string, string[]> = {};
  for (const [key, val] of firstMap.entries()) {
    firstSets[key] = Array.from(val).sort();
  }

  const followSets: Record<string, string[]> = {};
  for (const [key, val] of followMap.entries()) {
    followSets[key] = Array.from(val).sort();
  }

  return {
    nullable: Array.from(nullableSet).sort(),
    firstSets,
    followSets,
    table,
    conflicts,
    isLL1: conflicts.length === 0,
  };
}

export function exportGrammarAnalysisJSON(result: GrammarAnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
