---
title: Arbora-T5 Inference API
emoji: 🌿
colorFrom: green
colorTo: indigo
sdk: docker
app_port: 7860
pinned: false
---

# Arbora-T5 Hugging Face Space

Create a Space with the **Docker** SDK and copy this file to the Space root as `README.md`. Add the service source and `ml/src/arbora_ml/tokenization.py` to the Space repository, preserving the `ml/serve` and `ml/src` paths.

Set Space secrets:

- `HF_REPO_REPAIR`: private or public repair checkpoint repo ID.
- `HF_REPO_AST`: private or public AST checkpoint repo ID.
- `HF_TOKEN`: required only for private model repositories.
- `ARBORA_MODEL_TOKEN`: optional bearer token required for inference requests; `/health` remains public.

Optional variables: `HF_REVISION` (default `main`), `ALLOWED_ORIGINS`, `ARBORA_INT8=true`, `ARBORA_MAX_CONCURRENCY=1`, and `ARBORA_REQUEST_TIMEOUT_SECONDS=120`.

The container loads both checkpoints at startup. Until it is ready, `/health` returns `{"status":"loading"}`. A generation timeout returns `MODEL_COLD_START` and `Retry-After: 20`; clients should show “Model waking up, retry in 20 s”.

Endpoints are `GET /health`, `POST /repair` (`code`, optional `num_beams` and `num_return`, maximum 8), and `POST /ast` (`code`). Parser verification is intentionally not performed by the model service: clients and the AI gateway must treat all model output as proposals and verify repair candidates with Arbora's deterministic parser.
