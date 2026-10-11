import { describe, expect, it } from 'vitest';
import { injectSingleTokenError } from './errorInjector';
import { parse } from './parser';

const VALID = `int helper(int value) {
  return value + 1;
}

int main() {
  int count = helper(3);
  if (count > 0) {
    return count;
  }
  return 0;
}`;

describe('seeded error injection', () => {
  it('is deterministic and retains ground truth', () => {
    const first = injectSingleTokenError(VALID, 'delete', 19);
    const second = injectSingleTokenError(VALID, 'delete', 19);
    expect(first).toEqual(second);
    expect(first.original).toBe(VALID);
    expect(first.firstErrorFound).toBe(true);
    expect(parse(first.mutated).errors.length).toBeGreaterThan(0);
  });

  it.each(['delete', 'insert', 'swap', 'replace', 'natural'] as const)(
    'produces parse-invalid %s mutations',
    (type) => {
      for (let seed = 0; seed < 30; seed++) {
        const injection = injectSingleTokenError(VALID, type, seed);
        expect(injection.type).toBe(type);
        expect(injection.firstErrorFound).toBe(true);
        expect(parse(injection.mutated).errors.length).toBeGreaterThan(0);
      }
    }
  );
});
