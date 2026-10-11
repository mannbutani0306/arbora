from __future__ import annotations

from types import SimpleNamespace
from typing import Any

from fastapi.testclient import TestClient

from ml.serve.app import ModelBundle, create_app


class StubTokenizer:
    eos_token_id = None
    pad_token_id = None
    bos_token = None
    eos_token = None
    pad_token = None

    def __call__(self, text: str, **_: Any) -> dict[str, list[list[int]]]:
        return {"input_ids": [[1, 2, 3]]}

    def decode(self, values: list[int], **_: Any) -> str:
        if values == [4]:
            return "int main() { return 0; }"
        return "(Program)"


class StubModel:
    def parameters(self) -> list[Any]:
        return []

    def generate(self, **kwargs: Any) -> Any:
        if kwargs.get("return_dict_in_generate"):
            return SimpleNamespace(
                sequences=[[4], [4]],
                sequences_scores=[-0.1, -0.2],
            )
        return [[5]]


def test_health_and_repair_return_stub_candidates() -> None:
    models = ModelBundle(
        StubModel(), StubTokenizer(), StubModel(), StubTokenizer(),
        "org/repair", "org/ast", "test-revision",
    )
    with TestClient(create_app(lambda: models)) as client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["models"]["repair"] == "org/repair"

        response = client.post("/repair", json={"code": "int main() {}", "num_return": 2})
        assert response.status_code == 200
        assert len(response.json()["candidates"]) == 2
        assert response.json()["candidates"][0]["score"] == -0.1


def test_ast_validity_checks_output_structure() -> None:
    models = ModelBundle(
        StubModel(), StubTokenizer(), StubModel(), StubTokenizer(),
        "org/repair", "org/ast", "test-revision",
    )
    with TestClient(create_app(lambda: models)) as client:
        result = client.post("/ast", json={"code": "int main() {}"}).json()
        assert result["ast_bracketed"] == "(Program)"
        assert result["is_valid"] is True


def test_body_limit_and_beam_bounds_are_rejected() -> None:
    models = ModelBundle(
        StubModel(), StubTokenizer(), StubModel(), StubTokenizer(),
        "org/repair", "org/ast", "test-revision",
    )
    with TestClient(create_app(lambda: models)) as client:
        assert client.post("/repair", json={"code": "x", "num_beams": 9}).status_code == 422
        response = client.post(
            "/repair",
            content=b'{"code":"' + b"x" * 9000 + b'"}',
            headers={"Content-Type": "application/json"},
        )
        assert response.status_code == 413
