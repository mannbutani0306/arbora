import { assertEquals } from 'jsr:@std/assert@1';
import { getAllowedOrigins, isOriginAllowed } from './cors.ts';
import {
  ExplanationResponseSchema,
  GatewayRequestSchema,
  getRateLimitWindow,
} from './schemas.ts';

Deno.test('rate limit windows reset hourly', () => {
  const result = getRateLimitWindow(3_600_500);
  assertEquals(result.windowStartMs, 3_600_000);
  assertEquals(result.retryAfterSeconds, 3_600);
});

Deno.test('gateway schemas validate known tasks and explanation output', () => {
  assertEquals(GatewayRequestSchema.safeParse({
    task: 'neural_ast',
    payload: { sourceCode: 'int main() {}' },
  }).success, true);
  assertEquals(GatewayRequestSchema.safeParse({
    task: 'unknown',
    payload: {},
  }).success, false);
  assertEquals(GatewayRequestSchema.safeParse({
    task: 'repair_t5',
    payload: { code: 'int main() {}', num_beams: 8, num_return: 8 },
  }).success, true);
  assertEquals(GatewayRequestSchema.safeParse({
    task: 'ast_t5',
    payload: { code: 'int main() {}' },
  }).success, true);
  assertEquals(GatewayRequestSchema.safeParse({
    task: 'neural_ast',
    payload: { sourceCode: 'x'.repeat(20_001) },
  }).success, false);
  assertEquals(ExplanationResponseSchema.safeParse({
    explanation: 'A function declaration.',
    rule: 'FunctionDecl -> ...',
    analogy: 'A recipe.',
  }).success, true);
});

Deno.test('CORS allows configured origins and localhost only', () => {
  const origins = getAllowedOrigins('https://arbora.example');
  assertEquals(isOriginAllowed('https://arbora.example', origins), true);
  assertEquals(isOriginAllowed('http://localhost:3000', origins), true);
  assertEquals(isOriginAllowed('https://attacker.example', origins), false);
  assertEquals(isOriginAllowed(null, origins), false);
});
