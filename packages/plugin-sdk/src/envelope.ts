import { boolean, DecodeError, field, json, object, string } from "./decoders";
import { PluginCallError } from "./errors";
import type { JsonValue } from "./json";

export type CommandFailure = { code: string; message: string };

/** Guest ABI v1 response envelope, returned unchanged by the host bridge. */
export type CommandEnvelope =
  | { ok: true; value: JsonValue }
  | { ok: false; error: CommandFailure };

const protocolError = (command: string, code: string, message: string) =>
  new PluginCallError({ source: "protocol", code, message, command });

export function parseEnvelope(command: string, raw: string): CommandEnvelope {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw protocolError(
      command,
      "invalid_json",
      "The host returned a response that is not valid JSON.",
    );
  }

  try {
    const envelope = object(parsed);
    if (field(envelope, "ok", boolean)) {
      return { ok: true, value: field(envelope, "value", json) };
    }
    const failure = field(envelope, "error", object);
    return {
      ok: false,
      error: {
        code: field(failure, "code", string, "$.error"),
        message: field(failure, "message", string, "$.error"),
      },
    };
  } catch (error) {
    if (error instanceof DecodeError) {
      throw protocolError(
        command,
        "invalid_envelope",
        `Malformed response envelope: ${error.message}`,
      );
    }
    throw error;
  }
}
