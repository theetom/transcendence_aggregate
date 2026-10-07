"""Prepare and compare private Django database exports without printing records."""

import argparse
from collections import Counter, defaultdict
import copy
import json
import os
from pathlib import Path
import sys


REGISTRY_MODELS = {"contenttypes.contenttype", "auth.permission"}
UNORDERED_RELATIONS = {
    "auth.user": {"groups", "user_permissions"},
    "auth.group": {"permissions"},
    "recipes.recipe": {"categories"},
    "users.userprofile": {"favorites"},
}


def load_fixture(path):
    with Path(path).open(encoding="utf-8") as stream:
        rows = json.load(stream)
    if not isinstance(rows, list):
        raise ValueError("Expected a Django fixture list.")
    for row in rows:
        if (
            not isinstance(row, dict)
            or not isinstance(row.get("model"), str)
            or not isinstance(row.get("fields"), dict)
            or "pk" not in row
        ):
            raise ValueError("Expected complete Django fixture records.")
    return rows


def prepare(rows, destination):
    prepared = copy.deepcopy(rows)
    for row in prepared:
        # Django migrations create these registries. Resolve them by their
        # natural names instead of conflicting SQLite-generated IDs.
        if row["model"] in REGISTRY_MODELS:
            del row["pk"]
    descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
        json.dump(prepared, stream, ensure_ascii=False)
        stream.write("\n")
    print(f"Prepared {len(prepared)} records; application IDs are retained.")


def canonical_rows(rows):
    models = defaultdict(Counter)
    for original in rows:
        row = copy.deepcopy(original)
        model = row["model"]
        if model in REGISTRY_MODELS:
            del row["pk"]
        for field in UNORDERED_RELATIONS.get(model, set()):
            values = row["fields"].get(field)
            if isinstance(values, list):
                row["fields"][field] = sorted(
                    values, key=lambda value: json.dumps(value, sort_keys=True)
                )
        models[model][json.dumps(row, sort_keys=True, ensure_ascii=False)] += 1
    return models


def compare(source, target):
    left = canonical_rows(source)
    right = canonical_rows(target)
    differences = []
    for model in sorted(set(left) | set(right)):
        print(f"{model}: SQLite={sum(left[model].values())}, "
              f"PostgreSQL={sum(right[model].values())}")
        if left[model] != right[model]:
            differences.append(model)
    if differences:
        print("Data differs in: " + ", ".join(differences), file=sys.stderr)
        return 1
    print("All exported records, application IDs and relationships match.")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    preparation = commands.add_parser("prepare")
    preparation.add_argument("source")
    preparation.add_argument("destination")
    comparison = commands.add_parser("compare")
    comparison.add_argument("source")
    comparison.add_argument("target")
    arguments = parser.parse_args()
    try:
        source = load_fixture(arguments.source)
        if arguments.command == "prepare":
            prepare(source, arguments.destination)
            return 0
        return compare(source, load_fixture(arguments.target))
    except (OSError, ValueError, TypeError):
        # Exception text can contain personal data or saved field values.
        print("Fixture operation failed; check the private files locally. "
              "No existing output was overwritten.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
