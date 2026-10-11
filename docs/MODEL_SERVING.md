# Arbora-T5 model serving

The service loads repair and AST checkpoints from the Hugging Face Hub at startup. It returns proposals only. Repair output is always parsed by Arbora's deterministic MiniC parser in the browser before a candidate is marked **Verified**.

## Deploy a Hugging Face Space

1. Train and publish both tasks using the instructions in [`ml/README.md`](../ml/README.md) and `ml/scripts/push_to_hub.py`. The service expects `Salesforce/codet5-small`-compatible Seq2Seq checkpoints with the MiniC tokenizer additions saved with each checkpoint.
2. Create a Hugging Face Space using the **Docker** SDK and copy [`ml/serve/README_SPACE.md`](../ml/serve/README_SPACE.md) to the Space repository root as `README.md`.
3. Add the contents of `ml/serve/` and `ml/src/arbora_ml/` to the Space at the same paths. Do not commit model weights.
4. Set Space secrets `HF_REPO_REPAIR` and `HF_REPO_AST` to the Hub repo IDs. Set `HF_TOKEN` only if those repositories are private. `HF_REVISION` optionally pins a model revision. Configure `ALLOWED_ORIGINS` for your application.
5. Wait for the Space startup to finish, then check `https://<space-host>/health`. A ready response includes model IDs and revision; while loading it reports `{"status":"loading"}`.
6. Set the Supabase Edge Function secrets:

   ```sh
   supabase secrets set ARBORA_MODEL_URL=https://<space-host>
   ```

   If the Space is protected by a bearer token, also set `ARBORA_MODEL_TOKEN`. Redeploy `ai-gateway` after updating secrets.
7. In Arbora, select **Arbora-T5** in the Engine control and use Repair mode. The raw candidates are verified locally; only zero-error parser results display the Verified badge.

The gateway forwards to the Space with a 20-second timeout while preserving normal auth and rate limiting. If a request times out or the Space reports a startup 503, Arbora surfaces “Model waking up, retry in 20 s” and explicitly shows classical fallback candidates where repair is available. Model failure never silently changes the selected engine.

## Local Docker

From the repository root, export `HF_REPO_REPAIR`, `HF_REPO_AST`, and optional `HF_TOKEN`, then run:

```sh
docker compose -f ml/serve/docker-compose.yml up --build
```

The service listens on `http://localhost:7860`; test `GET /health`, `POST /repair`, and `POST /ast`. Set `ARBORA_INT8=true` to try dynamic int8 quantization of Linear layers on CPU. Results can vary by PyTorch and model support; leave it disabled if startup or inference fails.

Request source and total JSON body size are capped at 8 KB, tokenized input is capped at 384 tokens, at most eight repair beams are returned, and concurrent inference is limited. `is_valid` on `/ast` means the linearized S-expression is structurally well-formed with known MiniC node names; it is not a semantic correctness claim.
