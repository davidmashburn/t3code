import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act, useLayoutEffect } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { useWorktreeSetup } from "./useWorktreeSetup";

vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: undefined }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../terminalUiStateStore", () => ({ useTerminalUiStateStore: () => vi.fn() }));
let renderer: ReactTestRenderer | undefined;
let preparing: boolean | undefined;
function Probe({ environmentId }: { environmentId: EnvironmentId }) {
  const value = useWorktreeSetup({
    routeThreadRef: { environmentId, threadId: ThreadId.make("draft-thread") },
    ownerKey: "draft",
    activeThread: undefined,
    threadRef: null,
    serverProjection: null,
    activityRun: null,
    localPreparing: false,
    sendQueuesBehindSetup: false,
    followUpSent: false,
  });
  useLayoutEffect(() => {
    preparing = value.isPreparingWorktree;
  });
  return null;
}
afterEach(() => {
  act(() => renderer?.unmount());
  vi.unstubAllGlobals();
});
it("opens a draft with a newly allocated route ref on every render", () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  act(() => {
    renderer = create(<Probe environmentId={EnvironmentId.make("local")} />);
  });
  expect(preparing).toBe(false);
  act(() => renderer!.update(<Probe environmentId={EnvironmentId.make("remote")} />));
  expect(preparing).toBe(false);
});
