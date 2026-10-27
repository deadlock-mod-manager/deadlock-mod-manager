import { cpp } from "@codemirror/lang-cpp";
import { json } from "@codemirror/lang-json";
import CodeMirror, { EditorView, keymap } from "@uiw/react-codemirror";
import { useMemo } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

const editorTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "12px",
  },
  ".cm-scroller": { fontFamily: "var(--font-mono)", overflow: "auto" },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    borderRight: "1px solid var(--border)",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "var(--accent)" },
  "&.cm-focused": { outline: "none" },
  ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  ".cm-textfield, .cm-button": {
    background: "var(--background)",
    color: "var(--foreground)",
    border: "1px solid var(--border)",
  },
});
const sourceLanguage = cpp();
const decodedLanguage = json();

export function SourceCodeEditor({
  value,
  readOnly,
  compiled,
  onChange,
  onSave,
}: {
  value: string;
  readOnly: boolean;
  compiled: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const extensions = useMemo(
    () => [
      compiled ? decodedLanguage : sourceLanguage,
      editorTheme,
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            if (!readOnly) onSave();
            return true;
          },
        },
      ]),
      EditorView.contentAttributes.of({
        "aria-label": t("workbenchCode.editor"),
      }),
    ],
    [compiled, onSave, readOnly, t],
  );
  return (
    <CodeMirror
      className='h-full min-h-0 flex-1 overflow-hidden'
      height='100%'
      value={value}
      theme={resolvedTheme === "light" ? "light" : "dark"}
      extensions={extensions}
      readOnly={readOnly}
      editable={!readOnly}
      spellCheck={false}
      onChange={onChange}
    />
  );
}
