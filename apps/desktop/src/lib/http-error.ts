export type HttpErrorSource = "backend" | "auth";

export class HttpError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly source: HttpErrorSource;

  constructor(source: HttpErrorSource, status: number, endpoint: string) {
    super(`HTTP ${status} ${source} ${endpoint}`);
    this.name = "HttpError";
    this.source = source;
    this.status = status;
    this.endpoint = endpoint;
  }
}
