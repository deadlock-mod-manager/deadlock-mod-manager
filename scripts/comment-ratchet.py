import argparse
import ast
import hashlib
import json
import os
import re
import subprocess
import sys
from collections import Counter
from functools import cache
from pathlib import Path

from tree_sitter import Query, QueryCursor
from tree_sitter_language_pack import get_language, get_parser

from workflow_source import embedded_ranges


LANGUAGES = {
    ".ts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".rs": "rust",
    ".cs": "csharp",
    ".css": "css",
    ".html": "html",
    ".xml": "xml",
    ".csproj": "xml",
    ".svg": "xml",
    ".nix": "nix",
    ".toml": "toml",
    ".py": "python",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".sql": "sql",
    ".sh": "bash",
    ".bash": "bash",
    ".json": "json",
    ".jsonc": "json",
    ".code-workspace": "json",
    ".desktop": "ini",
}

FILENAMES = {
    "Dockerfile": "dockerfile",
    "PKGBUILD": "bash",
    ".envrc": "bash",
    ".dockerignore": "gitignore",
    ".gitignore": "gitignore",
    ".gitattributes": "gitattributes",
    ".npmrc": "ini",
    "CODEOWNERS": "gitignore",
    "pr-wait": "python",
}

EXCLUDED = (
    ".agents/skills/impeccable/",
    "apps/desktop/src-tauri/bindings/",
    "apps/desktop/src-tauri/gen/",
    "packages/vpkmanager/src/source2/",
    "packages/database/drizzle/",
    "apps/desktop/public/tracker-sites/",
    "apps/desktop/public/brand/",
    "docs/assets/sponsors/",
)

DIRECTIVE = re.compile(
    r"^(?:eslint(?:-|\s)|oxlint(?:-|\s)|oxfmt-ignore|@ts-(?:expect-error|ignore|nocheck|check)"
    r"|biome-ignore|prettier-ignore|istanbul ignore|c8 ignore|v8 ignore|noqa\b|type:\s*ignore"
    r"|pylint:|(?:end)?region\b|go:|pragma\b|\+build\b|<reference\b|<amd-"
    r"|shellcheck\b|syntax=|escape=|check=|yaml-language-server:|sourceMappingURL="
    r"|sourceURL=|[@#]__PURE__|[@#]__NO_SIDE_EFFECTS__|@jsx\b|@jsxImportSource\b"
    r"|webpack\w*:|vite-ignore|@vite-ignore|@refresh\b|coding[:=]|-\*- coding)"
)


def git_paths(*args):
    data = subprocess.check_output(["git", "ls-files", "-z", *args])
    return {os.fsdecode(name) for name in data.split(b"\0") if name}


def language_for(file):
    path = Path(file)
    if (
        file.startswith(EXCLUDED)
        or set(path.parts)
        & {"node_modules", "vendor", "dist", "build", "target", "generated"}
        or ".generated." in path.name
        or ".gen." in path.name
        or path.name.startswith("generated_")
        or path.name in {"pnpm-lock.yaml", "next-env.d.ts"}
        or file.endswith("/src/version.ts")
        and file.split("/")[1] in {"api", "auth", "bot", "lockdex", "mirror-service"}
    ):
        return None
    if (
        file.startswith("apps/desktop/src-tauri/migrations/gamebanana_catalog/")
        and path.parent.name <= "20261111000000_fts_update_only_on_change"
    ):
        return None
    return FILENAMES.get(path.name, LANGUAGES.get(path.suffix))


@cache
def grammar(language):
    syntax = get_language(language)
    types = {
        "comment",
        "Comment",
        "line_comment",
        "block_comment",
        "html_comment",
        "marginalia",
    }
    kinds = {
        syntax.node_kind_for_id(i)
        for i in range(syntax.node_kind_count)
        if syntax.node_kind_is_named(i)
    }
    clauses = [f"({kind}) @comment" for kind in sorted(types & kinds)]
    return get_parser(language), Query(syntax, "\n".join(clauses))


def protected(text, file):
    if re.match(r"^/\*[*!]?\s*(?:@license|@preserve|MIT License)\b", text, re.I):
        return True
    if text.startswith("#!") or re.search(
        r"SPDX-(?:License-Identifier|FileCopyrightText):|\bcopyright\s+(?:\(c\)\s*)?\d{4}",
        text,
        re.I,
    ):
        return True
    body = text.lstrip("/#*!- ").strip()
    if (
        DIRECTIVE.match(body)
        or text.lstrip("/ *").startswith("#region")
        or text.startswith("/// <reference")
    ):
        return True
    if file.endswith((".js", ".mjs", ".cjs")) and text.startswith("/**"):
        return bool(
            re.search(
                r"@(?:type(?:def)?|template|satisfies|import)\b|@(?:param|returns?)\s*\{",
                text,
            )
        )
    return False


def python_docstrings(data):
    offsets = [0]
    for source_line in data.splitlines(keepends=True):
        offsets.append(offsets[-1] + len(source_line))
    for node in ast.walk(ast.parse(data)):
        if (
            isinstance(
                node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)
            )
            and ast.get_docstring(node, clean=False) is not None
        ):
            expr = node.body[0]
            yield (
                offsets[expr.lineno - 1] + expr.col_offset,
                offsets[expr.end_lineno - 1] + expr.end_col_offset,
            )


def comments(file, data, language):
    parser, query = grammar(language)
    tree = parser.parse(data)
    captures = QueryCursor(query).captures(tree.root_node)
    ranges = {(node.start_byte, node.end_byte) for node in captures.get("comment", [])}
    if language == "python":
        ranges.update(python_docstrings(data))
    if language == "yaml":
        ranges.update(embedded_ranges(file, data))
    previous = None
    for start, end in sorted(ranges):
        text = data[start:end].rstrip(b"\r\n").decode()
        end = start + len(text.encode())
        line = data.count(b"\n", 0, start) + 1
        if protected(text, file):
            if previous:
                yield previous
            previous = None
            continue
        marker = re.match(r"(?:///|//!|//|--|#)", text)
        if (
            marker
            and previous
            and previous["marker"] == marker[0]
            and re.fullmatch(rb"[ \t]*\r?\n[ \t]*", data[previous["end"] : start])
            and not data[
                data.rfind(b"\n", 0, previous["start"]) + 1 : previous["start"]
            ].strip()
        ):
            previous.update(
                end=end,
                text=data[previous["start"] : end].decode(),
                lines=line - previous["line"] + 1,
            )
            continue
        if previous:
            yield previous
        previous = dict(
            file=file,
            line=line,
            text=text,
            lines=text.count("\n") + 1,
            start=start,
            end=end,
            marker=marker[0] if marker else None,
        )
    if previous:
        yield previous


def inventory():
    entries = []
    total_lines = 0
    paths = git_paths("--cached", "--others", "--exclude-standard") - git_paths(
        "--cached", "--ignored", "--exclude-standard"
    )
    for file in sorted(paths):
        language = language_for(file)
        if not language or not Path(file).is_file() or Path(file).is_symlink():
            continue
        data = Path(file).read_bytes()
        total_lines += len(data.splitlines())
        entries.extend(comments(file, data, language))
    return entries, total_lines


def fingerprint(line):
    return hashlib.sha256(line.strip().encode()).hexdigest()[:24]


def check(entries, baseline, update):
    allowed = json.loads(baseline.read_text(encoding="utf-8"))
    current = {}
    remaining = {file: Counter(values) for file, values in allowed.items()}
    added = False
    for entry in entries:
        file = entry["file"]
        budget = remaining.setdefault(file, Counter())
        for offset, line in enumerate(entry["text"].splitlines()):
            digest = fingerprint(line)
            current.setdefault(file, []).append(digest)
            if budget[digest] == 0:
                print(f"{file}:{entry['line'] + offset}: {line.strip()}")
                added = True
            else:
                budget[digest] -= 1
    if added:
        return 1
    for values in current.values():
        values.sort()
    if current != allowed:
        if not update:
            print(
                "Comment allowances fell. Run python scripts/comment-ratchet.py --update."
            )
            return 1
        baseline.write_text(
            json.dumps(current, sort_keys=True, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
    return 0


def check_base(base, baseline):
    if not re.fullmatch("[a-fA-F0-9]{40,64}", base):
        raise ValueError("Expected a Git commit SHA")
    name = baseline.as_posix()
    if not subprocess.check_output(["git", "ls-tree", base, "--", name]):
        return True
    previous = json.loads(subprocess.check_output(["git", "show", f"{base}:{name}"]))
    current = json.loads(baseline.read_text(encoding="utf-8"))
    for file, values in current.items():
        if Counter(values) - Counter(previous.get(file, [])):
            print(f"{file}: comment allowance grew relative to {base}")
            return False
    return True


def main():
    cli = argparse.ArgumentParser()
    group = cli.add_mutually_exclusive_group()
    group.add_argument("--inventory", type=Path)
    group.add_argument("--update", action="store_true")
    args = cli.parse_args()
    entries, total_lines = inventory()
    if args.inventory:
        args.inventory.write_text(
            json.dumps(entries, ensure_ascii=False), encoding="utf-8"
        )
        print(f"{len(entries)} comment blocks in {total_lines} source lines")
        return 0
    baseline = Path("scripts/comment-baseline.json")
    base = os.getenv("COMMENT_BASE_SHA")
    if base and base.strip("0") and not check_base(base, baseline):
        return 1
    return check(entries, baseline, args.update)


if __name__ == "__main__":
    sys.exit(main())
