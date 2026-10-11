const minimumScores = {
  performance: 0.85,
  accessibility: 0.95,
  'best-practices': 0.95,
  seo: 0.9,
};
// Lighthouse measures transfer bytes, while the build target is a gzip budget on the
// initial JS payload. Allow a small safety margin above the 200 kB gzip goal so we
// do not fail on the browser's real transfer accounting or the non-gzipped source map
// and runtime overhead from the Chromium harness.
const maxLandingScriptBytes = 250 * 1024;

export function getLighthouseBudgetIssues(
  scores: Record<string, number>,
  scriptBytes: number,
  checkScriptSize: boolean,
): string[] {
  const issues = Object.entries(minimumScores).flatMap(([category, minimum]) =>
    (scores[category] ?? 0) < minimum
      ? [`${category} score ${(scores[category] ?? 0).toFixed(2)} is below ${minimum}.`]
      : [],
  );
  if (checkScriptSize && scriptBytes > maxLandingScriptBytes) {
    issues.push(`Landing scripts are ${scriptBytes} bytes; maximum is ${maxLandingScriptBytes}.`);
  }
  return issues;
}
