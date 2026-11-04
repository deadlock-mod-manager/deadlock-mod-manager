import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

const warn = mock(() => {});
mock.module("@/lib/logger", () => ({
  default: { withError: () => ({ warn }) },
}));
mock.module("@/lib/store", () => ({ usePersistedStore: () => 50 }));

const { useGlobalAudio, useGlobalAudioStore } =
  await import("./use-global-audio");

const audio = {
  src: "",
  volume: 1,
  load: mock(() => {}),
  play: mock(() => Promise.resolve()),
  pause: mock(() => {}),
} satisfies Pick<
  HTMLAudioElement,
  "src" | "volume" | "load" | "play" | "pause"
>;

let controls: ReturnType<typeof useGlobalAudio> | undefined;

function AudioControls({ modId }: { modId: string }) {
  controls = useGlobalAudio(modId, `${modId}.mp3`);
  return null;
}

function renderControls(modId: string) {
  renderToStaticMarkup(<AudioControls modId={modId} />);
  if (!controls) throw new Error("Audio controls did not render");
  return controls;
}

beforeEach(() => {
  controls = undefined;
  warn.mockClear();
  audio.load.mockClear();
  audio.pause.mockClear();
  audio.play.mockReset().mockResolvedValue(undefined);
  audio.src = "";
  audio.volume = 1;
  useGlobalAudioStore.getState().reset();
  Object.defineProperty(useGlobalAudioStore.getState(), "audioElement", {
    value: audio,
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  useGlobalAudioStore.getState().setAudioElement(null);
  useGlobalAudioStore.getState().reset();
});

describe("global audio playback", () => {
  it("sets the selected track and volume on successful playback", async () => {
    await renderControls("a").play();

    expect(audio.src).toBe("a.mp3");
    expect(audio.volume).toBe(0.5);
    expect(useGlobalAudioStore.getState().isPlaying).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("resets playback and warns when the current attempt fails", async () => {
    audio.play.mockRejectedValueOnce(new Error("Playback denied"));

    await renderControls("a").play();

    expect(useGlobalAudioStore.getState().isPlaying).toBe(false);
    expect(warn).toHaveBeenCalledWith("Audio preview failed to play");
  });

  it("keeps a newer track playing when the previous attempt rejects", async () => {
    const previous = Promise.withResolvers<void>();
    const current = Promise.withResolvers<void>();
    audio.play
      .mockReturnValueOnce(previous.promise)
      .mockReturnValueOnce(current.promise);

    const firstPlayback = renderControls("a").play();
    const secondPlayback = renderControls("b").play();
    previous.reject(new DOMException("Source changed", "AbortError"));
    await firstPlayback;

    expect(useGlobalAudioStore.getState().currentModId).toBe("b");
    expect(useGlobalAudioStore.getState().isPlaying).toBe(true);
    current.resolve();
    await secondPlayback;
    expect(useGlobalAudioStore.getState().isPlaying).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("keeps a replay of the same track playing when its earlier attempt rejects", async () => {
    const previous = Promise.withResolvers<void>();
    audio.play.mockReturnValueOnce(previous.promise);
    const track = renderControls("a");

    const firstPlayback = track.play();
    track.pause();
    await track.play();
    previous.reject(new DOMException("Playback paused", "AbortError"));
    await firstPlayback;

    expect(useGlobalAudioStore.getState().isPlaying).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores a pending attempt cancelled by pausing", async () => {
    const pending = Promise.withResolvers<void>();
    audio.play.mockReturnValueOnce(pending.promise);
    const track = renderControls("a");

    const playback = track.play();
    track.pause();
    pending.reject(new DOMException("Playback paused", "AbortError"));
    await playback;

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(useGlobalAudioStore.getState().isPlaying).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });
});
