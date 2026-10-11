"""Publish trained task checkpoints using repository IDs and credentials from env."""

from __future__ import annotations

import argparse
import os

from huggingface_hub import HfApi
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--task", choices=("repair", "ast"), required=True)
    parser.add_argument("--checkpoint", required=True)
    args = parser.parse_args()
    token = os.environ.get("HF_TOKEN")
    repo_id = os.environ.get(f"HF_{args.task.upper()}_REPO_ID")
    if not token or not repo_id:
        raise SystemExit(f"Set HF_TOKEN and HF_{args.task.upper()}_REPO_ID in the environment.")
    model = AutoModelForSeq2SeqLM.from_pretrained(args.checkpoint)
    tokenizer = AutoTokenizer.from_pretrained(args.checkpoint)
    model.push_to_hub(repo_id, token=token, private=True)
    tokenizer.push_to_hub(repo_id, token=token, private=True)
    HfApi(token=token).upload_file(
        path_or_fileobj="ml/MODEL_CARD.md",
        path_in_repo="MODEL_CARD.md",
        repo_id=repo_id,
        repo_type="model",
    )
    print(f"Published {args.task} checkpoint to {repo_id} (private).")


if __name__ == "__main__":
    main()
