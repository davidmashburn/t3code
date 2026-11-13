import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vite-plus/test";

import { useWorktreeSetup } from "./useWorktreeSetup";

vi.mock("../../state/query", () => ({ useEnvironmentQuery: () => ({ data: undefined }) }));
vi.mock("../../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../../terminalUiStateStore", () => ({ useTerminalUiStateStore: () => vi.fn() }));

function Probe({ environmentId }: { environmentId: EnvironmentId }) {
  const { isPreparingWorktree } = useWorktreeSetup({
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
  expect(isPreparingWorktree).toBe(false);
  return null;
}

it("converges when a draft allocates a new route ref on every render", () => {
  // Server rendering exercises React's render retries without a DOM or effects.
  expect(() => renderToString(<Probe environmentId={EnvironmentId.make("local")} />)).not.toThrow();
  expect(() =>
    renderToString(<Probe environmentId={EnvironmentId.make("remote")} />),
  ).not.toThrow();
});
