from arbora_ml.tokenization import (
    MINIC_TOKENS,
    add_minic_special_tokens,
    escape_source,
    unescape_source,
    wrap_source,
    tokenizer_round_trip,
)


class FakeTokenizer:
    def __init__(self) -> None:
        self.specials: list[str] = []

    def add_special_tokens(self, values: dict[str, list[str]]) -> int:
        new = [item for item in values["additional_special_tokens"] if item not in self.specials]
        self.specials.extend(new)
        return len(new)

    def encode_decode_round_trip(self, source: str) -> str:
        encoded = escape_source(source).split()
        joined = " ".join(encoded)
        return unescape_source(joined)

    def encode(self, source: str, add_special_tokens: bool = False) -> list[int]:
        del add_special_tokens
        return [ord(character) for character in source]

    def decode(
        self,
        tokens: list[int],
        skip_special_tokens: bool = False,
        clean_up_tokenization_spaces: bool = False,
    ) -> str:
        del skip_special_tokens, clean_up_tokenization_spaces
        return "".join(chr(token) for token in tokens)


def test_whitespace_encoding_is_lossless_for_one_thousand_programs() -> None:
    tokenizer = FakeTokenizer()
    assert add_minic_special_tokens(tokenizer) == len(MINIC_TOKENS)
    for index in range(1000):
        source = (
            f"int main_{index}() {{\n"
            f"    int value = {index};\n"
            "\treturn value < 100 && value != 0;\n}"
        )
        assert tokenizer.encode_decode_round_trip(source) == source
        assert unescape_source(escape_source(source)) == source
        assert tokenizer_round_trip(tokenizer, source)
    literal = 'string label = "<ARBORA_SP> <ARBORA_NL>";'
    assert unescape_source(escape_source(literal)) == literal


def test_task_prefix_and_special_tokens() -> None:
    assert wrap_source("repair", "a\n  b") == "repair: a<ARBORA_NL><ARBORA_SP><ARBORA_SP>b"
