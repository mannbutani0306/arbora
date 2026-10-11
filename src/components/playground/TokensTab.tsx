import type { Token } from '../../types/ast';

export function TokensTab({
  tokens,
  onJump,
  onRun,
}: {
  tokens: Token[];
  onJump: (line: number, column: number) => void;
  onRun: () => void;
}) {
  if (!tokens.length)
    return (
      <div className="rounded-xl border border-[#E7E5E4] bg-white p-5 text-sm text-[#78716C]">
        <p>No tokens scanned yet.</p>
        <button
          onClick={onRun}
          className="mt-3 rounded-lg bg-[#059669] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#047857]"
        >
          Scan tokens
        </button>
      </div>
    );
  return (
    <div className="overflow-auto rounded-xl border border-[#E7E5E4] bg-white">
      <table className="w-full text-left text-xs">
        <thead className="bg-stone-50 text-[#78716C]">
          <tr>
            <th className="p-2">#</th>
            <th className="p-2">Type</th>
            <th className="p-2">Lexeme</th>
            <th className="p-2">Line:Col</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token, index) => (
            <tr
              key={`${index}-${token.line}-${token.column}`}
              className="border-t border-[#E7E5E4] hover:bg-emerald-50/60"
            >
              <td className="p-2 text-[#78716C]">{index + 1}</td>
              <td className="p-2 font-medium">{token.type}</td>
              <td className="p-2 font-mono">{token.lexeme === '\n' ? '\\n' : token.lexeme}</td>
              <td className="p-2">
                <button
                  onClick={() => onJump(token.line, token.column)}
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  {token.line}:{token.column}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
