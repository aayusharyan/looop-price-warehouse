"""Verify the exit codes the automated collection depends on."""

import pytest

from looop_price_collector import cli


def run_collect(monkeypatch, result: dict, argv: list[str]) -> None:
    """Invoke the collect command against a prepared collection result."""
    monkeypatch.setattr(cli, "Config", lambda: object())
    monkeypatch.setattr(cli, "collect", lambda _: result)
    args = cli.build_parser().parse_args(argv)
    args.func(args)


def test_correction_exits_with_its_own_code(monkeypatch) -> None:
    """Signal a corrected price separately from an outright failure."""
    result = {"status": "corrected", "corrections": [{"area": "03"}]}

    with pytest.raises(SystemExit) as exit_info:
        run_collect(monkeypatch, result, ["collect", "--fail-on-correction"])

    assert exit_info.value.code == cli.EXIT_CORRECTION


def test_correction_is_only_fatal_when_requested(monkeypatch) -> None:
    """Keep interactive runs successful unless the caller opts in."""
    result = {"status": "corrected", "corrections": [{"area": "03"}]}

    run_collect(monkeypatch, result, ["collect"])


def test_clean_collection_succeeds(monkeypatch) -> None:
    """Return success when no already published price changed."""
    result = {"status": "stored", "corrections": []}

    run_collect(monkeypatch, result, ["collect", "--fail-on-correction"])
