"""Testes do dominio do modulo <module> — regras e validacao, sem I/O."""

from __future__ import annotations

import pytest

from core.domain import ValidationError, build_record
from core.engine import generate_artifact
from tests.fixtures import record_example

VALID_STATUSES = ["draft", "active", "closed"]
INSTANT = "2024-01-01T00:00:00.000Z"


def test_builds_with_first_status_when_none_given() -> None:
    entry = build_record({"title": "Example"}, VALID_STATUSES, "10001", INSTANT)
    assert entry.status == "draft"
    assert entry.hash == "10001"


def test_trims_whitespace_around_title() -> None:
    entry = build_record({"title": "  Example  "}, VALID_STATUSES, "10001", INSTANT)
    assert entry.title == "Example"


def test_rejects_empty_title() -> None:
    with pytest.raises(ValidationError):
        build_record({"title": "   "}, VALID_STATUSES, "10001", INSTANT)


def test_rejects_status_outside_vocabulary() -> None:
    with pytest.raises(ValidationError):
        build_record({"title": "X", "status": "invented"}, VALID_STATUSES, "10001", INSTANT)


def test_does_not_invent_instant_or_identifier() -> None:
    entry = build_record({"title": "X"}, VALID_STATUSES, "99999", INSTANT)
    assert (entry.hash, entry.created_at) == ("99999", INSTANT)


TEMPLATE = "<h1>{{title}}</h1><p>{{hash}}</p>"


def test_engine_is_deterministic() -> None:
    entry = record_example()
    assert generate_artifact(entry, TEMPLATE) == generate_artifact(entry, TEMPLATE)


def test_engine_escapes_html() -> None:
    entry = record_example(title="<script>alert(1)</script>")
    assert "<script>" not in generate_artifact(entry, TEMPLATE)


def test_engine_preserves_marker_without_value() -> None:
    assert generate_artifact(record_example(), "{{missing}}") == "{{missing}}"
