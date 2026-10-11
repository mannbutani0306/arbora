# Arbora viva and interview preparation

Answers describe this repository, not compiler or ML systems in general unless stated. The ten **Gotcha** questions are deliberately adversarial; answer directly and state limitations.

## Compiler theory (1–12)

1. **What does the lexer do?**
   It scans source characters into typed tokens with source positions. Arbora's lexer is hand-written in `src/core/lexer.ts`; it is not generated from a regular expression package or formal DFA table.

2. **Is the lexer implemented as a DFA?**
   Not as an explicit DFA data structure. It has deterministic scanner logic that advances through source and recognizes token patterns. For a course report, I would draw the equivalent states for identifiers, numbers, strings, comments, and punctuation rather than claim the source contains a DFA table.

3. **What is a token?**
   A token is a lexical unit such as an identifier, keyword, operator, literal, or delimiter, together with source-position information. Tokens abstract away irrelevant character-by-character details for parsing.

4. **What does FIRST(A) mean?**
   FIRST(A) is the set of terminals that may begin strings derivable from grammar symbol or nonterminal A; epsilon is included when A can derive the empty string.

5. **What does FOLLOW(A) mean?**
   FOLLOW(A) is the set of terminals that can appear immediately to the right of nonterminal A in some sentential form. The end marker belongs to FOLLOW of the start symbol.

6. **How do FIRST and FOLLOW help test LL(1)?**
   For alternatives of a nonterminal, FIRST sets must be disjoint. If an alternative is nullable, its selection set also uses FOLLOW of the nonterminal. Overlap creates a predictive-table conflict.

7. **Is Arbora's full grammar LL(1)?**
   No. The grammar analyzer reports conflicts for shared declaration prefixes, array declaration tails, broad statement alternatives, and optional `else`. The executable parser resolves relevant choices with lookahead and recursive-descent control.

8. **What is the difference between LL(1) and LR parsing?**
   LL(1) scans left-to-right and constructs a leftmost derivation using one token of lookahead; LR scans left-to-right and constructs a rightmost derivation in reverse using shift/reduce states. LR accepts a broader deterministic grammar class but usually requires generated tables.

9. **Why remove left recursion in a top-down grammar?**
   A direct production such as `Expr -> Expr + Term` causes a naive recursive-descent function to call itself without consuming input. Grammar transformation or a precedence parser is needed to ensure progress.

10. **What is Pratt parsing?**
    Pratt parsing associates prefix/infix/postfix parselets with binding powers. It compactly handles operator precedence and associativity without one recursive-descent function per precedence level.

11. **How does Arbora handle expression precedence?**
    Its parser uses Pratt-style expression parsing. The AST then expresses operand nesting, so comparisons and visualizations can inspect structure rather than rely on source formatting.

12. **AST versus parse tree?**
    A parse tree retains grammar-production detail; an AST omits syntactic scaffolding and keeps constructs useful for later analysis. Arbora displays its typed AST, not every derivation step as parse-tree nodes.

## Machine learning and evaluation (13–24)

13. **Why configure CodeT5-small?**
    It is a code-oriented encoder-decoder model suitable for text-to-text tasks and small enough to target constrained GPU experiments. The choice is an experiment design decision, not a demonstrated winning model; this repo has no completed neural metrics.

14. **How is repair formulated for seq2seq?**
    The input is a task-prefixed corrupted MiniC source; the target is the original source. The model generates a sequence rather than editing an AST directly.

15. **Why use beam search?**
    Beam search retains several high-scoring partial sequences at each decoding step, producing multiple candidate repairs for downstream verification. It does not guarantee correctness.

16. **What does top-k exact mean?**
    A test case is a success if at least one of the first k candidates matches its ground-truth target under the evaluator's defined normalization. The denominator is test cases, not the total number of candidates.

17. **Why is validity not correctness?**
    A candidate may parse perfectly and still make the wrong repair or change intended behavior. Validity asks whether syntax is accepted; correctness compares to known ground truth or requires stronger semantic evidence.

18. **How does Arbora prevent data leakage?**
    Dataset splitting assigns whole program IDs to a single split using a seeded hash rule. A data-leak check also detects cross-split normalized-source duplicates and test-corruption overlap.

19. **What is the point of a bootstrap confidence interval?**
    Resampling test observations estimates uncertainty in a metric without relying on a simple parametric normal approximation. It does not fix a biased or unrepresentative dataset.

20. **Why are the reported intervals not enough?**
    The quick interval report has only 30 corruption cases from 26 source programs. It is noisy and its examples are not necessarily independent; broader claims need larger and more representative evaluation.

21. **What does B0/B1/B2 denote here?**
    B0 returns no repairs, B1 performs bounded classical candidate enumeration, and B2 reranks B1 candidates with a trigram model. B2 cannot invent a candidate and uses the same test cases.

22. **What is the measured baseline result?**
    The checked-in 505-case artifact records B1 top-1 exact 154/505 and B2 187/505; both have 214/505 top-3 exact. These values describe that synthetic test artifact only, not human-written C or neural models.

23. **Why synthetic data? What is the risk?**
    It is controllable, reproducible, and allows known error types and ground truth. It can encode generator artifacts and parser assumptions, making evaluation easier than real programming mistakes.

24. **Are neural model results available?**
    No completed training/evaluation result is present in the committed artifacts. Model configurations and pipelines are not measured model performance.

## Systems and security (25–38)

25. **What does the Edge Function gateway do?**
    It is the server-side boundary for remote AI tasks: authentication, schema validation, rate limiting, provider forwarding, and request timeout handling.

26. **Why not call Gemini directly from the browser?**
    A client-side provider key can be extracted from source or network requests. The gateway keeps provider credentials server-side and applies shared policy.

27. **Which keys can be public?**
    The Supabase anon key is designed for client use when Row Level Security is correctly configured. Gemini keys, Supabase service-role keys, Hugging Face tokens, and model bearer tokens are private server-side secrets.

28. **What is RLS?**
    Row Level Security applies per-row database policies based on the caller role and identity. Arbora's owner tables use `auth.uid()` ownership conditions; anon/authenticated users do not get general access to rate-limit records.

29. **How are public shares exposed?**
    The `get_public_analysis` RPC selects the matching row only when `is_public` is true. This is narrower than granting anonymous reads over all analyses.

30. **How are AI calls rate-limited?**
    The Edge Function calls a privileged database RPC that atomically increments caller/window counters and returns whether the configured limit is exceeded. The table itself is not directly readable by public application roles.

31. **What if Arbora-T5 is cold or unavailable?**
    The gateway/service reports a retryable cold-start or failure path. The UI should communicate the issue and any classical fallback rather than silently presenting fallback output as the selected model's result.

32. **Why is the deterministic core in the browser?**
    Parsing and syntax verification are deterministic, inexpensive compiler tasks. Keeping them local supports responsiveness and offline core workflows, and makes provider output independently checkable.

33. **Why use a Web Worker?**
    A worker can keep CPU-bound parsing or analysis from blocking UI interaction. It communicates through messages and has no direct DOM access; worker lifecycle and stale-result handling are important.

34. **How do request IDs help?**
    They let the client ignore a result from an older request after newer input has been submitted. Abort signals can also cancel superseded work when the transport supports cancellation.

35. **What is cached?**
    The app uses short-lived/in-memory client caching for repeated requests as implemented in its repair path. It is not a shared server cache and should not be treated as durable or cross-user storage.

36. **How does the app work offline?**
    The deterministic compiler features run in the browser. Remote AI, Supabase auth/storage, and live result queries require network connectivity; offline UI must not imply those services are available.

37. **What security checks run in CI?**
    A built-bundle scan checks for known secret markers, while RLS tests and gateway validation cover other boundaries. A string scan is a useful guard, not proof that secrets can never leak.

38. **What should structured logs contain or avoid?**
    They can contain safe operational metadata such as task, status, and duration. They should never include user source, prompts, authorization headers, or secret values.

## Improving the system (39–50)

39. **What would you improve first in evaluation?**
    Increase independent held-out programs, include multiple random seeds, add human-authored examples, and publish run metadata plus confidence intervals for each metric.

40. **How would you test generalization?**
    Keep a test corpus outside the generator and corruption code, define its provenance, evaluate per error type and program size, and avoid tuning against it.

41. **How would you improve parser diagnostics?**
    Add golden tests for error spans and recovery, make synchronization decisions explicit, and evaluate whether diagnostics are stable and actionable on malformed inputs.

42. **How would you improve the grammar?**
    Narrow or left-factor ambiguous productions where the language permits it, while retaining intentional semantics such as nearest-unmatched-`if` binding. Recompute FIRST/FOLLOW conflicts after every grammar change.

43. **How would you make the parser robust to deep inputs?**
    Test deeply nested input and impose a documented nesting/resource limit if needed. Prefer explicit stacks for paths where recursion depth could exceed safe runtime limits.

44. **How would you make confidence more trustworthy?**
    Calibrate scores on a validation set, report reliability metrics, and never use model confidence as a substitute for parser verification.

45. **What would you add to repair scoring?**
    Keep syntax validity and exact match, and add semantic/compiler checks in a sandbox where possible. Define normalization carefully and preserve failures rather than silently repairing evaluator outputs.

46. **How would you reduce synthetic-data bias?**
    Mix synthetic cases with permissioned real-world examples, annotate error provenance, hold out projects/authors, and report results by source.

47. **How would you improve production reliability?**
    Add service health monitoring, rate-limit dashboards, deploy smoke tests, backup restore drills, and documented cold-start behavior; keep secrets out of logs and client bundles.

48. **How would you make AI failures easier to debug?**
    Store safe request IDs and provider/model metadata, validate response schemas, record timing and error classes, and avoid logging source or credentials.

49. **How would you support a larger language?**
    Specify its grammar and AST contract first, add lexer/parser/golden/property tests, analyze conflicts, and expand the evaluation corpus before claiming support.

50. **How would you make the model service faster?**
    Measure latency by hardware and batch shape first, then consider quantization, model loading strategy, or batching. Report quality/latency tradeoffs and never claim an optimization without benchmark data.

## Gotcha questions (51–60)

51. **Isn't a parser already 100% accurate?**
    It is deterministic for the grammar and implementation, but it can contain bugs and only recognizes the MiniC grammar Arbora implements. A successful parse says nothing about whether a repair matches intent.

52. **Why not just call an LLM and use its answer?**
    A model can produce malformed, over-edited, or valid-but-wrong code. Arbora treats it as a proposal and uses local deterministic parsing to establish syntax validity.

53. **How do you know the ML isn't memorizing the generator?**
    The current artifacts do not establish that. Program-ID and normalized-code split checks reduce direct leakage, but generator-specific patterns remain a threat; independent held-out sources and multiple seeds are required.

54. **B2 has a higher top-1 score; does that prove the n-gram model is better?**
    No. It is a single synthetic evaluation with a finite test set; top-3 is unchanged in the 505-case artifact. We need uncertainty estimates and independent replications before a broad claim.

55. **If every returned B1 candidate is verified, is B1 100% accurate?**
    No. “Verified” is parser validity among returned candidates. On the 505-case artifact B1 exact top-1 is 154/505; valid proposals can be wrong.

56. **Can the model's top candidate be considered safe because the parser accepts it?**
    No. Syntax acceptance does not establish semantics, preserve user intent, avoid security issues, or guarantee runtime behavior.

57. **Why report both 30 and 505 cases? Isn't that inconsistent?**
    They are distinct committed artifacts with different purposes. The 30-case report includes bootstrap intervals and is labeled quick; the 505-case run is larger but has no stored CI. Their sample sizes and methods must stay explicit.

58. **Why say results are reproducible if Gemini and Hub models are external?**
    The local generated baselines are seeded. External model calls require pinned model/revision, prompt/config, dates, cached outputs, and service availability; absent those artifacts, no result is claimed.

59. **Does the LL(1) table drive the parser?**
    No. It is computed for analysis and conflict visualization. The actual parser is hand-written recursive descent plus Pratt parsing.

60. **What is the strongest defensible project claim today?**
    Arbora implements an inspectable MiniC compiler frontend and a proposal/verification architecture, with seeded baseline artifacts and a test suite. The committed evidence does not demonstrate trained neural-model accuracy or generalization beyond its stated test data.
