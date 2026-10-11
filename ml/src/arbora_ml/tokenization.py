"""Lossless source wrapping for CodeT5's subword tokenizer."""

from __future__ import annotations

from typing import Any

TASK_PREFIXES = {"repair": "repair: ", "ast": "ast: "}
WHITESPACE_TOKENS = {
    " ": "<ARBORA_SP>",
    "\n": "<ARBORA_NL>",
    "\t": "<ARBORA_TAB>",
    "\r": "<ARBORA_CR>",
}
LESS_THAN_TOKEN = "<ARBORA_LT>"
MINIC_TOKENS = [
    *WHITESPACE_TOKENS.values(),
    LESS_THAN_TOKEN,
    "++",
    "--",
    "==",
    "!=",
    "<=",
    ">=",
    "&&",
    "||",
    "->",
    "::",
]


def escape_source(source: str) -> str:
    """Encode formatting characters as explicit tokens without changing other text."""
    return "".join(
        WHITESPACE_TOKENS.get(character, LESS_THAN_TOKEN if character == "<" else character)
        for character in source
    )


def unescape_source(source: str) -> str:
    """Restore formatting tokens, longest marker first."""
    result = source
    for character, token in sorted(WHITESPACE_TOKENS.items(), key=lambda item: -len(item[1])):
        result = result.replace(token, character)
    return result.replace(LESS_THAN_TOKEN, "<")


def add_minic_special_tokens(tokenizer: Any) -> int:
    """Register MiniC operators and whitespace sentinels with a HF tokenizer."""
    return int(tokenizer.add_special_tokens({"additional_special_tokens": MINIC_TOKENS}))


def wrap_source(task: str, source: str) -> str:
    """Add the task prefix and protect all source whitespace."""
    if task not in TASK_PREFIXES:
        raise ValueError(f"Unsupported task prefix: {task}")
    return TASK_PREFIXES[task] + escape_source(source)


def encode_source(tokenizer: Any, task: str, source: str, **kwargs: Any) -> dict[str, Any]:
    """Tokenize task-prefixed source while retaining newline/indentation sentinels."""
    return tokenizer(wrap_source(task, source), **kwargs)


def decode_source(tokenizer: Any, token_ids: Any, **kwargs: Any) -> str:
    """Decode model tokens, remove generation-control tokens, and restore source whitespace."""
    eos_id = getattr(tokenizer, "eos_token_id", None)
    pad_id = getattr(tokenizer, "pad_token_id", None)
    ids = token_ids.tolist() if hasattr(token_ids, "tolist") else list(token_ids)
    if ids and isinstance(ids[0], list):
        ids = ids[0]
    if eos_id in ids:
        ids = ids[:ids.index(eos_id)]
    if pad_id is not None:
        while ids and ids[-1] == pad_id:
            ids.pop()
    decoded = tokenizer.decode(ids, **kwargs)
    for name in ("bos_token", "eos_token", "pad_token"):
        control = getattr(tokenizer, name, None)
        if control:
            decoded = decoded.replace(control, "")
    return unescape_source(decoded)


def tokenizer_round_trip(tokenizer: Any, source: str) -> bool:
    """Check actual tokenizer encoding/decoding preserves all MiniC source characters."""
    encoded = tokenizer.encode(escape_source(source), add_special_tokens=False)
    decoded = tokenizer.decode(
        encoded,
        skip_special_tokens=False,
        clean_up_tokenization_spaces=False,
    )
    return unescape_source(decoded) == source
