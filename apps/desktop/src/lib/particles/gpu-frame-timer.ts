import { z } from "zod";

const timerExtension = z.object({
  TIME_ELAPSED_EXT: z.number(),
  GPU_DISJOINT_EXT: z.number(),
});

/** Small adapter also permits testing the asynchronous query protocol without a GPU. */
export interface GpuTimerContext {
  QUERY_RESULT_AVAILABLE: number;
  QUERY_RESULT: number;
  getExtension(name: string): object | null;
  createQuery(): WebGLQuery | null;
  deleteQuery(query: WebGLQuery): void;
  beginQuery(target: number, query: WebGLQuery): void;
  endQuery(target: number): void;
  getParameter(name: number): boolean | number;
  getQueryParameter(query: WebGLQuery, name: number): boolean | number;
  isContextLost(): boolean;
}

export interface GpuFrameSample {
  frame: number;
  milliseconds: number;
}

/** Bounded, nonblocking, WebGL2 GPU timing. Results from disjoint periods are discarded. */
export const createGpuFrameTimer = (gl: GpuTimerContext) => {
  const parsed = timerExtension.safeParse(
    gl.getExtension("EXT_disjoint_timer_query_webgl2"),
  );
  if (!parsed.success) return null;
  const extension = parsed.data;
  const pending: { query: WebGLQuery; frame: number }[] = [];
  const free: WebGLQuery[] = [];
  let active: { query: WebGLQuery; frame: number } | null = null;
  let allocated = 0;
  let disposed = false;
  const clear = () => {
    for (const entry of pending) gl.deleteQuery(entry.query);
    for (const query of free) gl.deleteQuery(query);
    pending.length = 0;
    free.length = 0;
    allocated = active ? 1 : 0;
  };
  return {
    begin(frame: number) {
      if (disposed || active || gl.isContextLost() || pending.length >= 4)
        return false;
      let query = free.pop();
      if (!query && allocated < 4) {
        query = gl.createQuery() ?? undefined;
        if (query) allocated += 1;
      }
      if (!query) return false;
      active = { query, frame };
      gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
      return true;
    },
    end() {
      if (!active) return;
      gl.endQuery(extension.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    },
    poll(): GpuFrameSample | null {
      if (disposed) return null;
      if (
        gl.isContextLost() ||
        gl.getParameter(extension.GPU_DISJOINT_EXT) === true
      ) {
        if (active) {
          if (!gl.isContextLost()) gl.endQuery(extension.TIME_ELAPSED_EXT);
          gl.deleteQuery(active.query);
          active = null;
        }
        clear();
        return null;
      }
      const oldest = pending[0];
      if (
        !oldest ||
        gl.getQueryParameter(oldest.query, gl.QUERY_RESULT_AVAILABLE) !== true
      )
        return null;
      // QUERY_RESULT is never requested until the availability flag says it is ready.
      const result = z
        .number()
        .nonnegative()
        .safeParse(gl.getQueryParameter(oldest.query, gl.QUERY_RESULT));
      pending.shift();
      free.push(oldest.query);
      return result.success
        ? { frame: oldest.frame, milliseconds: result.data / 1_000_000 }
        : null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (active) {
        if (!gl.isContextLost()) gl.endQuery(extension.TIME_ELAPSED_EXT);
        gl.deleteQuery(active.query);
        active = null;
      }
      clear();
    },
  };
};
