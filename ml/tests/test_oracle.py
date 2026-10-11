from pathlib import Path

import pytest

from arbora_ml.oracle import parse_codes, verify_candidates


ROOT = Path(__file__).resolve().parents[2]


def test_typescript_oracle_parses_valid_and_invalid_minic() -> None:
    try:
        results = parse_codes(
            ["int main() { return 0; }", "int main() { return 0 }"],
            ROOT,
        )
    except FileNotFoundError as error:
        pytest.skip(str(error))
    assert results[0]["ok"] is True
    assert results[1]["ok"] is False
    assert results[1]["error_count"] > 0


def test_oracle_candidate_groups_preserve_order() -> None:
    results = verify_candidates(
        [["int main() { return 0; }", "int main() { return 0 }"]],
        ROOT,
    )
    assert len(results) == 1
    assert [item["ok"] for item in results[0]] == [True, False]
