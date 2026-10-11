"""Shared deterministic JSONL, hashing, and configuration helpers."""

from __future__ import annotations

import hashlib
import json
import random
from pathlib import Path
from typing import Any, Iterable, Iterator

import yaml


def seed_everything(seed: int) -> None:
    """Seed Python, NumPy, and torch when available."""
    random.seed(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except ImportError:
        pass
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except ImportError:
        pass


def read_jsonl(path: str | Path) -> Iterator[dict[str, Any]]:
    """Yield JSON objects from a UTF-8 JSONL file, rejecting malformed rows."""
    with Path(path).open(encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            if not line.strip():
                continue
            value = json.loads(line)
            if not isinstance(value, dict):
                raise ValueError(f"{path}:{line_number}: expected a JSON object")
            yield value


def write_jsonl(path: str | Path, rows: Iterable[dict[str, Any]]) -> None:
    """Write stable JSONL and create its parent directory."""
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8", newline="\n") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def load_yaml(path: str | Path) -> dict[str, Any]:
    """Load a YAML mapping."""
    with Path(path).open(encoding="utf-8") as stream:
        value = yaml.safe_load(stream)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a YAML mapping in {path}")
    return value


def normalized_code(code: str) -> str:
    """Normalize insignificant whitespace and comments for split leakage checks."""
    import re

    pattern = re.compile(
        r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*.*?\*/|\s+|.',
        flags=re.S,
    )
    significant = [
        match.group(0)
        for match in pattern.finditer(code)
        if not match.group(0).isspace()
        and not match.group(0).startswith("//")
        and not match.group(0).startswith("/*")
    ]
    return "\u0000".join(significant)


def stable_id(value: str) -> str:
    """Return a stable short SHA-256 key."""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def bootstrap_interval(
    values: list[float], seed: int = 42, samples: int = 5000, alpha: float = 0.05
) -> dict[str, float | int | None]:
    """Compute a percentile bootstrap confidence interval for a sample mean."""
    if not values:
        return {"estimate": None, "lower": None, "upper": None, "n": 0}
    import numpy as np

    array = np.asarray(values, dtype=np.float64)
    rng = np.random.default_rng(seed)
    indices = rng.integers(0, len(array), size=(samples, len(array)))
    means = array[indices].mean(axis=1)
    return {
        "estimate": float(array.mean()),
        "lower": float(np.quantile(means, alpha / 2)),
        "upper": float(np.quantile(means, 1 - alpha / 2)),
        "n": int(array.size),
    }
