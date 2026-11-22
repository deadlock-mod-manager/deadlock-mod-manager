import { describe, expect, it } from "bun:test";
import { encodeMessage, FRAME_PROTOCOL, parseFrameMessage } from "./index";

describe("parseFrameMessage", () => {
  it("reads calls the SDK sends", () => {
    const call = {
      type: "call",
      id: 7,
      command: "deploy",
      payloadJson: "{}",
    } as const;
    expect(parseFrameMessage(encodeMessage(call))).toEqual(call);
  });

  // The app page relays whatever this accepts, so anything else must be dropped.
  it("ignores messages that are not frame protocol calls", () => {
    for (const data of [
      { type: "call", id: 1, command: "status", payloadJson: "{}" },
      "not json",
      JSON.stringify({
        type: "call",
        id: 1,
        command: "status",
        payloadJson: "{}",
      }),
      JSON.stringify({ protocol: "other/1", type: "ready" }),
      JSON.stringify({
        protocol: FRAME_PROTOCOL,
        type: "call",
        id: "1",
        command: "status",
        payloadJson: "{}",
      }),
      JSON.stringify({
        protocol: FRAME_PROTOCOL,
        type: "call",
        id: 1,
        command: "status",
        payloadJson: {},
      }),
      JSON.stringify({
        protocol: FRAME_PROTOCOL,
        type: "result",
        id: 1,
        ok: true,
        value: "{}",
      }),
    ]) {
      expect(parseFrameMessage(data)).toBeNull();
    }
  });
});
