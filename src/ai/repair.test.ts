import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateEditDistance,
  repairCode,
  verifyAndRankCandidates,
  logRepairAttempt,
  getRepairStats,
  clearRepairStats,
  extractErrorContexts,
} from './repair';
import { lex } from '../core/lexer';
import { parse } from '../core/parser';
import { classicalRepair } from '../core/classicalRepair';

const gateway = vi.hoisted(() => ({
  callGateway: vi.fn(),
  checkAiAvailability: vi.fn(),
  isAiAvailable: vi.fn(),
}));

vi.mock('./gatewayClient', () => ({
  AppError: class AppError extends Error {
    constructor(public code: string, message: string) { super(message); }
  },
  callGateway: gateway.callGateway,
  checkAiAvailability: gateway.checkAiAvailability,
  isAiAvailable: gateway.isAiAvailable,
}));

import { callGateway, checkAiAvailability, isAiAvailable } from './gatewayClient';

describe('AI Repair Engine', () => {
  beforeEach(async () => {
    await clearRepairStats();
    vi.clearAllMocks();
    vi.mocked(isAiAvailable).mockReturnValue(false);
    vi.mocked(checkAiAvailability).mockResolvedValue(false);
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

    it('drops empty proposals, filters malformed edits, and clamps confidence', () => {
      const ranked = verifyAndRankCandidates(
        [
          { repairedCode: '  ' },
          {
            repairedCode: 'int x = 1;',
            confidence: 2,
            edits: [
              { operation: 'mystery', text: 'x', line: 1, column: 1 },
              { operation: 'insert', text: ';', line: 1, column: 10 },
              { operation: 'insert', text: ';', column: 10 },
            ],
          },
        ],
        'int x = 1',
      );

      expect(ranked).toHaveLength(1);
      expect(ranked[0].confidence).toBe(1);
      expect(ranked[0].edits).toEqual([
        { operation: 'insert', text: 'x', line: 1, column: 1 },
        { operation: 'insert', text: ';', line: 1, column: 10 },
      ]);
    });
  });

  describe('Classical bounded repair', () => {
    it('repairs a missing semicolon', () => {
      const result = classicalRepair('int run() { return 5 }');
      expect(result.some(({ repairedCode }) => parse(repairedCode).errors.length === 0)).toBe(true);
    });

    it('explicitly reports when a selected model engine falls back', async () => {
      const sourceCode = 'int main() { return 0 }';
      const parsed = parse(sourceCode);
      const response = await repairCode({
        sourceCode,
        tokens: parsed.tokens,
        errors: parsed.errors,
        engine: 'arbora-t5',
      });
      expect(response.fellBackToClassical).toBe(true);
      expect(response.message).toMatch(/unavailable|waking up/i);
      expect(response.candidates.every((candidate) =>
        candidate.verified === (parse(candidate.repairedCode).errors.length === 0)
      )).toBe(true);
    });

    it('returns no candidates for already-valid input without contacting the model', async () => {
      const response = await repairCode({
        sourceCode: 'int main() { return 0; }',
        tokens: lex('int main() { return 0; }').tokens,
        errors: [],
      });

      expect(response.candidates).toEqual([]);
      expect(response.message).toBeUndefined();
      expect(callGateway).not.toHaveBeenCalled();
    });

    it('runs deterministic classical and n-gram engines directly', async () => {
      const sourceCode = 'int run() { return 5 }';
      const parsed = parse(sourceCode);
      const classical = await repairCode({
        sourceCode,
        tokens: parsed.tokens,
        errors: parsed.errors,
        engine: 'classical',
      });
      const ngram = await repairCode({
        sourceCode,
        tokens: parsed.tokens,
        errors: parsed.errors,
        engine: 'ngram',
      });

      expect(classical.model).toBe('Classical');
      expect(classical.fellBackToClassical).toBe(false);
      expect(classical.candidates.some(({ verified }) => verified)).toBe(true);
      expect(ngram.model).toBe('N-gram');
      expect(ngram.candidates.every(({ engineId }) => engineId === 'ngram')).toBe(true);
      expect(callGateway).not.toHaveBeenCalled();
    });

    it('accepts parser-verified Gemini proposals and retries unverified proposals once', async () => {
      vi.mocked(isAiAvailable).mockReturnValue(true);
      vi.mocked(callGateway)
        .mockResolvedValueOnce({
          candidates: [{ repairedCode: 'int main() { return 0; }', confidence: 0.95 }],
        })
        .mockResolvedValueOnce({
          candidates: [{ repairedCode: 'int main() { return }', confidence: 0.9 }],
        })
        .mockResolvedValueOnce({
          candidates: [{ repairedCode: 'int main() { return 0; }', confidence: 0.8 }],
        });
      const sourceCode = 'int main() { return 0 }';
      const parsed = parse(sourceCode);

      const valid = await repairCode({
        sourceCode,
        tokens: parsed.tokens,
        errors: parsed.errors,
      });
      const retried = await repairCode({
        sourceCode: `${sourceCode} `,
        tokens: parsed.tokens,
        errors: parsed.errors,
      });

      expect(valid.verifiedCandidate?.verified).toBe(true);
      expect(valid.fellBackToClassical).toBe(false);
      expect(retried.verifiedCandidate?.verified).toBe(true);
      expect(callGateway).toHaveBeenCalledTimes(3);
      expect(callGateway).toHaveBeenLastCalledWith(
        'repair',
        expect.objectContaining({
          retryCandidate: 'int main() { return }',
          retryErrors: expect.stringContaining('Expected'),
        }),
        { signal: undefined },
      );
    });

    it('runs the ensemble and reports unavailable model engines', async () => {
      const sourceCode = 'int run() { return 5 }';
      const parsed = parse(sourceCode);
      const response = await repairCode({
        sourceCode,
        tokens: parsed.tokens,
        errors: parsed.errors,
        engine: 'ensemble',
      });

      expect(response.model).toBe('Ensemble');
      expect(response.candidates.length).toBeGreaterThan(0);
      expect(response.candidates.every(({ agreedBy }) => (agreedBy?.length ?? 0) > 0)).toBe(true);
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
