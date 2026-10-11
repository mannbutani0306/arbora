"""Bridge to Arbora's deterministic TypeScript parser without reimplementing it."""

from __future__ import annotations

import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Any, Iterable

from .utils import read_jsonl, write_jsonl


def parse_codes(
    codes: Iterable[str],
    repo_root: str | Path,
    node_command: str | None = None,
) -> list[dict[str, Any]]:
    """Parse a batch with tools/parse-batch.ts; one process handles all code snippets."""
    root = Path(repo_root).resolve()
    tool = root / "tools" / "parse-batch.ts"
    if not tool.is_file():
        raise FileNotFoundError(f"TypeScript oracle not found: {tool}")
    with tempfile.TemporaryDirectory(prefix="arbora-oracle-") as temporary:
        source = Path(temporary) / "input.jsonl"
        destination = Path(temporary) / "output.jsonl"
        write_jsonl(source, ({"id": str(index), "code": code} for index, code in enumerate(codes)))
        executable = node_command or ("npx.cmd" if os.name == "nt" else "npx")
        command = [
            executable, "tsx", str(tool),
            "--in", str(source), "--field", "code", "--out", str(destination),
        ]
        result = subprocess.run(command, cwd=root, text=True, capture_output=True, check=False)
        if result.returncode != 0:
            raise RuntimeError(
                f"TypeScript oracle failed ({result.returncode}): {result.stderr.strip()}"
            )
        return list(read_jsonl(destination))


def verify_candidates(
    candidate_groups: list[list[str]], repo_root: str | Path
) -> list[list[dict[str, Any]]]:
    """Verify candidate beams in one parser invocation and preserve group ordering."""
    flat = [candidate for group in candidate_groups for candidate in group]
    parsed = parse_codes(flat, repo_root)
    result: list[list[dict[str, Any]]] = []
    cursor = 0
    for group in candidate_groups:
        result.append(parsed[cursor:cursor + len(group)])
        cursor += len(group)
    return result


def main() -> None:
    """CLI for checking JSONL `code` records through the TypeScript oracle."""
    import argparse

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--in", dest="input", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--field", default="code")
    args = parser.parse_args()
    rows = list(read_jsonl(args.input))
    codes = [str(row[args.field]) for row in rows]
    outputs = parse_codes(codes, args.repo_root)
    write_jsonl(args.out, outputs)


if __name__ == "__main__":
    main()
