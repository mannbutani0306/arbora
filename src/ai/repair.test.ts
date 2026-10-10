import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateEditDistance,
  verifyAndRankCandidates,
  logRepairAttempt,
  getRepairStats,
  clearRepairStats,
  extractErrorContexts,
} from './repair';
import { lex } from '../core/lexer';
import { parse } from '../core/parser';
import { classicalRepair } from '../core/classicalRepair';

vi.mock('./gatewayClient', () => ({
  callGateway: vi.fn(),
  isAiAvailable: () => false,
}));

describe('AI Repair Engine', () => {
  beforeEach(async () => {
    await clearRepairStats();
  });

  describe('Edit distance', () => {
    it('computes exact distance between strings', () => {
      expect(calculateEditDistance('int x = 1;', 'int x = 1;')).toBe(0);
      expect(calculateEditDistance('int x', 'int x;')).toBe(1);
      expect(calculateEditDistance('', 'abc')).toBe(3);
      expect(calculateEditDistance('fn', 'function')).toBe(6);
    });
  });

  describe('Verification and Ranking', () => {
    it('marks only zero-error candidates as verified and ranks them first', () => {
      const original = 'int main() { return 0 }';

      const candidateBroken = {
        description: 'Broken fix',
        edits: [],
        repairedCode: 'int main() { return }', // syntax error
        confidence: 0.99,
        rationale: 'Invalid attempt',
      };

      const candidateVerified1 = {
        description: 'Valid fix with semicolon',
        edits: [{ line: 1, column: 23, operation: 'insert' as const, text: ';' }],
        repairedCode: 'int main() { return 0; }', // valid
        confidence: 0.85,
        rationale: 'Appended missing semicolon',
      };

      const candidateVerified2 = {
        description: 'Valid fix with higher confidence',
        edits: [{ line: 1, column: 23, operation: 'insert' as const, text: ';' }],
        repairedCode: 'int main() {\n    return 0;\n}', // also valid
        confidence: 0.95,
        rationale: 'Clean formatting and semicolon',
      };

      const ranked = verifyAndRankCandidates(
        [candidateBroken, candidateVerified1, candidateVerified2],
        original
      );

      expect(ranked).toHaveLength(3);
      // Both valid ones must be ranked before broken, despite broken having 0.99 confidence!
      expect(ranked[0].verified).toBe(true);
      expect(ranked[1].verified).toBe(true);
      expect(ranked[2].verified).toBe(false);

      // Between the two verified ones, the higher confidence (0.95 vs 0.85) ranks first
      expect(ranked[0].confidence).toBe(0.95);
      expect(ranked[1].confidence).toBe(0.85);
    });

    it('ranks smaller edit distance first when confidence and verification tie', () => {
      const original = 'int x = 5';
      const c1 = {
        description: 'Added semicolon',
        repairedCode: 'int x = 5;',
        confidence: 0.9,
      };
      const c2 = {
        description: 'Added lots of extra code',
        repairedCode: 'int x = 5; int y = 10;',
        confidence: 0.9,
      };

      const ranked = verifyAndRankCandidates([c2, c1], original);
      expect(ranked[0].repairedCode).toBe('int x = 5;');
      expect(ranked[0].editDistance).toBeLessThan(ranked[1].editDistance);
    });
  });

  describe('Classical bounded repair', () => {
    it('repairs a missing semicolon', () => {
      const result = classicalRepair('int run() { return 5 }');
      expect(result.some(({ repairedCode }) => parse(repairedCode).errors.length === 0)).toBe(true);
    });

    it('repairs a missing close parenthesis', () => {
      const result = classicalRepair('int run() { if (1 { return 1; } }');
      expect(result.some(({ repairedCode }) => repairedCode.includes(')') && parse(repairedCode).errors.length === 0)).toBe(true);
    });

    it('repairs a missing close brace', () => {
      const result = classicalRepair('int run() { return 5;');
      expect(result.some(({ repairedCode }) => parse(repairedCode).errors.length === 0)).toBe(true);
    });

    it('repairs an extra close parenthesis', () => {
      const result = classicalRepair('int run()) { return 5; }');
      expect(result.some(({ repairedCode }) => parse(repairedCode).errors.length === 0)).toBe(true);
    });

    it('keeps increment operators and inserts the missing semicolon', () => {
      const original = 'int run() { int i = 0; i++; }';
      const broken = original.replace('i++;', 'i++');
      const result = classicalRepair(broken);
      expect(result.some(({ repairedCode }) =>
        parse(repairedCode).errors.length === 0 &&
        lex(repairedCode).tokens.some((token) => token.lexeme === '++')
      )).toBe(true);
    });

    it('does not alter a valid increment statement', () => {
      const source = 'int run() { int i = 0; i++; return i; }';
      expect(classicalRepair(source)).toEqual([]);
    });
  });

  describe('Error context extraction', () => {
    it('produces structured error context with surrounding tokens', () => {
      const code = 'int val = 10\nint next = 20;';
      const tokens = lex(code);
      const parseResult = parse(code);

      const context = extractErrorContexts(tokens, parseResult.errors, code.split('\n'));
      expect(context).toContain('Line 1');
      expect(context).toContain('Expected');
    });
  });

  describe('Repair Stats Logging', () => {
    it('logs attempts and aggregates stats correctly', async () => {
      expect((await getRepairStats()).totalAttempts).toBe(0);

      await logRepairAttempt({
        source_length: 50,
        error_count: 2,
        candidate_count: 3,
        verified_count: 2,
        latency_ms: 250,
        model: 'AI gateway',
        is_verified_success: true,
      });

      await logRepairAttempt({
        source_length: 80,
        error_count: 1,
        candidate_count: 2,
        verified_count: 0,
        latency_ms: 150,
        model: 'AI gateway',
        is_verified_success: false,
      });

      const stats = await getRepairStats();
      expect(stats.totalAttempts).toBe(2);
      expect(stats.verifiedSuccessCount).toBe(1);
      expect(stats.verifiedRate).toBe(50);
      expect(stats.avgLatencyMs).toBe(200);
      expect(stats.avgCandidates).toBe(2.5);
      expect(stats.logs).toHaveLength(2);
    });
  });
});
