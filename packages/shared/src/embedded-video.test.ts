import { describe, expect, it } from "vitest";
import { parseEmbeddedVideo, parseEmbeddedVideos } from "./embedded-video";

describe("parseEmbeddedVideo", () => {
  it.each([
    "https://www.youtube.com/watch?v=Xw0wI89x3fc",
    "https://youtube.com/watch?v=Xw0wI89x3fc&t=42s",
    "https://m.youtube.com/watch?v=Xw0wI89x3fc",
    "https://youtu.be/Xw0wI89x3fc?si=abc",
    "https://www.youtube.com/shorts/Xw0wI89x3fc",
    "https://www.youtube.com/embed/Xw0wI89x3fc",
    "https://www.youtube-nocookie.com/embed/Xw0wI89x3fc",
    "  https://www.youtube.com/live/Xw0wI89x3fc  ",
  ])("reads the YouTube id from %s", (url) => {
    expect(parseEmbeddedVideo(url)).toEqual({
      provider: "youtube",
      id: "Xw0wI89x3fc",
    });
  });

  it("reads public and unlisted Vimeo links", () => {
    expect(parseEmbeddedVideo("https://vimeo.com/1203014251")).toEqual({
      provider: "vimeo",
      id: "1203014251",
    });
    expect(
      parseEmbeddedVideo("https://vimeo.com/1203014251/a1b2c3d4e5"),
    ).toEqual({ provider: "vimeo", id: "1203014251", hash: "a1b2c3d4e5" });
    expect(
      parseEmbeddedVideo("https://player.vimeo.com/video/1203014251?h=a1b2c3"),
    ).toEqual({ provider: "vimeo", id: "1203014251", hash: "a1b2c3" });
  });

  it.each([
    "not a url",
    "javascript:alert(1)",
    "https://evil.example/watch?v=Xw0wI89x3fc",
    "https://youtube.com.evil.example/watch?v=Xw0wI89x3fc",
    "https://www.youtube.com/watch?v=short",
    "https://www.youtube.com/watch?v=Xw0wI89x3fc%22onload%3D",
    "https://www.youtube.com/@channel",
    "https://vimeo.com/channels/staffpicks",
    "ftp://vimeo.com/1203014251",
  ])("rejects %s", (url) => {
    expect(parseEmbeddedVideo(url)).toBeNull();
  });

  it("drops a Vimeo hash that is not hexadecimal", () => {
    expect(parseEmbeddedVideo("https://vimeo.com/123/<script>")).toEqual({
      provider: "vimeo",
      id: "123",
    });
  });
});

describe("parseEmbeddedVideos", () => {
  it("skips unsupported links and duplicates", () => {
    expect(
      parseEmbeddedVideos([
        "https://www.youtube.com/watch?v=Xw0wI89x3fc",
        "https://youtu.be/Xw0wI89x3fc",
        "https://example.com/video",
        "https://vimeo.com/1203014251",
      ]),
    ).toEqual([
      { provider: "youtube", id: "Xw0wI89x3fc" },
      { provider: "vimeo", id: "1203014251" },
    ]);
  });

  it("caps the number of videos", () => {
    const urls = Array.from(
      { length: 5 },
      (_, index) => `https://vimeo.com/${index + 1}`,
    );
    expect(parseEmbeddedVideos(urls, 2)).toHaveLength(2);
  });
});
