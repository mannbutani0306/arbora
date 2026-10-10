import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeExplanationCacheKey,
  serializeSubtree,
  getCachedExplanation,
  storeCachedExplanation,
  getOfflineFallbackExplanation,
  clearExplanationCache,
  streamExplainNode,
  extractNodeSnippet,
} from './explain';
import { ASTNode } from '../types/ast';

vi.mock('./gatewayClient', () => ({
  callGateway: vi.fn(),
  isAiAvailable: () => false,
}));

describe('AI Explain Engine & Caching', () => {
  beforeEach(() => {
    clearExplanationCache();
  });

  const mockNode: ASTNode = {
    id: 'fn_1',
    type: 'FunctionDecl',
    name: 'solve',
    returnType: 'int',
    span: { startLine: 1, startCol: 1, endLine: 3, endCol: 2 },
    children: [],
  } as any;

  describe('Cache Key Computation', () => {
    it('produces deterministic hash for given node and level', () => {
      const k1 = computeExplanationCacheKey(mockNode, 'Beginner');
      const k2 = computeExplanationCacheKey(mockNode, 'Beginner');
      const k3 = computeExplanationCacheKey(mockNode, 'Expert');

      expect(k1).toBe(k2);
      expect(k1).not.toBe(k3);
      expect(k1.startsWith('exp_')).toBe(true);
    });

    it('computes cache key for whole_program construct', () => {
      const key = computeExplanationCacheKey('whole_program', 'Intermediate', 'int main() { return 0; }');
      expect(typeof key).toBe('string');
      expect(key.startsWith('exp_')).toBe(true);
    });

    it('serializes subtree structure with properties', () => {
      const sig = serializeSubtree(mockNode);
      expect(sig).toContain('FunctionDecl');
      expect(sig).toContain('n:solve');
      expect(sig).toContain('ret:int');
    });
  });

  describe('In-Memory Caching', () => {
    it('stores and retrieves cached explanation', async () => {
      const key = 'test_cache_key';
      const content = {
        explanation: 'Test explanation sentence.',
        rule: 'FunctionDecl -> rule',
        analogy: 'Test analogy.',
      };

      expect(await getCachedExplanation(key, 'Beginner')).toBeNull();

      await storeCachedExplanation(key, 'Beginner', content);

      const retrieved = await getCachedExplanation(key, 'Beginner');
      expect(retrieved).toBeDefined();
      expect(retrieved?.explanation).toBe('Test explanation sentence.');
      expect(retrieved?.cached).toBe(true);
    });
  });

  describe('Deterministic Offline Fallback', () => {
    it('provides valid explanation structure for standard AST nodes without network', () => {
      const expl = getOfflineFallbackExplanation(mockNode, 'Beginner');
      expect(expl.explanation).toBeDefined();
      expect(expl.rule).toContain('FunctionDecl');
      expect(expl.analogy).toBeDefined();
    });

    it('provides fallback for whole program', () => {
      const expl = getOfflineFallbackExplanation('whole_program', 'Expert');
      expect(expl.explanation).toContain('compilation unit');
      expect(expl.rule).toBe('Program -> TopLevelItem*');
    });
  });

  describe('Snippet Extraction', () => {
    it('extracts line slice accurately based on node span', () => {
      const code = 'int main() {\n  return 42;\n}';
      const node: ASTNode = {
        id: 'ret_1',
        type: 'ReturnStmt',
        span: { startLine: 2, startCol: 3, endLine: 2, endCol: 13 },
        children: [],
      } as any;

      const snippet = extractNodeSnippet(node, code);
      expect(snippet).toBe('return 42;');
    });
  });

  describe('Stream Explain Node in Offline Mode', () => {
    it('returns offline explanation and invokes onChunk when API key is unset', async () => {
      let streamed = '';
      const res = await streamExplainNode({
        node: mockNode,
        fullCode: 'int solve() { return 1; }',
        level: 'Beginner',
        onChunk: (text) => {
          streamed = text;
        },
      });

      expect(res.explanation).toBeDefined();
      expect(streamed.length).toBeGreaterThan(0);
      expect(res.rule).toContain('FunctionDecl');
    });
  });
});
