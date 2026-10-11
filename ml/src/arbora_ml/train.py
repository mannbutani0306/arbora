"""Config-driven Hugging Face Seq2SeqTrainer entry point."""

from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path
from typing import Any

from .models import load_seq2seq, parameter_count
from .tokenization import decode_source, encode_source
from .utils import load_yaml, seed_everything


def build_dataset(path: str, tokenizer: Any, task: str, config: dict[str, Any]) -> Any:
    """Load JSONL examples into a tokenized HF Dataset."""
    from datasets import load_dataset

    dataset = load_dataset("json", data_files=path, split="train")
    limit = config.get("data_limit")
    if limit is not None:
        dataset = dataset.select(range(min(int(limit), len(dataset))))

    def tokenize(batch: dict[str, list[str]]) -> dict[str, Any]:
        inputs = tokenizer(
            batch["input_text"],
            truncation=False,
        )
        targets = tokenizer(
            batch["target_text"],
            truncation=False,
        )
        inputs["labels"] = targets["input_ids"]
        inputs["source_length"] = [len(tokens) for tokens in inputs["input_ids"]]
        inputs["target_length"] = [len(tokens) for tokens in targets["input_ids"]]
        return inputs

    dataset = dataset.map(tokenize, batched=True, remove_columns=dataset.column_names)
    original_count = len(dataset)
    limit = min(int(config["max_source_length"]), int(config["max_target_length"]))
    dataset = dataset.filter(
        lambda row: row["source_length"] <= limit and row["target_length"] <= limit
    )
    print(
        f"{task} {path}: filtered {original_count - len(dataset)} over-limit model-token examples "
        f"({len(dataset)} retained)."
    )
    return dataset.remove_columns(["source_length", "target_length"])


def exact_match_metric(tokenizer: Any) -> Any:
    """Return decoded exact-match scorer for Trainer evaluation."""
    import numpy as np

    def compute(prediction: Any) -> dict[str, float]:
        predictions, labels = prediction
        if isinstance(predictions, tuple):
            predictions = predictions[0]
        labels = np.where(labels == -100, tokenizer.pad_token_id, labels)
        decoded_predictions = [decode_source(tokenizer, item, skip_special_tokens=False) for item in predictions]
        decoded_labels = [decode_source(tokenizer, item, skip_special_tokens=False) for item in labels]
        matches = [left == right for left, right in zip(decoded_predictions, decoded_labels, strict=True)]
        return {"exact_match": sum(matches) / max(1, len(matches))}

    return compute


def train(config_path: str, resume: str | None = None, quick: bool = False) -> None:
    """Run a reproducible seq2seq training job."""
    from transformers import (
        DataCollatorForSeq2Seq,
        EarlyStoppingCallback,
        Seq2SeqTrainer,
        Seq2SeqTrainingArguments,
    )

    config = load_yaml(config_path)
    if quick:
        import torch

        config["epochs"] = 1
        config["data_limit"] = 5000
        config["fp16"] = bool(torch.cuda.is_available())
        config["output_dir"] = str(Path(config["output_dir"]).with_name(
            Path(config["output_dir"]).name + "-quick"
        ))
    seed_everything(int(config["seed"]))
    task = str(config["task"])
    tokenizer, model = load_seq2seq(str(config["model_name"]))
    training = build_dataset(str(config["train_file"]), tokenizer, task, config)
    validation = build_dataset(str(config["validation_file"]), tokenizer, task, config)
    if not len(training) or not len(validation):
        raise ValueError("Training and validation splits must each contain at least one untruncated example.")
    output_dir = Path(str(config["output_dir"]))
    output_dir.mkdir(parents=True, exist_ok=True)
    wandb_enabled = bool(os.environ.get("WANDB_API_KEY"))
    arguments = Seq2SeqTrainingArguments(
        output_dir=str(output_dir),
        learning_rate=float(config["learning_rate"]),
        warmup_ratio=float(config["warmup_ratio"]),
        weight_decay=float(config["weight_decay"]),
        num_train_epochs=float(config["epochs"]),
        per_device_train_batch_size=int(config["train_batch_size"]),
        per_device_eval_batch_size=int(config["eval_batch_size"]),
        gradient_accumulation_steps=int(config["gradient_accumulation_steps"]),
        predict_with_generate=True,
        generation_num_beams=int(config["num_beams"]),
        fp16=bool(config["fp16"]),
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_strategy="steps",
        logging_steps=int(config["logging_steps"]),
        logging_first_step=True,
        load_best_model_at_end=True,
        metric_for_best_model="eval_exact_match",
        greater_is_better=True,
        save_total_limit=int(config["save_total_limit"]),
        report_to=["wandb"] if wandb_enabled else ["none"],
        seed=int(config["seed"]),
        data_seed=int(config["seed"]),
        optim="adamw_torch",
        dataloader_num_workers=0,
        fp16_full_eval=bool(config["fp16"]),
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=arguments,
        train_dataset=training,
        eval_dataset=validation,
        data_collator=DataCollatorForSeq2Seq(tokenizer, model=model),
        processing_class=tokenizer,
        compute_metrics=exact_match_metric(tokenizer),
        callbacks=[EarlyStoppingCallback(
            early_stopping_patience=int(config["early_stopping_patience"])
        )],
    )
    print(f"Task={task}; params={parameter_count(model):,}; train={len(training)}; val={len(validation)}")
    trainer.train(resume_from_checkpoint=resume or None)
    best_dir = output_dir / "best"
    trainer.save_model(str(best_dir))
    tokenizer.save_pretrained(best_dir)
    history = trainer.state.log_history
    columns = sorted({key for row in history for key in row})
    with (output_dir / "training_log.csv").open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=columns)
        writer.writeheader()
        writer.writerows(history)
    trainer.state.save_to_json(str(output_dir / "trainer_state.json"))
    trainer.save_metrics("train", trainer.state.log_history[-1])
    print(f"Best checkpoint saved to {best_dir}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    parser.add_argument("--resume", nargs="?", const="auto", default=None)
    parser.add_argument("--quick", action="store_true", help="Use up to 5,000 examples and one epoch.")
    args = parser.parse_args()
    resume = args.resume
    if resume == "auto":
        checkpoints = sorted(Path(load_yaml(args.config)["output_dir"]).glob("checkpoint-*"))
        resume = str(checkpoints[-1]) if checkpoints else None
    train(args.config, resume, args.quick)


if __name__ == "__main__":
    main()
