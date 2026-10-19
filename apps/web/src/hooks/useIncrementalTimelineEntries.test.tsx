import { act, useLayoutEffect, useState } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { useIncrementalTimelineEntries } from "./useIncrementalTimelineEntries";

let renderer: ReactTestRenderer | undefined;
let entries: ReturnType<typeof useIncrementalTimelineEntries>;
function Probe({ threadKey }: { threadKey: string }) {
  const [ready, setReady] = useState(false);
  const value = useIncrementalTimelineEntries(threadKey, {
    visibleTurnItems: [],
    optimisticMessages: [],
    anchoredMessages: [],
    attachmentUrlById: new Map(),
  });
  if (!ready) setReady(true);
  useLayoutEffect(() => {
    entries = value;
  });
  return null;
}
beforeEach(() => vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true));
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("converges with fresh input collections during render retries and reuses committed rows", () => {
  act(() => {
    renderer = create(<Probe threadKey="first" />);
  });
  expect(entries).toEqual([]);
  const first = entries;
  act(() => renderer!.update(<Probe threadKey="first" />));
  expect(entries).toBe(first);
  act(() => renderer!.update(<Probe threadKey="second" />));
  expect(entries).toEqual([]);
  expect(entries).not.toBe(first);
});
