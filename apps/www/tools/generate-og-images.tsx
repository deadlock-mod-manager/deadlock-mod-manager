import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { OG_CARDS, type OgCard, ogCardImagePath } from "../src/utils/og-cards";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const WIDTH = 1200;
const HEIGHT = 630;

const CREAM = "#ebdbc3";
const GOLD = "#d4af37";
const MUTED = "#9b928a";

const geist = (weight: number) =>
  readFile(
    require.resolve(
      `@fontsource/geist/files/geist-latin-${weight}-normal.woff`,
    ),
  );

const [forevsBold, geistRegular, geistMedium, logoSvg] = await Promise.all([
  readFile(join(ROOT, "src/assets/fonts/primary/forevsdemo-bold.otf")),
  geist(400),
  geist(500),
  readFile(join(ROOT, "public/favicon.svg")),
]);

const logo = `data:image/svg+xml;base64,${logoSvg.toString("base64")}`;

const Card = ({ card }: { card: OgCard }) => (
  <div
    style={{
      width: WIDTH,
      height: HEIGHT,
      display: "flex",
      position: "relative",
      overflow: "hidden",
      backgroundColor: "#110f0e",
      fontFamily: "Geist",
    }}>
    <img
      src={logo}
      width={620}
      height={620}
      style={{ position: "absolute", right: -170, top: 5, opacity: 0.07 }}
    />
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        width: "100%",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <img src={logo} width={56} height={56} />
        <span style={{ fontFamily: "Forevs Demo", fontSize: 30, color: CREAM }}>
          Deadlock Mod Manager
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 940 }}>
        <span
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: GOLD,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}>
          {card.eyebrow}
        </span>
        <span
          style={{
            marginTop: 18,
            fontFamily: "Forevs Demo",
            fontSize: card.title.length > 30 ? 66 : 80,
            lineHeight: 1.05,
            color: CREAM,
            textWrap: "balance",
          }}>
          {card.title}
        </span>
        <span
          style={{
            marginTop: 26,
            fontSize: 30,
            lineHeight: 1.4,
            color: MUTED,
            maxWidth: 860,
          }}>
          {card.tagline}
        </span>
      </div>
      <span style={{ fontSize: 22, color: MUTED }}>deadlockmods.app</span>
    </div>
  </div>
);

const render = async (card: OgCard) => {
  const svg = await satori(<Card card={card} />, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Forevs Demo", data: forevsBold, weight: 700 },
      { name: "Geist", data: geistRegular, weight: 400 },
      { name: "Geist", data: geistMedium, weight: 500 },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } })
    .render()
    .asPng();
};

await mkdir(join(ROOT, "public/og"), { recursive: true });

for (const card of Object.values(OG_CARDS)) {
  const file = join(ROOT, "public", ogCardImagePath(card));
  await writeFile(file, await render(card));
  console.log(`wrote ${ogCardImagePath(card)}`);
}
