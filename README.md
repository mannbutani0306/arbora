# Arbora

AI-assisted compiler front-end that parses source code into an Abstract Syntax Tree (AST), repairs syntax errors with Gemini, and visualizes language mechanics.

## Architecture

```
Source Code (MiniC)
       │
       ▼
 ┌───────────┐
 │   Lexer   │ ──► Tokens Stream
 └─────┬─────┘
       │
       ▼
 ┌───────────┐
 │  Parser   │ ──► Classical AST / Pratt Precedence
 └─────┬─────┘
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│  AI Repair   │         │  Neural AST  │         │  AI Explain  │
│(Gemini Flash)│         │(Direct Graph)│         │ (Walkthrough)│
└──────────────┘         └──────────────┘         └──────────────┘
```

- **Lexer & Parser**: Pure TypeScript hand-written scanner and resilient recursive-descent Pratt parser running in a Web Worker.
- **AI Syntax Repair**: Gemini structured output generating minimal verifiable patch candidates with panic-mode fallback.
- **Neural AST & Comparison**: Direct AST generation compared with classical AST using Zhang-Shasha Tree Edit Distance (TED) and F1 metric.
- **Grammar Lab**: Programmatic computation of Nullable symbols, FIRST sets, FOLLOW sets, and LL(1) parsing tables.
- **Benchmark Suite**: Automated evaluation across 20+ programs injecting single-token deletions, insertions, and swaps.

## Environment Variables

Copy `.env.example` to `.env` for Supabase configuration:

```env
VITE_SUPABASE_URL="https://your-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
```

Never put a Gemini API key in client code or a `VITE_` variable. Gemini credentials belong only in server-side services.

## Setup & Running

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run unit tests
npm test

# Build for production
npm run build
```

## Screenshots

<!-- Screenshot Placeholder: Interactive AST Playground -->
<!-- Screenshot Placeholder: AI Syntax Repair Diff View -->
<!-- Screenshot Placeholder: Grammar Lab LL(1) Matrix -->
<!-- Screenshot Placeholder: Automated Benchmark Suite -->
