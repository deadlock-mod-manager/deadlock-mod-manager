/**
 * Where a failed call stopped:
 * - `client`: rejected by the SDK before anything was sent.
 * - `bridge`: the host rejected or could not complete the call (plugin disabled,
 *   access revoked, command not allowed, worker failure).
 * - `command`: the command ran and returned a structured error envelope.
 * - `protocol`: the host answered with something that is not a valid envelope,
 *   or the value did not match the command's decoder.
 */
export type PluginErrorSource = "client" | "bridge" | "command" | "protocol";

export type SerializedPluginCallError = {
  name: "PluginCallError";
  source: PluginErrorSource;
  code: string;
  message: string;
  command: string;
};

type PluginCallErrorInit = {
  source: PluginErrorSource;
  code: string;
  message: string;
  command: string;
};

export class PluginCallError extends Error {
  override readonly name = "PluginCallError";
  readonly source: PluginErrorSource;
  readonly code: string;
  readonly command: string;

  constructor({ source, code, message, command }: PluginCallErrorInit) {
    super(message);
    this.source = source;
    this.code = code;
    this.command = command;
  }

  toJSON(): SerializedPluginCallError {
    return {
      name: this.name,
      source: this.source,
      code: this.code,
      message: this.message,
      command: this.command,
    };
  }
}
