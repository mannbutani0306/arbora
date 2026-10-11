"""Transparent add-k token trigram baseline for candidate reranking."""

from __future__ import annotations

import math
from collections import Counter
from dataclasses import dataclass
from typing import Iterable


def tokens(code: str) -> list[str]:
    """Tokenize MiniC sufficiently for LM candidate ranking; TS remains the validity oracle."""
    import re

    return re.findall(
        r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|[A-Za-z_]\w*|\d+(?:\.\d+)?|==|!=|<=|>=|\+\+|--|&&|\|\||[^\s]',
        code,
    )


@dataclass
class AddKTrigram:
    """Serializable add-k trigram language model."""

    smoothing: float
    vocabulary: list[str]
    trigram_counts: dict[str, int]
    context_counts: dict[str, int]

    @classmethod
    def train(cls, sequences: Iterable[list[str]], smoothing: float = 0.1) -> "AddKTrigram":
        """Train on token sequences."""
        if smoothing <= 0:
            raise ValueError("smoothing must be positive")
        vocab = {"<BOS>", "<EOS>"}
        trigrams: Counter[tuple[str, str, str]] = Counter()
        contexts: Counter[tuple[str, str]] = Counter()
        for sequence in sequences:
            vocab.update(sequence)
            padded = ["<BOS>", "<BOS>", *sequence, "<EOS>"]
            for index in range(2, len(padded)):
                trigrams[tuple(padded[index - 2:index + 1])] += 1
                contexts[tuple(padded[index - 2:index])] += 1
        return cls(
            smoothing=smoothing,
            vocabulary=sorted(vocab),
            trigram_counts={"\u001f".join(key): count for key, count in trigrams.items()},
            context_counts={"\u001f".join(key): count for key, count in contexts.items()},
        )

    def score(self, sequence: list[str]) -> float:
        """Return add-k sequence log probability."""
        padded = ["<BOS>", "<BOS>", *sequence, "<EOS>"]
        vocab_size = max(1, len(self.vocabulary))
        total = 0.0
        for index in range(2, len(padded)):
            context = "\u001f".join(padded[index - 2:index])
            tri = f"{context}\u001f{padded[index]}"
            numerator = self.trigram_counts.get(tri, 0) + self.smoothing
            denominator = self.context_counts.get(context, 0) + self.smoothing * vocab_size
            total += math.log(numerator / denominator)
        return total

    def rank(self, candidates: list[str]) -> list[str]:
        """Sort candidate strings by descending LM score, deterministic lexical tiebreak."""
        return sorted(candidates, key=lambda code: (-self.score(tokens(code)), code))
