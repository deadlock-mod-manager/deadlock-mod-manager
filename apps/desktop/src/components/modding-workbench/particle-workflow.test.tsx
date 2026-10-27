import { expect, mock, test } from "bun:test";
import { createInstance } from "i18next";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactElement,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import {
  emptyParticleColorDraft,
  planParticleColors,
  sharedParticleColors,
} from "@/lib/particle-colors";
import en from "@/locales/en.json";
import type { ModdingParticleFile } from "@/types/generated/ModdingParticleFile";

mock.module("@deadlock-mods/ui/components/button", () => ({
  Button: ({
    children,
    disabled,
    onClick,
  }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));
mock.module("@deadlock-mods/ui/components/input", () => ({
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
mock.module("@deadlock-mods/ui/components/color-picker", () => ({
  ColorPicker: () => null,
}));
mock.module("@deadlock-mods/ui/components/slider", () => ({
  Slider: () => null,
}));
mock.module("./particle-palettes", () => ({ ParticlePalettes: () => null }));
mock.module("./particle-color-sampler", () => ({
  ParticleColorSampler: () => null,
}));

const { ParticleColorPane } = await import("./particle-color-pane");
const { WorkbenchGuide } = await import("./workbench-guide");

async function render(element: ReactElement) {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{element}</I18nextProvider>,
  );
}

function particle(path: string): ModdingParticleFile {
  return {
    path,
    text: "source",
    fingerprint: path,
    diagnostic: null,
    colors: [
      {
        path: "m_ConstantColor",
        rgb: [255, 100, 50],
        alpha: 123,
        normalized: false,
      },
    ],
  };
}

test("batch review shows exact affected files and distinguishes all-fields action", async () => {
  const files = [
    particle("particles/a.vpcf"),
    particle("particles/b.vpcf"),
    { ...particle("particles/empty.vpcf"), colors: [] },
  ];
  const groups = sharedParticleColors(files, 0);
  const html = await render(
    <ParticleColorPane
      file={files[0]}
      files={files}
      shared
      busy={false}
      draft={{
        ...emptyParticleColorDraft(),
        selection: "#ff6432",
        hex: "#112233",
      }}
      groups={groups}
      plan={planParticleColors(files, [17, 34, 51])}
      onDraft={() => {}}
      onApply={() => {}}
      onPickPreview={() => {}}
    />,
  );
  expect(html).toContain("Recolor all 3 selected files");
  expect(html).toContain("Apply to 2 file drafts");
  expect(html).toContain("particles/a.vpcf");
  expect(html).toContain("particles/b.vpcf");
  expect(html).toContain("#ff6432");
  expect(html).toContain("#112233");
  expect(html).toContain("Proposed color change");
  expect(html).not.toContain("Apply to 3 file drafts");
});

test("unchanged color offers no apply action", async () => {
  const files = [particle("particles/a.vpcf"), particle("particles/b.vpcf")];
  const html = await render(
    <ParticleColorPane
      file={files[0]}
      files={files}
      shared
      busy={false}
      draft={{
        ...emptyParticleColorDraft(),
        selection: "#ff6432",
        hex: "#ff6432",
      }}
      groups={sharedParticleColors(files, 0)}
      plan={planParticleColors(files, [255, 100, 50])}
      onDraft={() => {}}
      onApply={() => {}}
      onPickPreview={() => {}}
    />,
  );
  expect(html).not.toContain("Apply to 2 file drafts");
});

test("guide describes the workflow and keeps model editing planned", async () => {
  const html = await render(<WorkbenchGuide expanded />);
  expect(html).toContain("<details");
  expect(html).toContain('open=""');
  for (const step of ["Open", "Edit", "Preview", "Compile", "Test"])
    expect(html).toContain(step);
  expect(html).toContain("Model editing is planned.");
});
