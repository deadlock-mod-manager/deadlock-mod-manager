// Paste into the inspected app page's console while My Mods is visible.
// The terminal harness replaces the sample and fixture placeholders before use.
(async () => {
  const warmups = 3;
  const samples = __DMM_SAMPLE_COUNT__;
  const fixtureCount = __DMM_FIXTURE_COUNT__;
  const targetIndex = String(Math.max(0, fixtureCount - 1)).padStart(4, "0");
  const targetQuery = `Fixture Mod ${targetIndex}`;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
  const percentile = (values, fraction) => {
    const sorted = [...values].sort((left, right) => left - right);
    return sorted[
      Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
    ];
  };
  const summarize = (values) => ({
    count: values.length,
    medianMs: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    maxMs: Math.max(...values),
  });

  if (location.pathname !== "/my-mods") {
    throw new Error(
      `Open My Mods before running the probe (current path: ${location.pathname})`,
    );
  }

  const searchInput = document.querySelector("input#search");
  if (!(searchInput instanceof HTMLInputElement)) {
    throw new Error("Could not find the My Mods search input");
  }

  const scrollCandidates = [...document.querySelectorAll("*")].filter(
    (element) => {
      const style = getComputedStyle(element);
      return (
        element.scrollHeight > element.clientHeight + 100 &&
        (style.overflowY === "auto" || style.overflowY === "scroll")
      );
    },
  );
  const scrollElement = scrollCandidates.sort(
    (left, right) =>
      right.scrollHeight -
      right.clientHeight -
      (left.scrollHeight - left.clientHeight),
  )[0];
  if (!(scrollElement instanceof HTMLElement)) {
    throw new Error("Could not find the My Mods scrolling container");
  }

  const setInputValue = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  ).set;

  const waitForSettledRender = async (
    minimumMs = 300,
    quietMs = 100,
    timeoutMs = 3000,
  ) => {
    const start = performance.now();
    let lastMutation = start;
    const observer = new MutationObserver(() => {
      lastMutation = performance.now();
    });
    observer.observe(scrollElement, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    try {
      while (performance.now() - start < timeoutMs) {
        await frame();
        const now = performance.now();
        if (now - start >= minimumMs && now - lastMutation >= quietMs) {
          return now - start;
        }
      }
      throw new Error(`render did not settle within ${timeoutMs} ms`);
    } finally {
      observer.disconnect();
    }
  };

  const runSearch = async (value) => {
    setInputValue.call(searchInput, value);
    const start = performance.now();
    searchInput.dispatchEvent(new Event("input", { bubbles: true }));
    searchInput.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForSettledRender();
    return performance.now() - start;
  };

  const runScroll = async (direction) => {
    const limit = Math.max(
      0,
      scrollElement.scrollHeight - scrollElement.clientHeight,
    );
    const from = direction === "down" ? 0 : limit;
    const to = direction === "down" ? limit : 0;
    scrollElement.scrollTop = from;
    await sleep(100);
    const intervals = [];
    let previous = performance.now();
    const start = previous;
    const durationMs = 1000;
    while (performance.now() - start < durationMs) {
      const now = await frame();
      intervals.push(now - previous);
      previous = now;
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 0.5 - Math.cos(Math.PI * progress) / 2;
      scrollElement.scrollTop = from + (to - from) * eased;
    }
    return intervals.slice(1);
  };

  const probeStartedEpochMs = Date.now();
  for (let index = 0; index < warmups; index += 1) {
    await runSearch(targetQuery);
    await runSearch("");
    await runScroll(index % 2 === 0 ? "down" : "up");
  }

  const searchToOne = [];
  const searchToAll = [];
  const frameIntervals = [];
  for (let index = 0; index < samples; index += 1) {
    searchToOne.push(await runSearch(targetQuery));
    searchToAll.push(await runSearch(""));
    frameIntervals.push(...(await runScroll(index % 2 === 0 ? "down" : "up")));
  }

  const result = {
    schema: 1,
    probeStartedEpochMs,
    probeFinishedEpochMs: Date.now(),
    path: location.pathname,
    userAgent: navigator.userAgent,
    devicePixelRatio,
    viewport: { width: innerWidth, height: innerHeight },
    fixture: {
      expectedCount: fixtureCount,
      visibleTextMatch: document.body.innerText.includes(String(fixtureCount)),
      scrollHeight: scrollElement.scrollHeight,
      clientHeight: scrollElement.clientHeight,
    },
    warmups,
    samples,
    searchToOne: summarize(searchToOne),
    searchToAll: summarize(searchToAll),
    frames: {
      ...summarize(frameIntervals),
      over33Ms: frameIntervals.filter((value) => value > 33).length,
      over50Ms: frameIntervals.filter((value) => value > 50).length,
      over50Percent:
        (100 * frameIntervals.filter((value) => value > 50).length) /
        frameIntervals.length,
    },
  };
  console.log(`DMM_ISSUE_640_RESULT=${JSON.stringify(result)}`);
  return result;
})();
