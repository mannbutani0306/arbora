import { describe, expect, it } from 'vitest';
import { findDataLeakage } from './dataLeak';

describe('dataset leakage checks', () => {
  it('rejects overlapping program ids and normalized code across splits', () => {
    const problems = findDataLeakage({
      train: [{ id: 'p1', code: 'int main(){return 0;}' }],
      validation: [{ id: 'p1_corrupt_0', original: 'int main() { return 0; }' }],
      test: [{ id: 'p3', code: 'int main(){return 1;}' }],
    });
    expect(problems).toHaveLength(2);
  });

  it('rejects corrupted test code that is an exact training program', () => {
    expect(
      findDataLeakage({
        train: [{ id: 'train-1', code: 'int main() { return 0; }' }],
        validation: [
          { id: 'val-1', original: 'int main(){return 2;}', corrupted: 'int main(){return 0;}' },
        ],
        test: [],
      }),
    ).toContain('Corrupted validation example val-1 exactly matches training code.');
  });

  it('accepts disjoint source and id sets', () => {
    expect(
      findDataLeakage({
        train: [{ id: 'train-1', code: 'int main() { return 0; }' }],
        validation: [{ id: 'validation-1', original: 'int main() { return 1; }' }],
        test: [{ id: 'test-1', code: 'int main() { return 2; }' }],
      }),
    ).toEqual([]);
  });
});
