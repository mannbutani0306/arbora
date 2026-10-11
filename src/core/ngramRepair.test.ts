import { describe, expect, it } from 'vitest';
import { classicalRepair } from './classicalRepair';
import { trainNgram, ngramLogProbability, rankByNgram } from './ngramRepair';

describe('trigram repair ranking', () => {
  const examples = [
    ['int', 'main', '(', ')', '{', 'return', '0', ';', '}'],
    ['int', 'sum', '(', 'int', 'value', ')', '{', 'return', 'value', ';', '}'],
  ];

  it('trains a JSON-serializable add-k trigram model', () => {
    const model = trainNgram(examples);
    expect(model.order).toBe(3);
    expect(JSON.parse(JSON.stringify(model))).toEqual(model);
    expect(ngramLogProbability(model, examples[0])).toBeLessThan(0);
  });

  it('only reorders parser-verified classical candidates', () => {
    const model = trainNgram(examples);
    const candidates = classicalRepair('int main() { return 0 }');
    const ranked = rankByNgram(candidates, model);
    expect(ranked).toHaveLength(candidates.length);
    expect(ranked.every((candidate) => candidate.verified)).toBe(true);
    expect(ranked.map((candidate) => candidate.languageModelScore)).toEqual(
      [...ranked.map((candidate) => candidate.languageModelScore)].sort((a, b) => b - a)
    );
  });
});
