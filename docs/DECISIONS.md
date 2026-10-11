# Architecture Decision Records

## ADR 001: Hybrid design

The deterministic parser is the source of truth, and AI proposals are always verified.

## ADR 002: Recursive-descent grammar conflicts

The MiniC grammar is not LL(1). The generated predictive table currently reports conflicts at:

- `TopLevelItem` on each type keyword (`int`, `float`, `bool`, `string`, `char`, `void`): a declaration may continue as either a function or a global variable. The recursive-descent parser distinguishes them by looking ahead to `(` versus the variable-declaration tail.
- `VarDeclTail` on `[`: the sized-array and unsized-array productions overlap until the next token (`]` versus an expression).
- `Statement` on `{`: a block and an expression statement are both admitted by the broad CFG; the parser chooses the block production at statement start.
- `ElseOpt` on `else`: the optional-else and explicit-else productions overlap. Recursive descent greedily associates `else` with the nearest unmatched `if` (the usual dangling-else rule).

These conflicts are documented rather than reported as LL(1). The parser is hand-written recursive descent, validated against this grammar, and does not execute the generated predictive table.
