import {
  calculateTreeEditDistance,
  calculateTupleMetrics,
  checkExactStructuralMatch,
  type StructuralNode,
} from '../src/core/compare.ts';
import { astToBracketedString } from '../src/core/astUtils.ts';
import { parse } from '../src/core/parser.ts';
import { parseArgs, readJsonl, requiredArg, writeJsonl, writeText } from './_shared/cli.ts';

const NODE_TYPES = new Set([
  'Program', 'FunctionDecl', 'Param', 'VarDecl', 'Block', 'IfStmt', 'WhileStmt',
  'DoWhileStmt', 'ForStmt', 'ReturnStmt', 'BreakStmt', 'ContinueStmt', 'ExprStmt',
  'BinaryExpr', 'UnaryExpr', 'AssignExpr', 'CallExpr', 'IndexExpr', 'Identifier',
  'Literal', 'ArrayLiteral', 'ErrorNode',
]);

function parseBracketedTree(input: string): { tree: StructuralNode; canonical: string } {
  let offset = 0;
  const skipWhitespace = () => {
    while (/\s/.test(input[offset] ?? '')) offset++;
  };
  const readAtom = (): string => {
    skipWhitespace();
    if (input[offset] === '"') {
      const start = offset++;
      let escaped = false;
      while (offset < input.length) {
        const char = input[offset++];
        if (char === '"' && !escaped) break;
        escaped = char === '\\' && !escaped;
        if (char !== '\\') escaped = false;
      }
      if (input[offset - 1] !== '"') throw new Error('Unterminated quoted atom.');
      return input.slice(start, offset);
    }
    const start = offset;
    while (offset < input.length && !/[\s()]/.test(input[offset])) offset++;
    if (start === offset) throw new Error('Expected a node type or scalar.');
    return input.slice(start, offset);
  };
  const parseNode = (): { tree: StructuralNode; canonical: string } => {
    skipWhitespace();
    if (input[offset++] !== '(') throw new Error('Expected an opening parenthesis.');
    const type = readAtom();
    if (!NODE_TYPES.has(type)) throw new Error(`Unknown AST node type '${type}'.`);
    const children: StructuralNode[] = [];
    const parts: string[] = [];
    while (true) {
      skipWhitespace();
      if (offset >= input.length) throw new Error('Unclosed AST node.');
      if (input[offset] === ')') {
        offset++;
        return {
          tree: { type, children },
          canonical: `(${type}${parts.length ? ` ${parts.join(' ')}` : ''})`,
        };
      }
      if (input[offset] === '(') {
        const child = parseNode();
        children.push(child.tree);
        parts.push(child.canonical);
      } else {
        parts.push(readAtom());
      }
    }
  };
  const parsed = parseNode();
  skipWhitespace();
  if (offset !== input.length || parsed.tree.type !== 'Program') throw new Error('Expected one complete Program tree.');
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = requiredArg(args, 'in');
  const output = args.get('out') ?? 'results/ast-scores.jsonl';
  const results = [];
  for await (const record of readJsonl(input)) {
    if (typeof record.code !== 'string' || typeof record.predicted_ast_bracketed !== 'string') {
      throw new Error(`Record ${String(record.id)} needs code and predicted_ast_bracketed.`);
    }
    const classical = parse(record.code);
    let predicted: { tree: StructuralNode; canonical: string } | null = null;
    let schemaValid = false;
    try {
      predicted = parseBracketedTree(record.predicted_ast_bracketed);
      schemaValid = true;
    } catch {
      schemaValid = false;
    }
    const referenceValid = classical.errors.length === 0;
    const structuralMatch = referenceValid && schemaValid && checkExactStructuralMatch(classical.ast, predicted?.tree);
    const exactMatch = referenceValid && schemaValid && predicted?.canonical === astToBracketedString(classical.ast);
    const tupleMetrics =
      referenceValid && schemaValid
        ? calculateTupleMetrics(classical.ast, predicted?.tree)
        : { precision: 0, recall: 0, f1: 0 };
    const ted =
      referenceValid && schemaValid ? calculateTreeEditDistance(classical.ast, predicted?.tree) : null;
    results.push({
      id: record.id,
      validity: schemaValid,
      reference_valid: referenceValid,
      exact_match: exactMatch,
      structural_match: structuralMatch,
      node_f1: tupleMetrics.f1,
      zhang_shasha_ted: ted,
    });
  }
  await writeJsonl(output, results);
  const count = results.length;
  const tedValues = results
    .map((item) => item.zhang_shasha_ted)
    .filter((value): value is number => value !== null);
  const summary = {
    count,
    validity_rate: count ? results.filter((item) => item.validity).length / count : 0,
    exact_match_rate: count ? results.filter((item) => item.exact_match).length / count : 0,
    mean_node_f1: count ? results.reduce((sum, item) => sum + item.node_f1, 0) / count : 0,
    mean_zhang_shasha_ted: tedValues.length
      ? tedValues.reduce((sum, value) => sum + value, 0) / tedValues.length
      : null,
  };
  await writeText(output.replace(/\.jsonl$/i, '.summary.json'), JSON.stringify(summary, null, 2));
}
await main();
