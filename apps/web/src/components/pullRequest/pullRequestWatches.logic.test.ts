import {
  EnvironmentId,
  ProjectId,
  ThreadId,
  type ThreadPullRequestLink,
  type ThreadPullRequestWatch,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { collectPullRequestWatches } from "./pullRequestWatches.logic";

function watch(startedAt = "2026-10-14T10:00:00Z"): ThreadPullRequestWatch {
  return {
    startedAt,
    headSha: null,
    failedChecks: [],
    passed: false,
    passedChecks: [],
    remarksThrough: startedAt,
    remarkIds: [],
    conflicting: false,
    wakes: 0,
  };
}

function link(input: Partial<ThreadPullRequestLink> = {}): ThreadPullRequestLink {
  return {
    host: "github.com",
    repository: "acme/app",
    number: 7,
    url: "https://github.com/acme/app/pull/7",
    source: "agent",
    linkedAt: "2026-10-14T10:00:00Z",
    snapshot: null,
    stack: null,
    watch: watch(),
    ...input,
  };
}

function thread(
  environmentId = EnvironmentId.make("local"),
  id = ThreadId.make("thread-a"),
  pullRequests: ReadonlyArray<ThreadPullRequestLink> = [link()],
) {
  return {
    environmentId,
    id,
    projectId: ProjectId.make("project"),
    title: `Owner ${id}`,
    pullRequests,
  };
}

describe("collectPullRequestWatches", () => {
  it("keeps separate owners of the same pull request across projects and environments", () => {
    const owners = [
      thread(),
      thread(EnvironmentId.make("remote")),
      {
        ...thread(EnvironmentId.make("local"), ThreadId.make("thread-b")),
        projectId: ProjectId.make("other-project"),
      },
    ];

    const entries = collectPullRequestWatches(owners);

    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(3);
    expect(entries.map((entry) => entry.thread)).toEqual(expect.arrayContaining(owners));
  });

  it("ignores unwatched, ended, and dismissed links without needing a PR snapshot", () => {
    const active = link();
    const { watch: endedWatch, ...unwatched } = link({ number: 8 });
    const ended = { ...unwatched, number: 9, endedWatch };
    const dismissed = link({ number: 10, source: "stack-dismissed" });
    const owner = thread(undefined, undefined, [active, unwatched, ended, dismissed]);

    const entries = collectPullRequestWatches([owner]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.link).toBe(active);
    expect(entries[0]?.watch).toBe(active.watch);
  });

  it("distinguishes watches on different hosts, repositories, and PR numbers", () => {
    const links = [
      link(),
      link({ host: "github.example" }),
      link({ repository: "acme/other" }),
      link({ number: 8 }),
    ];

    const entries = collectPullRequestWatches([thread(undefined, undefined, links)]);

    expect(entries).toHaveLength(4);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(4);
    expect(entries.map((entry) => entry.link)).toEqual(expect.arrayContaining(links));
  });

  it("sorts newest first and keeps ties deterministic when shell order changes", () => {
    const older = link({ number: 1, watch: watch("2026-10-13T10:00:00Z") });
    const newer = link({ number: 2, watch: watch("2026-10-15T10:00:00Z") });
    const tied = link({ number: 3, watch: watch("2026-10-15T10:00:00Z") });
    const owners = [
      thread(undefined, ThreadId.make("thread-b"), [tied, older]),
      thread(undefined, ThreadId.make("thread-a"), [newer]),
    ];

    const entries = collectPullRequestWatches(owners);
    const reordered = collectPullRequestWatches([
      owners[1]!,
      { ...owners[0]!, pullRequests: [older, tied] },
    ]);

    expect(entries.map((entry) => entry.link)).toEqual([newer, tied, older]);
    expect(reordered.map((entry) => entry.key)).toEqual(entries.map((entry) => entry.key));
    expect(owners[0]?.pullRequests).toEqual([tied, older]);
  });

  it("removes only the stopped owner's watch when the shell update arrives", () => {
    const owners = [thread(), thread(EnvironmentId.make("remote"))];
    const originalEntries = collectPullRequestWatches(owners);
    const { watch: endedWatch, ...stillLinked } = owners[1]!.pullRequests[0]!;
    const updatedOwners = [
      owners[0]!,
      { ...owners[1]!, pullRequests: [{ ...stillLinked, endedWatch }] },
    ];

    const entries = collectPullRequestWatches(updatedOwners);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.thread.environmentId).toBe(owners[0]?.environmentId);
    expect(entries[0]?.key).toBe(
      originalEntries.find((entry) => entry.thread.environmentId === owners[0]?.environmentId)?.key,
    );
    expect(collectPullRequestWatches(owners)).toHaveLength(2);
  });

  it("handles an empty shell or threads without linked pull requests", () => {
    expect(collectPullRequestWatches([])).toEqual([]);
    expect(collectPullRequestWatches([thread(undefined, undefined, [])])).toEqual([]);
  });
});
