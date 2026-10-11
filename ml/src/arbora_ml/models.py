"""CodeT5 construction helpers."""

from __future__ import annotations

from typing import Any

from .tokenization import add_minic_special_tokens


def load_seq2seq(model_name: str) -> tuple[Any, Any]:
    """Load an HF tokenizer/model pair and resize embeddings after adding sentinels."""
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    added = add_minic_special_tokens(tokenizer)
    if added:
        model.resize_token_embeddings(len(tokenizer))
    return tokenizer, model


def parameter_count(model: Any) -> int:
    """Count trainable and frozen parameters in the model."""
    return sum(parameter.numel() for parameter in model.parameters())
