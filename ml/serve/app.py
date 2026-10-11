"""FastAPI inference API for Arbora-T5 Hub checkpoints."""

from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from contextlib import nullcontext
from typing import Any, Callable

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from starlette.concurrency import run_in_threadpool

from arbora_ml.tokenization import add_minic_special_tokens, decode_source, wrap_source

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("arbora.model_service")
MAX_BODY_BYTES = 8 * 1024
MAX_INPUT_BYTES = 8 * 1024
MAX_SEQUENCE_LENGTH = 384


class RepairRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=MAX_INPUT_BYTES)
    num_beams: int = Field(default=8, ge=1, le=8)
    num_return: int = Field(default=8, ge=1, le=8)


class RepairCandidate(BaseModel):
    code: str
    score: float


class RepairResponse(BaseModel):
    candidates: list[RepairCandidate]
    model_id: str
    revision: str
    latency_ms: float


class AstRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=MAX_INPUT_BYTES)


class AstResponse(BaseModel):
    ast_bracketed: str
    is_valid: bool
    model_id: str
    revision: str
    latency_ms: float


class ModelBundle:
    def __init__(
        self,
        repair_model: Any,
        repair_tokenizer: Any,
        ast_model: Any,
        ast_tokenizer: Any,
        repair_id: str,
        ast_id: str,
        revision: str,
    ) -> None:
        self.repair_model = repair_model
        self.repair_tokenizer = repair_tokenizer
        self.ast_model = ast_model
        self.ast_tokenizer = ast_tokenizer
        self.repair_id = repair_id
        self.ast_id = ast_id
        self.revision = revision


def load_models() -> ModelBundle:
    """Load both checkpoints once at startup, optionally quantizing CPU Linear layers."""
    import torch
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    repair_id = os.environ.get("HF_REPO_REPAIR", "").strip()
    ast_id = os.environ.get("HF_REPO_AST", "").strip()
    if not repair_id or not ast_id:
        raise RuntimeError("HF_REPO_REPAIR and HF_REPO_AST are required.")
    revision = os.environ.get("HF_REVISION", "main").strip() or "main"
    token = os.environ.get("HF_TOKEN") or None
    load_options = {"revision": revision, "token": token}
    repair_tokenizer = AutoTokenizer.from_pretrained(repair_id, **load_options)
    ast_tokenizer = AutoTokenizer.from_pretrained(ast_id, **load_options)
    add_minic_special_tokens(repair_tokenizer)
    add_minic_special_tokens(ast_tokenizer)
    repair_model = AutoModelForSeq2SeqLM.from_pretrained(repair_id, **load_options).eval()
    ast_model = AutoModelForSeq2SeqLM.from_pretrained(ast_id, **load_options).eval()
    if os.getenv("ARBORA_INT8", "").lower() in {"1", "true", "yes"}:
        repair_model = torch.ao.quantization.quantize_dynamic(
            repair_model, {torch.nn.Linear}, dtype=torch.qint8
        ).eval()
        ast_model = torch.ao.quantization.quantize_dynamic(
            ast_model, {torch.nn.Linear}, dtype=torch.qint8
        ).eval()
    return ModelBundle(
        repair_model, repair_tokenizer, ast_model, ast_tokenizer,
        repair_id, ast_id, revision,
    )


def _well_formed_ast(value: str) -> bool:
    """Check balanced S-expression delimiters and the expected Program root."""
    node_types = {
        "Program", "FunctionDecl", "Param", "VarDecl", "Block", "IfStmt",
        "WhileStmt", "ForStmt", "DoWhileStmt", "ReturnStmt", "BreakStmt",
        "ContinueStmt", "ExprStmt", "BinaryExpr", "UnaryExpr", "AssignExpr",
        "CallExpr", "IndexExpr", "Identifier", "Literal", "ArrayLiteral",
        "ErrorNode",
    }
    if not value.startswith("(Program"):
        return False
    depth = 0
    quoted = False
    escaped = False
    for index, character in enumerate(value):
        if quoted:
            if escaped:
                escaped = False
            elif character == "\\":
                escaped = True
            elif character == '"':
                quoted = False
            continue
        if character == '"':
            quoted = True
        elif character == "(":
            match = re.match(r"\s*([A-Za-z][A-Za-z0-9]*)", value[index + 1 :])
            if not match or match.group(1) not in node_types:
                return False
            depth += 1
        elif character == ")":
            depth -= 1
            if depth < 0:
                return False
    return not quoted and depth == 0


def _get_json_model(request: Request, model: type[BaseModel]) -> BaseModel:
    try:
        body = request.scope.get("arbora_body")
        if body is None:
            raise HTTPException(status_code=400, detail="Request body is required.")
        return model.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail=error.errors(include_url=False)) from error


def create_app(
    loader: Callable[[], ModelBundle] = load_models,
    *,
    max_concurrency: int | None = None,
) -> FastAPI:
    app = FastAPI(title="Arbora-T5", version="1.0.0")
    origins = [
        origin.strip()
        for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    semaphore = asyncio.Semaphore(
        max_concurrency or max(1, int(os.getenv("ARBORA_MAX_CONCURRENCY", "1")))
    )
    request_timeout = max(1, int(os.getenv("ARBORA_REQUEST_TIMEOUT_SECONDS", "120")))

    @app.middleware("http")
    async def body_limit(request: Request, call_next: Callable[..., Any]) -> Any:
        required_token = os.getenv("ARBORA_MODEL_TOKEN")
        if required_token and request.url.path != "/health":
            if request.headers.get("authorization") != f"Bearer {required_token}":
                return JSONResponse(
                    {"code": "UNAUTHORIZED", "message": "Model service token is invalid."},
                    status_code=401,
                )
        if request.method == "POST":
            declared_length = request.headers.get("content-length")
            try:
                if declared_length and int(declared_length) > MAX_BODY_BYTES:
                    return JSONResponse(
                        {"code": "PAYLOAD_TOO_LARGE", "message": "Request body exceeds 8 KB."},
                        status_code=413,
                    )
            except ValueError:
                return JSONResponse(
                    {"code": "BAD_REQUEST", "message": "Invalid Content-Length header."},
                    status_code=400,
                )
            body = await request.body()
            if len(body) > MAX_BODY_BYTES:
                return JSONResponse(
                    {"code": "PAYLOAD_TOO_LARGE", "message": "Request body exceeds 8 KB."},
                    status_code=413,
                )
            request.scope["arbora_body"] = body
        return await call_next(request)

    @app.exception_handler(asyncio.TimeoutError)
    async def timeout_handler(_: Request, __: asyncio.TimeoutError) -> JSONResponse:
        return JSONResponse(
            {"code": "MODEL_COLD_START", "message": "Model waking up, retry in 20 s."},
            status_code=503,
            headers={"Retry-After": "20"},
        )

    @app.exception_handler(HTTPException)
    async def http_error_handler(_: Request, error: HTTPException) -> JSONResponse:
        if isinstance(error.detail, dict) and "code" in error.detail:
            body = error.detail
        else:
            body = {"code": "REQUEST_ERROR", "message": str(error.detail)}
        return JSONResponse(
            body,
            status_code=error.status_code,
            headers=error.headers,
        )

    @app.on_event("startup")
    async def startup() -> None:
        app.state.models = await run_in_threadpool(loader)
        logger.info(
            "models_loaded",
            extra={
                "repair_model": app.state.models.repair_id,
                "ast_model": app.state.models.ast_id,
                "revision": app.state.models.revision,
            },
        )

    async def run_inference(operation: Callable[[], Any]) -> Any:
        try:
            await asyncio.wait_for(semaphore.acquire(), timeout=request_timeout)
        except TimeoutError as error:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "MODEL_COLD_START",
                    "message": "Model waking up, retry in 20 s.",
                },
                headers={"Retry-After": "20"},
            ) from error
        async def operation_and_release() -> Any:
            try:
                return await run_in_threadpool(operation)
            finally:
                semaphore.release()

        task = asyncio.create_task(operation_and_release())
        try:
            return await asyncio.wait_for(asyncio.shield(task), timeout=request_timeout)
        except TimeoutError as error:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "MODEL_COLD_START",
                    "message": "Model waking up, retry in 20 s.",
                },
                headers={"Retry-After": "20"},
            ) from error

    @app.get("/health")
    async def health() -> dict[str, Any]:
        models: ModelBundle | None = getattr(app.state, "models", None)
        if models is None:
            return {"status": "loading"}
        return {
            "status": "ok",
            "models": {"repair": models.repair_id, "ast": models.ast_id},
            "revision": models.revision,
        }

    @app.post("/repair", response_model=RepairResponse)
    async def repair(request: Request) -> RepairResponse:
        payload = _get_json_model(request, RepairRequest)
        assert isinstance(payload, RepairRequest)
        if len(payload.code.encode("utf-8")) > MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="Source code exceeds 8 KB.")
        models: ModelBundle = app.state.models
        tokenizer = models.repair_tokenizer
        encoded = tokenizer(
            wrap_source("repair", payload.code),
            return_tensors="pt",
            truncation=False,
        )
        if len(encoded["input_ids"][0]) > MAX_SEQUENCE_LENGTH:
            raise HTTPException(status_code=413, detail="Input exceeds 384 model tokens.")
        device = next(models.repair_model.parameters(), None)
        device = device.device if device is not None else "cpu"
        encoded = {
            key: value.to(device) if hasattr(value, "to") else value
            for key, value in encoded.items()
        }

        def infer() -> list[RepairCandidate]:
            try:
                import torch
                inference_context = torch.inference_mode()
            except ImportError:  # Unit tests use a tiny model stub.
                inference_context = nullcontext()
            with inference_context:
                output = models.repair_model.generate(
                    **encoded,
                    num_beams=payload.num_beams,
                    num_return_sequences=min(payload.num_return, payload.num_beams),
                    max_new_tokens=MAX_SEQUENCE_LENGTH,
                    early_stopping=True,
                    return_dict_in_generate=True,
                    output_scores=True,
                )
            sequences = output.sequences
            scores = getattr(output, "sequences_scores", None)
            candidates: list[RepairCandidate] = []
            for index, sequence in enumerate(sequences):
                code = decode_source(
                    tokenizer,
                    sequence,
                    skip_special_tokens=False,
                    clean_up_tokenization_spaces=False,
                )
                score = float(scores[index]) if scores is not None else 0.0
                candidates.append(RepairCandidate(code=code, score=score))
            return candidates

        started = time.perf_counter()
        candidates = await run_inference(infer)
        latency = (time.perf_counter() - started) * 1000
        return RepairResponse(
            candidates=candidates[:8],
            model_id=models.repair_id,
            revision=models.revision,
            latency_ms=latency,
        )

    @app.post("/ast", response_model=AstResponse)
    async def ast(request: Request) -> AstResponse:
        payload = _get_json_model(request, AstRequest)
        assert isinstance(payload, AstRequest)
        if len(payload.code.encode("utf-8")) > MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="Source code exceeds 8 KB.")
        models: ModelBundle = app.state.models
        tokenizer = models.ast_tokenizer
        encoded = tokenizer(
            wrap_source("ast", payload.code),
            return_tensors="pt",
            truncation=False,
        )
        if len(encoded["input_ids"][0]) > MAX_SEQUENCE_LENGTH:
            raise HTTPException(status_code=413, detail="Input exceeds 384 model tokens.")
        device = next(models.ast_model.parameters(), None)
        device = device.device if device is not None else "cpu"
        encoded = {
            key: value.to(device) if hasattr(value, "to") else value
            for key, value in encoded.items()
        }

        def infer() -> str:
            try:
                import torch
                inference_context = torch.inference_mode()
            except ImportError:  # Unit tests use a tiny model stub.
                inference_context = nullcontext()
            with inference_context:
                output = models.ast_model.generate(
                    **encoded,
                    num_beams=1,
                    max_new_tokens=MAX_SEQUENCE_LENGTH,
                )
            return decode_source(
                tokenizer,
                output[0],
                skip_special_tokens=False,
                clean_up_tokenization_spaces=False,
            ).strip()

        started = time.perf_counter()
        output = await run_inference(infer)
        return AstResponse(
            ast_bracketed=output,
            is_valid=_well_formed_ast(output),
            model_id=models.ast_id,
            revision=models.revision,
            latency_ms=(time.perf_counter() - started) * 1000,
        )

    return app


app = create_app()
