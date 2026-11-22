import re
from pathlib import PurePosixPath

from tree_sitter_language_pack import get_parser


COMMENTS = {"comment", "line_comment", "block_comment"}
SHELLS = {
    b"bash": "bash",
    b"sh": "bash",
    b"pwsh": "powershell",
    b"powershell": "powershell",
    b"python": "python",
    b"python3": "python",
    b"node": "javascript",
}
ACTIONS_EXPRESSION = re.compile(rb"\$\{\{(?:'(?:''|[^'\r\n])*'|[^'\r\n])*?\}\}")
HELM_ACTION = re.compile(
    rb"""\{\{-?\s*/\*.*?\*/\s*-?\}\}|\{\{(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`|[^"'\x60])*?\}\}""",
    re.S,
)


def walk(node):
    stack = [node]
    while stack:
        item = stack.pop()
        yield item
        stack.extend(reversed(item.named_children))


def named(node, kinds):
    if node is None:
        return None
    if node.type in kinds:
        return node
    return next((c for c in node.named_children if c.type in kinds), None)


def source(data, node):
    return data[node.start_byte : node.end_byte] if node is not None else b""


def mapping(data, node):
    node = named(node, {"block_mapping", "flow_mapping"})
    if node is None:
        return {}
    return {
        source(data, item.child_by_field_name("key")).strip(
            b"'\x22"
        ): item.child_by_field_name("value")
        for item in node.named_children
        if item.type in {"block_mapping_pair", "flow_pair"}
    }


def sequence(node):
    node = named(node, {"block_sequence", "flow_sequence"})
    if node is None:
        return []
    return [
        next((c for c in item.named_children if c.type != "comment"), None)
        if item.type == "block_sequence_item"
        else item
        for item in node.named_children
        if item.type != "comment"
    ]


def shell_language(value):
    parts = value.strip(b"'\x22").split()
    return SHELLS.get(parts[0].rsplit(b"/", 1)[-1].lower()) if parts else None


def script_ranges(data, block, language, yaml_column, mask):
    if (
        block is None
        or not language
        or data[block.start_byte : block.start_byte + 1] != b"|"
    ):
        return
    body_start = data.find(b"\n", block.start_byte, block.end_byte)
    if body_start < 0:
        return
    body_start += 1
    rows = data[body_start : block.end_byte].split(b"\n")
    explicit_indent = re.search(
        rb"[1-9]", data[block.start_byte : body_start].split(b"#", 1)[0]
    )
    if explicit_indent:
        indent = yaml_column + int(explicit_indent[0])
    else:
        nonempty = next((line for line in rows if line.strip()), b"")
        indent = len(nonempty) - len(nonempty.lstrip(b" "))
    script, offsets = [], []
    position = body_start
    for row in rows:
        leading = min(indent, len(row) - len(row.lstrip(b" ")))
        script.append(row[leading:].removesuffix(b"\r"))
        offsets.append(position + leading)
        position += len(row) + 1

    script = mask(b"\n".join(script))
    for node in walk(get_parser(language).parse(script).root_node):
        if node.type not in COMMENTS:
            continue
        parent = node.parent
        while parent and not any(s in parent.type for s in ("heredoc", "here_string")):
            parent = parent.parent
        if parent:
            continue
        start_row, start_col = node.start_point
        end_row, end_col = node.end_point
        start, end = offsets[start_row] + start_col, offsets[end_row] + end_col
        yield start, start + len(data[start:end].rstrip(b"\r\n"))


def default_shell(data, context):
    defaults = mapping(data, context.get(b"defaults"))
    return mapping(data, defaults.get(b"run")).get(b"shell")


def runner_shell(data, runner):
    labels = [source(data, item) for item in sequence(runner)] or [source(data, runner)]
    if any(b"${{" in label for label in labels):
        return None
    labels = [label.strip(b"'\x22").lower() for label in labels]
    if any(label.startswith(b"windows") for label in labels):
        return "powershell"
    if any(
        any(platform in label for platform in (b"ubuntu", b"linux", b"macos"))
        for label in labels
    ):
        return "bash"
    return None


def workflow_ranges(data, root):
    def steps(step_list, defaults=(), fallback=None):
        for item in sequence(step_list):
            step = mapping(data, item)
            run = step.get(b"run")
            shell = next(
                (item for item in (step.get(b"shell"), *defaults) if item is not None),
                None,
            )
            language = shell_language(source(data, shell)) if shell else fallback
            sheet = named(item, {"block_mapping", "flow_mapping"})
            if run and sheet:
                yield from script_ranges(
                    data,
                    named(run, {"block_scalar"}),
                    language,
                    sheet.start_point.column,
                    lambda script: ACTIONS_EXPRESSION.sub(
                        lambda m: b"x" * len(m[0]), script
                    ),
                )
            uses = source(data, step.get(b"uses")).strip(b"'\x22").lower()
            if uses.startswith(b"actions/github-script@"):
                with_node = step.get(b"with")
                script = mapping(data, with_node).get(b"script")
                sheet = named(with_node, {"block_mapping", "flow_mapping"})
                if sheet:
                    yield from script_ranges(
                        data,
                        named(script, {"block_scalar"}),
                        "javascript",
                        sheet.start_point.column,
                        lambda script: ACTIONS_EXPRESSION.sub(
                            lambda m: b"x" * len(m[0]), script
                        ),
                    )

    for document in root.named_children:
        body = mapping(data, named(document, {"block_node", "flow_node"}))
        workflow_default = default_shell(data, body)
        for job_node in mapping(data, body.get(b"jobs")).values():
            job = mapping(data, job_node)
            yield from steps(
                job.get(b"steps"),
                (default_shell(data, job), workflow_default),
                runner_shell(data, job.get(b"runs-on")),
            )
        runs = mapping(data, body.get(b"runs"))
        if source(data, runs.get(b"using")).strip(b"'\x22") == b"composite":
            yield from steps(runs.get(b"steps"))


def mask_helm(data):
    masked = HELM_ACTION.sub(lambda m: re.sub(rb"[^\r\n]", b"X", m[0]), data)
    return re.sub(
        rb"(?m)^[ \t]*X+[ \t]*\r?$", lambda m: re.sub(rb"[^\r\n]", b" ", m[0]), masked
    )


def helm_ranges(data):
    masked = mask_helm(data)
    root = get_parser("yaml").parse(masked).root_node
    for match in HELM_ACTION.finditer(data):
        if re.match(rb"\{\{-?\s*/\*", match[0]):
            yield match.span()
    for item in walk(root):
        if (
            item.type == "comment"
            and data[item.start_byte : item.start_byte + 1] == b"#"
        ):
            yield item.start_byte, item.end_byte
        if item.type != "block_mapping" or not any(
            source(masked, child.child_by_field_name("key")).strip(b"'\x22")
            == b"command"
            for child in item.named_children
        ):
            continue
        fields = mapping(masked, item)
        arguments = sequence(fields.get(b"command")) + sequence(fields.get(b"args"))
        if len(arguments) < 3:
            continue
        language = shell_language(source(masked, arguments[0]))
        flags = source(masked, arguments[1]).strip(b"'\x22")
        expected_flag = {
            "bash": rb"-[a-z]*c[a-z]*",
            "powershell": rb"(?i:-(?:c|command))",
            "python": rb"-c",
            "javascript": rb"(?:-e|--eval)",
        }.get(language)
        if expected_flag and re.fullmatch(expected_flag, flags):
            script = named(arguments[2], {"block_scalar"})
            if script:
                column = script.parent.parent.start_point.column
                yield from script_ranges(data, script, language, column, mask_helm)


def embedded_ranges(file: str, data: bytes):
    path = PurePosixPath(file.replace("\\", "/"))
    if path.suffix not in {".yaml", ".yml"}:
        return
    if path.parts[:2] == (".github", "workflows") or (
        path.parts[:2] == (".github", "actions") and path.stem == "action"
    ):
        yield from workflow_ranges(data, get_parser("yaml").parse(data).root_node)
    elif "templates" in path.parts and path.parts[0] in {"infrastructure", "charts"}:
        yield from helm_ranges(data)
