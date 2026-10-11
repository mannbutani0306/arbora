import pytest

from arbora_ml.data import (
    assert_no_test_train_leakage,
    check_splits,
    make_task_rows,
)


def fixture_record(identifier: str, code: str) -> dict[str, object]:
    return {
        "id": identifier,
        "program_id": identifier,
        "code": code,
        "tokens": code.split(),
        "ast_bracketed": "(Program)",
        "size_class": "small",
    }


def test_repair_task_pairs_corrupt_source_to_ground_truth() -> None:
    clean = [fixture_record("p1", "int main ( ) { return 0 ; }")]
    damaged = [{
        "id": "p1_corrupt_0",
        "original": clean[0]["code"],
        "corrupted": "int main ( ) { return 0 }",
        "error_type": "delete",
        "token_index": 7,
    }]
    rows, counts = make_task_rows("repair", clean, damaged)
    assert counts["kept"] == 1
    assert rows[0]["target"] == clean[0]["code"]
    assert rows[0]["input_text"].startswith("repair: ")


def test_ast_task_uses_parser_bracketed_ast() -> None:
    rows, _ = make_task_rows("ast", [fixture_record("p1", "int main ( ) { return 0 ; }")])
    assert rows[0]["target"] == "(Program)"
    assert rows[0]["input_text"].startswith("ast: ")


def test_program_id_and_normalized_code_cannot_cross_splits() -> None:
    check_splits({
        "train": [fixture_record("train_1", "int main(){return 0;}")],
        "test": [fixture_record("test_1", "int main(){return 1;}")],
    })
    with pytest.raises(ValueError, match="Program id"):
        check_splits({
            "train": [fixture_record("same", "int main(){return 0;}")],
            "test": [fixture_record("same", "int main(){return 1;}")],
        })
    with pytest.raises(ValueError, match="Normalized code"):
        check_splits({
            "train": [fixture_record("p1", "int main(){return 0;}")],
            "test": [fixture_record("p2", "int main ( ) { return 0 ; }")],
        })


def test_test_code_is_checked_against_training_set() -> None:
    assert_no_test_train_leakage(["int main(){return 0;}"], ["int main(){return 1;}"])
    with pytest.raises(ValueError, match="leakage"):
        assert_no_test_train_leakage(["int main(){return 0;}"], ["int main ( ) { return 0 ; }"])
