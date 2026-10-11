const baseUrl = process.env.SMOKE_BASE_URL?.trim().replace(/\/+$/, '');
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY?.trim();

if (!baseUrl || !supabaseUrl || !anonKey) {
  throw new Error('Set SMOKE_BASE_URL, SUPABASE_URL, and SUPABASE_ANON_KEY to run the deploy smoke test.');
}

async function requireOk(url: string, label: string): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}.`);
  return response;
}

await requireOk(baseUrl, 'Frontend landing page');
console.log('PASS landing page');

const gatewayBase = `${supabaseUrl}/functions/v1/ai-gateway`;
await requireOk(`${gatewayBase}/health`, 'AI gateway health');
console.log('PASS gateway health');

let repairResponse = await fetch(gatewayBase, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: anonKey,
  },
  body: JSON.stringify({
    task: 'repair_t5',
    payload: { code: 'int main() { return 0; }', num_beams: 1, num_return: 1 },
  }),
  signal: AbortSignal.timeout(60_000),
});

if (repairResponse.status === 503) {
  const failure: unknown = await repairResponse.json();
  if (
    failure &&
    typeof failure === 'object' &&
    'code' in failure &&
    failure.code === 'MODEL_COLD_START'
  ) {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    repairResponse = await fetch(gatewayBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
      },
      body: JSON.stringify({
        task: 'repair_t5',
        payload: { code: 'int main() { return 0; }', num_beams: 1, num_return: 1 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
  }
}

if (!repairResponse.ok) {
  throw new Error(`Gateway repair smoke test failed with HTTP ${repairResponse.status}.`);
}

const repair: unknown = await repairResponse.json();
if (
  !repair ||
  typeof repair !== 'object' ||
  !('candidates' in repair) ||
  !Array.isArray(repair.candidates)
) {
  throw new Error('Gateway repair smoke test returned an invalid response.');
}
console.log('PASS repair request');
