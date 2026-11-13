import { useState } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vite-plus/test";

import { makeStreamingTimelineFixture } from "../test-fixtures";
import type { TimelineEntriesInput } from "../session-logic";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

function Probe({ visibleTurnItems }: Pick<TimelineEntriesInput, "visibleTurnItems">) {
  const [ready, setReady] = useState(false);
  const entries = useIncrementalTimelineEntries("draft", {
    visibleTurnItems: [...visibleTurnItems],
    optimisticMessages: [],
    anchoredMessages: [],
    attachmentUrlById: new Map(),
    attempts: [],
    nodes: [],
    plans: [],
  });
  // A parent hook can retry the render while ChatView's collections are fresh.
  if (!ready) setReady(true);
  expect(entries).toHaveLength(visibleTurnItems.length);
  return null;
}

it.each([
  { visibleTurnItems: [] },
  { visibleTurnItems: makeStreamingTimelineFixture("Streaming").visibleTurnItems },
])(
  "converges with fresh timeline collections during render retries (%#)",
  ({ visibleTurnItems }) => {
    expect(() => renderToString(<Probe visibleTurnItems={visibleTurnItems} />)).not.toThrow();
  },
);
