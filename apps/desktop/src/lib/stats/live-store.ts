import { load, type Store } from "@tauri-apps/plugin-store";
import { resolveStorePath } from "@/lib/runtime-bootstrap";
import { createLogger } from "@/lib/logger";
import {
  type LiveMatchSample,
  type LivePlayer,
  type LiveStatus,
  subscribeToLiveMatch,
} from "@/lib/stats/live";

/** Everything the stream produced, tagged with the match it belongs to. */
export type LiveStream = {
  matchId: string | null;
  players: LivePlayer[];
  samples: LiveMatchSample[];
  status: LiveStatus;
};

const logger = createLogger("live-store");

const EMPTY: LiveStream = {
  matchId: null,
  players: [],
  samples: [],
  status: "connecting",
};

/**
 * The scoreboard lives outside React because the Live tab unmounts every time
 * the user looks at another tab. Holding it in component state meant the stream
 * was torn down and reopened on every visit, so the board started empty and the
 * match charts lost everything sampled before the click. Here it keeps running
 * for as long as the app does, and the last round is written to disk so closing
 * the app does not lose it either: one round's data stays until the next round
 * replaces it.
 */
let snapshot: LiveStream = EMPTY;
const listeners = new Set<() => void>();
let stopStream: (() => void) | null = null;
/** Match and broadcast the open stream belongs to; `null` when none is open. */
let connectedTo: string | null = null;

const emit = () => {
  for (const listener of listeners) {
    listener();
  }
  schedulePersist();
};

/**
 * Applies an update only while `matchId` is still the round on screen, so a
 * straggling callback from a stream we just replaced cannot write into the new
 * round's board.
 *
 * Updates that change nothing are dropped rather than published. The stream
 * reports its status per row, and re-rendering every live view sixty times a
 * second to be told it is still streaming is most of what made the tab lag.
 */
const patch = (matchId: string, update: Partial<LiveStream>) => {
  if (snapshot.matchId !== matchId) {
    return;
  }
  const keys = Object.keys(update) as (keyof LiveStream)[];
  if (keys.every((key) => snapshot[key] === update[key])) {
    return;
  }
  snapshot = { ...snapshot, ...update };
  emit();
};

/**
 * Each stream counts its samples from the moment it connected, so a reconnect
 * mid-round would otherwise replace the whole curve with its own short tail.
 * Appending by match second keeps the chart continuous across one.
 */
const mergeSamples = (
  previous: LiveMatchSample[],
  incoming: LiveMatchSample[],
): LiveMatchSample[] => {
  const lastSecond = previous.at(-1)?.second;
  if (lastSecond === undefined) {
    return incoming;
  }
  const fresh = incoming.filter((sample) => sample.second > lastSecond);
  return fresh.length > 0 ? [...previous, ...fresh] : previous;
};

export const subscribeToLiveStream = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getLiveStream = (): LiveStream => snapshot;

/**
 * Points the store at a round before its broadcast has resolved.
 *
 * Resolving a broadcast is rate limited and takes a moment, and the previous
 * round's board is still in here while it does. Without this the scoreboard,
 * the charts and every player card would keep showing the last match's players
 * as the new one starts - attributed to the new match id.
 */
export const beginLiveMatch = (matchId: string) => {
  if (snapshot.matchId === matchId) {
    return;
  }
  stopStream?.();
  stopStream = null;
  connectedTo = null;
  snapshot = { ...EMPTY, matchId };
  emit();
  // Written through rather than left to the throttle: the round on disk is now
  // the wrong one, and a crash before the first tick would restore it.
  void persistNow();
};

/**
 * Opens the scoreboard stream for a match, unless that exact stream is already
 * open - callers can run this on every render without reconnecting. Every
 * connection counts against the endpoint's rate limit, which is why the guard
 * lives here rather than in each caller.
 */
export const connectLiveStream = (matchId: string, broadcastUrl: string) => {
  const target = `${matchId} ${broadcastUrl}`;
  if (target === connectedTo) {
    return;
  }

  stopStream?.();
  connectedTo = target;
  // Only a different round clears the board; re-opening the same one (a fresh
  // broadcast handle, say) resumes on top of what has already been collected.
  // That is also what lets a restart mid-match pick the round back up with the
  // charts it was restored with rather than a curve starting at the restart.
  if (snapshot.matchId !== matchId) {
    snapshot = { ...EMPTY, matchId };
    emit();
  }

  stopStream = subscribeToLiveMatch(
    broadcastUrl,
    (players) => patch(matchId, { players }),
    (status) => {
      patch(matchId, { status });
      // The final scoreboard is the one worth keeping, and the app may well be
      // closed moments later - do not leave it to the throttle.
      if (status === "ended" || status === "error") {
        void persistNow();
      }
    },
    (samples) =>
      patch(matchId, { samples: mergeSamples(snapshot.samples, samples) }),
  );
};

/**
 * Drops the guard so the next `connectLiveStream` opens the stream again, even
 * for the round it is already pointed at.
 *
 * A stream that errors or ends closes itself but leaves the guard standing, and
 * the round it belongs to is still the current one - so nothing would ever
 * reconnect it. That is deliberate for the automatic path, where a broadcast
 * that dropped once tends to drop again and every attempt costs rate limit. It
 * is only wrong when someone asks for a retry.
 *
 * The board is left alone: reconnecting resumes on top of what was collected.
 */
export const reopenLiveStream = () => {
  stopStream?.();
  stopStream = null;
  connectedTo = null;
};

export const disconnectLiveStream = () => {
  stopStream?.();
  stopStream = null;
  connectedTo = null;
  void persistNow();
};

/* -------------------------------------------------------------------------- */
/* Surviving a restart                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Its own small file rather than a row in the stats cache: this is written
 * while a match runs, and the match history sharing the file would mean
 * rewriting half a megabyte every time.
 */
const PERSIST_FILE = "live-board.json";
const PERSIST_KEY = "board";
/** Bump when `LiveStream` changes shape; older payloads are then ignored. */
const PERSIST_VERSION = 1;
/**
 * The board changes every second and the disk does not need to hear about it.
 * The end of a match is written through, so this only ever costs the tail of an
 * interrupted round.
 */
const PERSIST_THROTTLE_MS = 15_000;
/** A scoreboard this old is a curiosity, not the match you just played. */
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type PersistedBoard = {
  version: number;
  savedAt: number;
  stream: LiveStream;
};

let storePromise: Promise<Store> | null = null;
const getStore = (): Promise<Store> => {
  storePromise ??= resolveStorePath(PERSIST_FILE).then((storePath) =>
    load(storePath, { autoSave: false, defaults: {} }),
  );
  return storePromise;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

const persistNow = async (): Promise<void> => {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  try {
    const store = await getStore();
    await store.set(PERSIST_KEY, {
      version: PERSIST_VERSION,
      savedAt: Date.now(),
      stream: snapshot,
    } satisfies PersistedBoard);
    await store.save();
  } catch (error) {
    logger.withError(error).warn("Could not save the live board");
  }
};

const schedulePersist = () => {
  if (persistTimer !== null) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, PERSIST_THROTTLE_MS);
};

let hydrated = false;

/**
 * Brings back the last board the app saw. Safe to call more than once, and safe
 * to lose the race against detection: a different round claimed while the read
 * was in flight is the current one and keeps the store, while the same round -
 * a restart in the middle of a match - gets its scoreboard and its curve back
 * and the reconnecting stream carries on from there.
 *
 * The restored status is never `streaming`; the stream it belonged to died with
 * the previous process.
 */
export const hydrateLiveStream = async (): Promise<void> => {
  if (hydrated) {
    return;
  }
  hydrated = true;
  try {
    const store = await getStore();
    const saved = await store.get<PersistedBoard>(PERSIST_KEY);
    if (
      saved?.version !== PERSIST_VERSION ||
      Date.now() - saved.savedAt > PERSIST_MAX_AGE_MS ||
      saved.stream.matchId === null
    ) {
      return;
    }
    const isSameRound = snapshot.matchId === saved.stream.matchId;
    if (
      (snapshot.matchId !== null && !isSameRound) ||
      // Slow disk: the round was picked back up and has a live board already.
      snapshot.players.length > 0
    ) {
      return;
    }
    snapshot = {
      ...saved.stream,
      status:
        saved.stream.status === "streaming" ? "ended" : saved.stream.status,
    };
    emit();
  } catch (error) {
    logger.withError(error).warn("Could not restore the live board");
  }
};
