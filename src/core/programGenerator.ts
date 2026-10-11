/**
 * Retained handwritten MiniC examples and seeded grammar-based program generation.
 */

import { parse } from './parser';
import { lex } from './lexer';

export interface GeneratedProgram {
  id: string;
  name: string;
  code: string;
  category: 'Arithmetic' | 'Loops' | 'Conditionals' | 'Functions' | 'Arrays';
}

export const handwritten: Array<{
  id: string;
  name: string;
  category: GeneratedProgram['category'];
  code: string;
}> = [
  {
    id: 'gen_01',
    name: 'Factorial Calc',
    category: 'Functions',
    code: `int factorial(int n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}`,
  },
  {
    id: 'gen_02',
    name: 'Fibonacci Loop',
    category: 'Loops',
    code: `int fib(int n) {
  int a = 0;
  int b = 1;
  int i = 0;
  while (i < n) {
    int next = a + b;
    a = b;
    b = next;
    i++;
  }
  return a;
}`,
  },
  {
    id: 'gen_03',
    name: 'Euclidean GCD',
    category: 'Loops',
    code: `int gcd(int a, int b) {
  while (b != 0) {
    int t = b;
    b = a % b;
    a = t;
  }
  return a;
}`,
  },
  {
    id: 'gen_04',
    name: 'Linear Search',
    category: 'Arrays',
    code: `int find(int arr[], int n, int target) {
  for (int i = 0; i < n; i++) {
    if (arr[i] == target) {
      return i;
    }
  }
  return -1;
}`,
  },
  {
    id: 'gen_05',
    name: 'Prime Check',
    category: 'Conditionals',
    code: `bool isPrime(int n) {
  if (n <= 1) {
    return false;
  }
  int d = 2;
  while (d * d <= n) {
    if (n % d == 0) {
      return false;
    }
    d++;
  }
  return true;
}`,
  },
  {
    id: 'gen_06',
    name: 'Clamp Range',
    category: 'Conditionals',
    code: `int clamp(int val, int low, int high) {
  if (val < low) {
    return low;
  } else if (val > high) {
    return high;
  }
  return val;
}`,
  },
  {
    id: 'gen_07',
    name: 'Power Calc',
    category: 'Loops',
    code: `int power(int base, int exp) {
  int res = 1;
  while (exp > 0) {
    if (exp % 2 == 1) {
      res = res * base;
    }
    base = base * base;
    exp = exp / 2;
  }
  return res;
}`,
  },
  {
    id: 'gen_08',
    name: 'Array Sum',
    category: 'Arrays',
    code: `int sumArray(int arr[], int size) {
  int total = 0;
  for (int idx = 0; idx < size; idx++) {
    total += arr[idx];
  }
  return total;
}`,
  },
  {
    id: 'gen_09',
    name: 'Max Triplet',
    category: 'Conditionals',
    code: `int max3(int a, int b, int c) {
  int m = a;
  if (b > m) {
    m = b;
  }
  if (c > m) {
    m = c;
  }
  return m;
}`,
  },
  {
    id: 'gen_10',
    name: 'Abs Diff',
    category: 'Arithmetic',
    code: `float absDiff(float x, float y) {
  float d = x - y;
  if (d < 0.0) {
    return -d;
  }
  return d;
}`,
  },
  {
    id: 'gen_11',
    name: 'Count Evens',
    category: 'Loops',
    code: `int countEvens(int limit) {
  int count = 0;
  for (int k = 1; k <= limit; k++) {
    if (k % 2 == 0) {
      count++;
    }
  }
  return count;
}`,
  },
  {
    id: 'gen_12',
    name: 'Collatz Step',
    category: 'Conditionals',
    code: `int collatz(int n) {
  int steps = 0;
  while (n > 1) {
    if (n % 2 == 0) {
      n = n / 2;
    } else {
      n = 3 * n + 1;
    }
    steps++;
  }
  return steps;
}`,
  },
  {
    id: 'gen_13',
    name: 'Celsius Convert',
    category: 'Arithmetic',
    code: `float toFahrenheit(float celsius) {
  float f = (celsius * 9.0) / 5.0 + 32.0;
  return f;
}`,
  },
  {
    id: 'gen_14',
    name: 'Signum Check',
    category: 'Conditionals',
    code: `int signum(int x) {
  if (x > 0) {
    return 1;
  }
  if (x < 0) {
    return -1;
  }
  return 0;
}`,
  },
  {
    id: 'gen_15',
    name: 'Polynomial Eval',
    category: 'Arithmetic',
    code: `float poly(float x, float a, float b, float c) {
  float term2 = a * x * x;
  float term1 = b * x;
  return term2 + term1 + c;
}`,
  },
  {
    id: 'gen_16',
    name: 'Sum Odd Range',
    category: 'Loops',
    code: `int sumOdds(int start, int end) {
  int sum = 0;
  int cur = start;
  while (cur <= end) {
    if (cur % 2 != 0) {
      sum += cur;
    }
    cur++;
  }
  return sum;
}`,
  },
  {
    id: 'gen_17',
    name: 'Leap Year',
    category: 'Conditionals',
    code: `bool isLeapYear(int year) {
  if (year % 400 == 0) {
    return true;
  }
  if (year % 100 == 0) {
    return false;
  }
  return year % 4 == 0;
}`,
  },
  {
    id: 'gen_18',
    name: 'Do While Counter',
    category: 'Loops',
    code: `int countdown(int start) {
  int c = start;
  do {
    c--;
  } while (c > 0);
  return c;
}`,
  },
  {
    id: 'gen_19',
    name: 'Logical And Or',
    category: 'Conditionals',
    code: `bool checkBounds(int x, int y, int w, int h) {
  bool inX = x >= 0 && x < w;
  bool inY = y >= 0 && y < h;
  return inX && inY;
}`,
  },
  {
    id: 'gen_20',
    name: 'Array Reverse Pass',
    category: 'Arrays',
    code: `void reverseArray(int arr[], int len) {
  int left = 0;
  int right = len - 1;
  while (left < right) {
    int tmp = arr[left];
    arr[left] = arr[right];
    arr[right] = tmp;
    left++;
    right--;
  }
}`,
  },
];

/**
 * Returns the 20 retained handwritten examples.
 */
export function generateBenchmarkPrograms(): GeneratedProgram[] {
  return handwritten.map((tmpl) => {
    // Assert validity
    const res = parse(tmpl.code);
    if (!res.success || res.errors.length > 0) {
      console.warn(`Template ${tmpl.name} has syntax errors:`, res.errors);
    }
    return tmpl;
  });
}

export type ProgramSizeClass = 'small' | 'medium' | 'large';

export interface ProgramGenerationOptions {
  sizeClass?: ProgramSizeClass;
  maxDepth?: number;
  maxLengthTokens?: number;
}

export interface ProbabilisticProgram extends GeneratedProgram {
  seed: number;
  sizeClass: ProgramSizeClass;
  tokenCount: number;
}

const TYPE_NAMES = ['int', 'float', 'bool', 'char', 'string'] as const;
const IDENTIFIERS = [
  'count', 'total', 'index', 'limit', 'score', 'value', 'amount', 'result',
  'width', 'height', 'active', 'letter', 'label', 'items', 'cursor', 'sum',
] as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

function typeLiteral(type: (typeof TYPE_NAMES)[number], seed: number): string {
  switch (type) {
    case 'int': return String(seed % 97);
    case 'float': return `${(seed % 19) + 1}.0`;
    case 'bool': return seed % 2 === 0 ? 'true' : 'false';
    case 'char': return `'${String.fromCharCode(97 + seed % 26)}'`;
    case 'string': return `"item_${seed % 1000}"`;
  }
}

function normalizedTokenHash(code: string): string {
  const tokens = lex(code).tokens
    .filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT')
    .map((token) => `${token.type}:${token.lexeme}`);
  const input = tokens.join('\u0000');
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function countTokens(code: string): number {
  return lex(code).tokens.filter((token) => token.type !== 'EOF' && token.type !== 'COMMENT').length;
}

function renderGeneratedProgram(seed: number, random: () => number, options: Required<ProgramGenerationOptions>): string {
  const indent = random() < 0.5 ? '  ' : '    ';
  const helperName = `compute_${seed >>> 0}`;
  const paramName = pick(random, IDENTIFIERS);
  const valueNames = [...IDENTIFIERS];
  for (let index = valueNames.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [valueNames[index], valueNames[swapIndex]] = [valueNames[swapIndex], valueNames[index]];
  }
  const lines: string[] = [];
  const targetStatements =
    options.sizeClass === 'small' ? 1 + Math.floor(random() * 4) :
    options.sizeClass === 'medium' ? 5 + Math.floor(random() * 13) :
    16 + Math.floor(random() * 30);
  const maxDepth = Math.max(1, Math.min(5, Math.floor(options.maxDepth)));
  const helperOperator = pick(random, ['+', '-', '*', '%'] as const);
  lines.push(`int ${helperName}(int ${paramName}) {`);
  lines.push(`${indent}return ${paramName} ${helperOperator} ${1 + (seed % 7)};`);
  lines.push('}', '');
  const functionName = `program_${seed >>> 0}`;
  const indentDepth = indent.repeat(1);
  lines.push(`int ${functionName}(int input) {`);

  const declared = new Map<string, string>([['input', 'int']]);
  const namesUsed = new Set<string>(['input']);
  let nameCursor = 0;
  const freshName = (preferred?: string) => {
    const base = preferred ?? valueNames[nameCursor++ % valueNames.length];
    let candidate = `${base}_${seed >>> 0}`;
    let suffix = 0;
    while (namesUsed.has(candidate)) candidate = `${base}_${seed >>> 0}_${++suffix}`;
    namesUsed.add(candidate);
    return candidate;
  };
  const intNames = () => [...declared.entries()].filter(([, type]) => type === 'int').map(([name]) => name);
  const nextInt = () => pick(random, intNames());
  const declare = (type: (typeof TYPE_NAMES)[number]) => {
    const name = freshName(type === 'int' ? undefined : type);
    declared.set(name, type);
    let initializer = typeLiteral(type, seed + namesUsed.size * 13);
    if (type === 'int' && random() < 0.75) {
      initializer = random() < 0.3 ? `${helperName}(${nextInt()})` : `${nextInt()} ${pick(random, ['+', '-', '*'] as const)} ${seed % 11}`;
    }
    lines.push(`${indentDepth}${type} ${name} = ${initializer};`);
  };

  const initialDeclarations = options.sizeClass === 'small' ? 1 : 2 + Math.floor(random() * 3);
  for (let index = 0; index < initialDeclarations; index++) {
    declare(index === 0 ? 'int' : pick(random, TYPE_NAMES));
  }

  const arrayName = freshName('items');
  declared.set(arrayName, 'int[]');
  const arraySize = 2 + Math.floor(random() * 5);
  lines.push(`${indentDepth}int ${arrayName}[${arraySize}];`);
  lines.push(`${indentDepth}${arrayName}[0] = ${nextInt()};`);

  for (let index = 0; index < targetStatements; index++) {
    const choice = random();
    const value = nextInt();
    if (choice < 0.38) {
      lines.push(`${indentDepth}${value} = ${value} ${pick(random, ['+', '-', '*', '%'] as const)} ${1 + Math.floor(random() * 9)};`);
    } else if (choice < 0.55 && maxDepth >= 2) {
      const conditionValue = nextInt();
      lines.push(`${indentDepth}if (${conditionValue} ${pick(random, ['<', '>', '==', '!='] as const)} ${Math.floor(random() * 10)}) {`);
      lines.push(`${indentDepth}${indent}${value} = ${value} + 1;`);
      if (random() < 0.4) {
        lines.push(`${indentDepth}} else {`);
        lines.push(`${indentDepth}${indent}${value} = ${value} - 1;`);
      }
      lines.push(`${indentDepth}}`);
    } else if (choice < 0.7 && maxDepth >= 2) {
      const loopIndex = freshName('index');
      lines.push(`${indentDepth}for (int ${loopIndex} = 0; ${loopIndex} < 2; ${loopIndex}++) {`);
      lines.push(`${indentDepth}${indent}${value} = ${value} + ${loopIndex};`);
      if (random() < 0.25) lines.push(`${indentDepth}${indent}continue;`);
      lines.push(`${indentDepth}}`);
    } else if (choice < 0.82 && maxDepth >= 2) {
      const loopValue = nextInt();
      lines.push(`${indentDepth}while (${loopValue} < 20) {`);
      lines.push(`${indentDepth}${indent}${loopValue}++;`);
      if (random() < 0.2) lines.push(`${indentDepth}${indent}break;`);
      lines.push(`${indentDepth}}`);
    } else if (choice < 0.9 && maxDepth >= 2) {
      const loopValue = nextInt();
      lines.push(`${indentDepth}do {`);
      lines.push(`${indentDepth}${indent}${loopValue}--;`);
      lines.push(`${indentDepth}} while (${loopValue} > 0);`);
    } else {
      const type = pick(random, TYPE_NAMES);
      declare(type);
    }
  }

  const returnValue = nextInt();
  lines.push(`${indentDepth}return ${returnValue} + ${arrayName}[0];`);
  lines.push('}');
  const code = lines.join('\n');
  return code;
}

const SIZE_LIMITS: Record<ProgramSizeClass, number> = {
  small: 80,
  medium: 200,
  large: 400,
};

/**
 * Generates a deterministic, probabilistic, scope-aware MiniC program for a seed.
 * Every result is parser-checked and obeys its configured token upper bound.
 */
export function generateProgram(
  seed: number,
  options: ProgramGenerationOptions = {}
): ProbabilisticProgram {
  const sizeClass = options.sizeClass ?? 'medium';
  const maxLengthTokens = Math.min(
    SIZE_LIMITS[sizeClass],
    Math.max(1, Math.floor(options.maxLengthTokens ?? SIZE_LIMITS[sizeClass]))
  );
  const normalizedOptions: Required<ProgramGenerationOptions> = {
    sizeClass,
    maxDepth: options.maxDepth ?? 3,
    maxLengthTokens,
  };

  for (let attempt = 0; attempt < 250; attempt++) {
    const random = mulberry32((seed + Math.imul(attempt, 0x9e3779b9)) >>> 0);
    const code = renderGeneratedProgram(seed, random, normalizedOptions);
    if (countTokens(code) > maxLengthTokens) continue;
    const parsed = parse(code);
    if (parsed.errors.length > 0) continue;
    const size = countTokens(code);
    return {
      id: `generated_${seed >>> 0}`,
      name: `Generated ${seed >>> 0}`,
      category: 'Functions',
      code,
      seed: seed >>> 0,
      sizeClass,
      tokenCount: size,
    };
  }
  throw new Error(`Unable to generate a valid ${sizeClass} MiniC program for seed ${seed}.`);
}

export function generateUniquePrograms(
  count: number,
  seed: number,
  options: ProgramGenerationOptions = {}
): ProbabilisticProgram[] {
  const programs: ProbabilisticProgram[] = [];
  const hashes = new Set<string>();
  let attempt = 0;
  while (programs.length < count) {
    const generated = generateProgram((seed + attempt) >>> 0, options);
    attempt++;
    const hash = normalizedTokenHash(generated.code);
    if (hashes.has(hash)) continue;
    hashes.add(hash);
    programs.push({ ...generated, id: `generated_${generated.seed}_${programs.length}` });
  }
  return programs;
}
