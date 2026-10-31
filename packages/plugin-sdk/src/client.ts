/* oxlint-disable anti-slop/no-runtime-typeof -- Bridge rejections cross the frame boundary untyped and are decoded here. */
import type { Decoder } from "./decoders";
import { parseEnvelope } from "./envelope";
import { PluginCallError } from "./errors";
import { frameTransport } from "./frame";
import type { JsonObject, JsonValue } from "./json";

/** Plugin SDK contract version; matches `sdkVersion` in the plugin manifest. */
export const SDK_VERSION = 1;

/** Commands the host supervisor runs on its own; plugin views cannot call them. */
const HOST_ONLY_COMMANDS: ReadonlySet<string> = new Set(["tick"]);

const COMMAND_NAME_PATTERN = /^[a-z][A-Za-z0-9_.-]{0,63}$/;

export type BridgeRequest = { command: string; payloadJson: string };

/** Sends one request across the host bridge and resolves with the raw envelope JSON. */
export type BridgeTransport = (request: BridgeRequest) => Promise<string>;

export type EmptyPayload = Record<string, never>;

export type PluginCommand<Input extends JsonObject, Output> = {
  readonly name: string;
  readonly encode: (input: Input) => string;
  readonly decode: Decoder<Output>;
};

export type PluginClient = {
  /** Calls a command defined with `defineCommand`. */
  call<Input extends JsonObject, Output>(
    command: PluginCommand<Input, Output>,
    input: Input,
  ): Promise<Output>;
  /** Calls the plugin's `status` command with an empty payload. */
  status<Output>(decode: Decoder<Output>): Promise<Output>;
  /** Calls the plugin's `deploy` command. */
  deploy<Input extends JsonObject, Output>(
    input: Input,
    decode: Decoder<Output>,
  ): Promise<Output>;
};

export type PluginClientOptions = {
  /** Replaces the frame bridge, for tests. The host enforces its rules either way. */
  transport?: BridgeTransport;
};

const clientError = (command: string, code: string, message: string) =>
  new PluginCallError({ source: "client", code, message, command });

function assertCallableCommand(name: string): void {
  if (!COMMAND_NAME_PATTERN.test(name)) {
    throw clientError(
      name,
      "invalid_command",
      `"${name}" is not a valid plugin command name.`,
    );
  }
  if (HOST_ONLY_COMMANDS.has(name)) {
    throw clientError(
      name,
      "host_only_command",
      `"${name}" is run by the host and cannot be called from a plugin view.`,
    );
  }
}

export function defineCommand<
  Input extends JsonObject = EmptyPayload,
  Output = JsonValue,
>(name: string, decode: Decoder<Output>): PluginCommand<Input, Output> {
  assertCallableCommand(name);
  return { name, encode: (input) => JSON.stringify(input), decode };
}

export function createPluginClient(
  options: PluginClientOptions = {},
): PluginClient {
  const transport = options.transport ?? frameTransport;

  async function call<Input extends JsonObject, Output>(
    command: PluginCommand<Input, Output>,
    input: Input,
  ): Promise<Output> {
    const name = command.name;
    assertCallableCommand(name);

    let payloadJson: string;
    try {
      payloadJson = command.encode(input);
    } catch (error) {
      throw clientError(
        name,
        "invalid_payload",
        error instanceof Error
          ? error.message
          : "The payload could not be serialized.",
      );
    }

    let raw: string;
    try {
      raw = await transport({ command: name, payloadJson });
    } catch (error) {
      if (error instanceof PluginCallError) throw error;
      let code = "bridge_error";
      let message = "The host rejected the plugin call.";
      if (typeof error === "string" && error.length > 0) {
        message = error;
      } else if (error instanceof Error) {
        message = error.message;
      } else if (typeof error === "object" && error !== null) {
        if ("code" in error && typeof error.code === "string") {
          code = error.code;
        }
        if ("message" in error && typeof error.message === "string") {
          message = error.message;
        }
      }
      throw new PluginCallError({
        source: "bridge",
        code,
        message,
        command: name,
      });
    }

    const envelope = parseEnvelope(name, raw);
    if (!envelope.ok) {
      throw new PluginCallError({
        source: "command",
        code: envelope.error.code,
        message: envelope.error.message,
        command: name,
      });
    }

    try {
      return command.decode(envelope.value);
    } catch (error) {
      throw new PluginCallError({
        source: "protocol",
        code: "invalid_value",
        message:
          error instanceof Error
            ? error.message
            : "The command result did not match its decoder.",
        command: name,
      });
    }
  }

  return {
    call,
    status: (decode) => call(defineCommand("status", decode), {}),
    deploy: <Input extends JsonObject, Output>(
      input: Input,
      decode: Decoder<Output>,
    ) => call(defineCommand<Input, Output>("deploy", decode), input),
  };
}
