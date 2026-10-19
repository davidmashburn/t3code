import { EnvironmentId, ProjectId, ThreadId, type ThreadPullRequestLink } from "@t3tools/contracts";
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { collectPullRequestWatches } from "./pullRequestWatches.logic";
import { PullRequestWatches } from "./PullRequestWatches";

const state = vi.hoisted(() => ({
  threads: [] as Parameters<typeof collectPullRequestWatches>[0],
  connected: true,
  permitted: true,
  ready: true,
  stop: vi.fn(),
}));
vi.mock("~/state/entities", () => ({
  useThreadShells: () => state.threads,
  useProjects: () => [],
  useAllEnvironmentShellsBootstrapped: () => state.ready,
}));
vi.mock("~/state/environments", () => ({
  useEnvironment: () => ({
    label: "Development",
    connection: { phase: state.connected ? "connected" : "offline" },
    serverConfig: { environment: { capabilities: { threadPullRequestWatch: true } } },
  }),
  useEnvironments: () => ({
    environments: [{ connection: { phase: state.connected ? "connected" : "offline" } }],
  }),
}));
vi.mock("~/state/session", () => ({ useEnvironmentScope: () => state.permitted }));
vi.mock("~/state/threads", () => ({ threadEnvironment: { watchPullRequest: {} } }));
vi.mock("~/state/use-atom-command", () => ({ useAtomCommand: () => state.stop }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    onClick,
  }: {
    children: ReactNode;
    params: { environmentId: string; threadId: string };
    onClick: () => void;
  }) => (
    <a href={`/${params.environmentId}/${params.threadId}`} onClick={onClick}>
      {children}
    </a>
  ),
}));
vi.mock("../ui/button", () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));
vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipPopup: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("../ui/dialog", () => {
  const Wrapper = ({ children }: { children: ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({
      children,
      onOpenChange,
    }: {
      children: ReactNode;
      onOpenChange: (open: boolean) => void;
    }) => (
      <div>
        <button onClick={() => onOpenChange(true)}>Open watches</button>
        {children}
      </div>
    ),
    DialogTrigger: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
    DialogDescription: Wrapper,
    DialogPopup: Wrapper,
    DialogPanel: Wrapper,
  };
});

const link: ThreadPullRequestLink = {
  host: "github.com",
  repository: "acme/app",
  number: 7,
  url: "https://github.com/acme/app/pull/7",
  source: "agent",
  linkedAt: "2026-10-14T10:00:00Z",
  snapshot: null,
  stack: null,
  watch: {
    startedAt: "2026-10-14T10:00:00Z",
    headSha: null,
    failedChecks: [],
    passed: false,
    passedChecks: [],
    remarksThrough: "2026-10-14T10:00:00Z",
    remarkIds: [],
    conflicting: false,
    wakes: 0,
  },
};
function thread(environment = "local", id = "thread-a", pullRequests = [link]) {
  return {
    environmentId: EnvironmentId.make(environment),
    id: ThreadId.make(id),
    projectId: ProjectId.make("project"),
    title: `Owner ${id}`,
    pullRequests,
  };
}

let renderer: ReactTestRenderer;
beforeEach(() => {
  state.threads = [thread(), thread("remote"), thread("local", "thread-b")];
  state.connected = true;
  state.permitted = true;
  state.ready = true;
  state.stop.mockReset().mockResolvedValue({ _tag: "Success" });
});
afterEach(() => {
  act(() => renderer?.unmount());
});
async function open() {
  await act(async () => {
    renderer = create(<PullRequestWatches />);
  });
  await act(async () => {
    renderer.root.findAllByType("button")[0]!.props.onClick();
  });
}
function stopButtons() {
  return renderer.root
    .findAllByType("button")
    .filter((button) => button.props["aria-label"]?.startsWith("Stop watching"));
}

describe("pull request watches", () => {
  it("retains separate owners across threads and environments and ignores unwatched links", () => {
    const { watch: _watch, ...unwatched } = link;
    const entries = collectPullRequestWatches([
      ...state.threads,
      thread("local", "unwatched", [unwatched]),
      thread("local", "dismissed", [{ ...link, source: "stack-dismissed" }]),
    ]);
    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(3);
  });

  it("opens the scoped owning thread and stops only the selected watch, awaiting live removal", async () => {
    await open();
    expect(renderer.root.findAllByType("a").map((a) => a.props.href)).toContain("/remote/thread-a");
    const entries = collectPullRequestWatches(state.threads);
    const index = entries.findIndex((entry) => entry.thread.environmentId === "remote");
    await act(async () => {
      stopButtons()[index]!.props.onClick();
    });
    expect(state.stop).toHaveBeenCalledExactlyOnceWith({
      environmentId: "remote",
      input: {
        threadId: "thread-a",
        host: "github.com",
        repository: "acme/app",
        number: 7,
        watching: false,
      },
    });
    expect(stopButtons()).toHaveLength(3);
    const { watch: _watch, ...stillLinked } = link;
    state.threads = state.threads.map((owner) =>
      owner.environmentId === "remote" ? { ...owner, pullRequests: [stillLinked] } : owner,
    );
    await act(async () => {
      renderer.update(<PullRequestWatches />);
    });
    expect(stopButtons()).toHaveLength(2);
  });

  it.each(["disconnected", "read-only"])(
    "keeps %s watches visible without enabling stop",
    async (mode) => {
      state.connected = mode !== "disconnected";
      state.permitted = mode !== "read-only";
      await open();
      expect(stopButtons()).toHaveLength(3);
      expect(stopButtons().every((button) => button.props.disabled)).toBe(true);
      await act(async () => {
        stopButtons()[0]!.props.onClick();
      });
      expect(state.stop).not.toHaveBeenCalled();
    },
  );

  it("keeps a failed stop visible and retryable", async () => {
    state.stop.mockResolvedValue({ _tag: "Failure" });
    await open();
    await act(async () => {
      stopButtons()[0]!.props.onClick();
    });
    expect(stopButtons()).toHaveLength(3);
    expect(stopButtons()[0]!.props.disabled).toBe(false);
  });

  it("does not report an empty list until the shell has loaded", async () => {
    state.threads = [];
    state.ready = false;
    await open();
    expect(JSON.stringify(renderer.toJSON())).toContain("Loading watches");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("No watches found");
    state.ready = true;
    await act(async () => {
      renderer.update(<PullRequestWatches />);
    });
    expect(JSON.stringify(renderer.toJSON())).toContain("No watches found");
  });
});
