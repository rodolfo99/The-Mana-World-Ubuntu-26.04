#!/usr/bin/env python3
"""Genera/aplica un catálogo español solo sobre literales visibles de NPC.

No toca identificadores ni cadenas con marcado especial, variables o
secuencias de formato. El catálogo JSON permite revisar cada traducción.
"""
from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path
import re

LITERAL = re.compile(r'"((?:\\.|[^"\\])*)"')
DISPLAY = re.compile(
    r"(?<![.@$])\b(mes|menu|title|npctalk|announce|dispbottom|message|select)\b"
)
COMPLEX = re.compile(r"[@#%$<>]|\\(?!\")")
FUNCTION_ARGUMENT = re.compile(
    r"\b(?:getitemlink|getitemname|countitem|strcharinfo|getarg|"
    r"getvariableofnpc|itemlink|questlog)\s*\([^()]*$", re.I
)
SIMPLE_NAME = re.compile(r"^[A-Z][a-z]+$")
COMMON_WORDS = {
    "Yes", "No", "Hello", "Bye", "Goodbye", "Cancel", "Continue",
    "Close", "Next", "Leave", "Back", "Okay", "Ok", "Sure", "Thanks",
}


def mask_comments(line: str, in_block: bool) -> tuple[str, bool]:
    """Replace comments by spaces without shifting literal offsets."""
    out = list(line)
    i = 0
    in_string = False
    while i < len(line):
        if in_block:
            if line.startswith("*/", i):
                out[i:i + 2] = "  "
                in_block = False
                i += 2
            else:
                out[i] = " "
                i += 1
            continue
        if in_string:
            if line[i] == "\\" and i + 1 < len(line):
                i += 2
            elif line[i] == '"':
                in_string = False
                i += 1
            else:
                i += 1
            continue
        if line.startswith("//", i):
            out[i:] = " " * (len(line) - i)
            break
        if line.startswith("/*", i):
            out[i:i + 2] = "  "
            in_block = True
            i += 2
            continue
        if line[i] == '"':
            in_string = True
        i += 1
    return "".join(out), in_block


def parts(raw: str) -> tuple[str, str, str]:
    left, right = "", ""
    if raw.startswith('\\"'):
        raw, left = raw[2:], '\\"'
    if raw.endswith('\\"'):
        raw, right = raw[:-2], '\\"'
    return left, raw, right


def eligible(raw: str, before: str, names: set[str]) -> str | None:
    if FUNCTION_ARGUMENT.search(before):
        return None
    _, value, _ = parts(raw)
    core = value.strip()
    if (not core or not re.search("[A-Za-z]", core)
            or COMPLEX.search(core)
            or '\\"' in core
            or core.startswith("[") and core.endswith("]")
            or core in names
            or SIMPLE_NAME.fullmatch(core) and core not in COMMON_WORDS
            or re.search("[¿¡áéíóúñÁÉÍÓÚÑ]", core)):
        return None
    return core


def occurrences(npc_dir: Path):
    # Speaker names are quoted elsewhere in the same scripts.
    names = set()
    for file in npc_dir.rglob("*.txt"):
        for name in re.findall(r'mes\s+"\[([^]]+)\]"', file.read_text(errors="replace")):
            names.add(name)
    for file in sorted(npc_dir.rglob("*.txt")):
        if file.name == "game_rules.txt":
            continue  # Do not rewrite policy text or inactive old translations.
        in_block = False
        in_menu = False
        for number, line in enumerate(file.read_text(encoding="utf-8").splitlines(keepends=True), 1):
            masked, in_block = mask_comments(line, in_block)
            code_only = LITERAL.sub(lambda match: " " * len(match.group(0)), masked)
            display = DISPLAY.search(code_only)
            if display and display.group(1) == "menu":
                in_menu = True
            if display or in_menu:
                for match in LITERAL.finditer(masked):
                    key = eligible(match.group(1), masked[:match.start()], names)
                    if key:
                        yield file, number, match.span(1), match.group(1), key
            if in_menu and ";" in code_only:
                in_menu = False


def apply_catalog(npc_dir: Path, catalog: dict[str, str]) -> dict[str, int]:
    by_file = collections.defaultdict(lambda: collections.defaultdict(list))
    for file, number, span, original, key in occurrences(npc_dir):
        translation = catalog.get(key)
        if not translation or translation == key:
            continue
        # The source may already have been translated in an earlier run.
        if any(mark in translation for mark in ("\\n", "\\r", "\\t")):
            continue
        left, raw_core, right = parts(original)
        leading = raw_core[:len(raw_core) - len(raw_core.lstrip())]
        trailing = raw_core[len(raw_core.rstrip()):]
        new_value = translation.replace("\\", "\\\\").replace('"', '\\"')
        by_file[file][number].append((span, left + leading + new_value + trailing + right))
    changed = 0
    literals = 0
    for file, line_edits in by_file.items():
        lines = file.read_text(encoding="utf-8").splitlines(keepends=True)
        for line_number, edits in line_edits.items():
            line = lines[line_number - 1]
            for (start, end), value in sorted(edits, reverse=True):
                line = line[:start] + value + line[end:]
                literals += 1
            lines[line_number - 1] = line
        file.write_text("".join(lines), encoding="utf-8")
        changed += 1
    return {"files": changed, "literals": literals}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--npc-dir", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    counts = collections.Counter(key for *_, key in occurrences(args.npc_dir))
    catalog = json.loads(args.catalog.read_text(encoding="utf-8")) if args.catalog.exists() else {}
    print(json.dumps({"unique": len(counts), "occurrences": sum(counts.values()),
                      "translated_unique": len(set(counts) & set(catalog))}, ensure_ascii=False))
    if args.apply:
        print(json.dumps(apply_catalog(args.npc_dir, catalog), ensure_ascii=False))


if __name__ == "__main__":
    main()
