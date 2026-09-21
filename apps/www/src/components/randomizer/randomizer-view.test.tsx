import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { heroSchema } from "@/lib/deadlock-assets";
import { HeroWordmark } from "./randomizer-view";

const hero = heroSchema.parse({
  id: 1,
  class_name: "hero_magician",
  name: "Sinclair",
  images: {
    name_image:
      "https://assets-bucket.deadlock-api.com/assets-api-res/icons/sinclair.svg",
  },
});

describe("HeroWordmark", () => {
  it("loads the SVG using the same CORS mode as the mask", () => {
    const markup = renderToStaticMarkup(<HeroWordmark hero={hero} />);

    expect(markup).toContain('crossorigin="anonymous"');
  });
});
