import { describe, expect, it } from "bun:test";
import {
  type BridgeRequest,
  type BridgeTransport,
  createPluginClient,
  decode,
  defineCommand,
  PluginCallError,
} from "./index";

type Status = { watching: boolean; builds: string[] };

type BridgeRejection = { code: string; message: string };

const decodeStatus: decode.Decoder<Status> = (value, path) => {
  const source = decode.object(value, path);
  return {
    watching: decode.field(source, "watching", decode.boolean, path),
    builds: decode.field(source, "builds", decode.array(decode.string), path),
  };
};

function recordingTransport(response: string) {
  const requests: BridgeRequest[] = [];
  const transport: BridgeTransport = async (request) => {
    requests.push(request);
    return response;
  };
  return { requests, transport };
}

async function rejectionOf(promise: Promise<Status>): Promise<PluginCallError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof PluginCallError) return error;
    throw error;
  }
  throw new Error("Expected the call to fail");
}

describe("createPluginClient", () => {
  it("sends only the command and JSON payload, and decodes the value", async () => {
    const { requests, transport } = recordingTransport(
      JSON.stringify({ ok: true, value: { watching: true, builds: ["a1"] } }),
    );
    const client = createPluginClient({ transport });

    const status = await client.status(decodeStatus);
    await client.deploy({ hash: "a1" }, decode.json);

    expect(status).toEqual({ watching: true, builds: ["a1"] });
    expect(requests).toEqual([
      { command: "status", payloadJson: "{}" },
      { command: "deploy", payloadJson: '{"hash":"a1"}' },
    ]);
  });

  it("surfaces a command error envelope with its code", async () => {
    const { transport } = recordingTransport(
      JSON.stringify({
        ok: false,
        error: { code: "no_build", message: "No build is ready." },
      }),
    );

    const error = await rejectionOf(
      createPluginClient({ transport }).status(decodeStatus),
    );

    expect(error.toJSON()).toEqual({
      name: "PluginCallError",
      source: "command",
      code: "no_build",
      message: "No build is ready.",
      command: "status",
    });
  });

  it.each([
    ["not json", "invalid_json"],
    ["[]", "invalid_envelope"],
    ['{"ok":true}', "invalid_envelope"],
    ['{"ok":false,"error":{"code":"x"}}', "invalid_envelope"],
    ['{"ok":"yes","value":1}', "invalid_envelope"],
  ])("rejects the malformed response %s", async (response, code) => {
    const { transport } = recordingTransport(response);

    const error = await rejectionOf(
      createPluginClient({ transport }).status(decodeStatus),
    );

    expect(error.source).toBe("protocol");
    expect(error.code).toBe(code);
  });

  it("rejects a value that does not match the decoder", async () => {
    const { transport } = recordingTransport(
      JSON.stringify({ ok: true, value: { watching: "yes", builds: [] } }),
    );

    const error = await rejectionOf(
      createPluginClient({ transport }).status(decodeStatus),
    );

    expect(error.source).toBe("protocol");
    expect(error.code).toBe("invalid_value");
    expect(error.message).toContain("$.watching");
  });

  it("normalizes host rejections into bridge errors", async () => {
    const rejections: [string | BridgeRejection, string, string][] = [
      ["Plugin is disabled", "bridge_error", "Plugin is disabled"],
      [
        { code: "permission_denied", message: "Access revoked" },
        "permission_denied",
        "Access revoked",
      ],
    ];

    for (const [rejection, code, message] of rejections) {
      const transport: BridgeTransport = () => Promise.reject(rejection);
      const error = await rejectionOf(
        createPluginClient({ transport }).status(decodeStatus),
      );
      expect(error.source).toBe("bridge");
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    }
  });

  it("refuses host-only and malformed command names without calling the host", async () => {
    const { requests, transport } = recordingTransport("{}");
    const client = createPluginClient({ transport });

    for (const name of ["tick", "Status", "set state", "../status", ""]) {
      const error = await rejectionOf(
        client.call({ name, encode: () => "{}", decode: decodeStatus }, {}),
      );
      expect(error.source).toBe("client");
    }
    expect(() => defineCommand("tick", decode.json)).toThrow(PluginCallError);
    expect(requests).toEqual([]);
  });

  it.each(["not json", "null", "[]", "1", '"text"'])(
    "rejects invalid encoded payload %s before transport",
    async (payloadJson) => {
      const { requests, transport } = recordingTransport("{}");
      const client = createPluginClient({ transport });
      const error = await rejectionOf(
        client.call(
          { name: "status", encode: () => payloadJson, decode: decodeStatus },
          {},
        ),
      );
      expect(error.source).toBe("client");
      expect(error.code).toBe("invalid_payload");
      expect(requests).toEqual([]);
    },
  );
});
