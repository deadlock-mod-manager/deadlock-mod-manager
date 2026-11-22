import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))
ratchet = runpy.run_path(str(SCRIPTS / "comment-ratchet.py"))


class CommentRatchetTest(unittest.TestCase):
    def scan(self, file, text):
        language = ratchet["language_for"](file)
        return list(ratchet["comments"](file, text.encode(), language))

    def test_directives_literals_and_utf8_offsets(self):
        source = 'const url = "https://例.com/*path*/"; // retained\r\n// oxlint-disable custom/rule\r\n'
        (entry,) = self.scan("app.ts", source)
        self.assertEqual(source.encode()[entry["start"] : entry["end"]], b"// retained")

    def test_python_docstrings(self):
        source = '("docs")\nclass C:\n    "joined" " string"\n    def f(self): f"runtime {call()}"\n'
        self.assertEqual([x["line"] for x in self.scan("test.py", source)], [1, 3])

    def test_rust_raw_string_and_nested_comments(self):
        entries = self.scan(
            "lib.rs", 'let src = r#"/* data */"#; /* outer /* nested */ */'
        )
        self.assertEqual([x["text"] for x in entries], ["/* outer /* nested */ */"])

    def test_workflow_shell_and_heredocs(self):
        source = """jobs:
  build:
    runs-on: windows-latest
    steps:
      - run: |
          $value = @'
          # data
          '@
          # PowerShell note
      - shell: bash
        run: |
          cat <<'END'
          # data
          END
          # Bash note
"""
        entries = self.scan(".github/workflows/check.yml", source.replace("\n", "\r\n"))
        self.assertEqual(
            [x["text"] for x in entries], ["# PowerShell note", "# Bash note"]
        )

    def test_helm_comments_after_template_actions(self):
        source = '{{- if .Values.enabled }}\nname: "{{ .Chart.Name }} # data"\n# note\n{{- end }}\n'
        entries = self.scan("infrastructure/templates/test.yml", source)
        self.assertEqual([x["text"] for x in entries], ["# note"])

    def test_new_comments_and_monotonic_update(self):
        original = self.scan("app.ts", "// one\n// old\n")
        with (
            tempfile.TemporaryDirectory() as directory,
            contextlib.redirect_stdout(io.StringIO()),
        ):
            baseline = Path(directory) / "baseline.json"
            baseline.write_text(
                json.dumps(
                    {
                        "app.ts": sorted(
                            ratchet["fingerprint"](line)
                            for line in ("// one", "// old")
                        )
                    }
                )
            )
            check = ratchet["check"]
            self.assertEqual(check(original, baseline, False), 0)
            self.assertEqual(
                check(self.scan("app.ts", "// one\n// two\n"), baseline, True), 1
            )
            self.assertEqual(check(self.scan("new.ts", "// one"), baseline, True), 1)
            self.assertEqual(check(self.scan("app.ts", "// one"), baseline, True), 0)
            self.assertEqual(check(original, baseline, True), 1)
            self.assertEqual(check([], baseline, False), 1)
            self.assertEqual(check([], baseline, True), 0)
            self.assertEqual(json.loads(baseline.read_text()), {})


if __name__ == "__main__":
    unittest.main()
