import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { visibleThreadPullRequests } from "@t3tools/client-runtime/thread-pull-requests";

type WatchThread = Pick<
  EnvironmentThreadShell,
  "environmentId" | "id" | "projectId" | "title" | "pullRequests"
>;

/** A watch belongs to a thread, even when several threads watch the same PR. */
export function collectPullRequestWatches(threads: ReadonlyArray<WatchThread>) {
  return threads
    .flatMap((thread) =>
      visibleThreadPullRequests(thread.pullRequests).flatMap((link) =>
        link.watch === undefined
          ? []
          : [
              {
                key: JSON.stringify([
                  thread.environmentId,
                  thread.id,
                  link.host,
                  link.repository,
                  link.number,
                ]),
                thread,
                link,
                watch: link.watch,
              },
            ],
      ),
    )
    .sort(
      (a, b) => b.watch.startedAt.localeCompare(a.watch.startedAt) || a.key.localeCompare(b.key),
    );
}

export type PullRequestWatchEntry = ReturnType<typeof collectPullRequestWatches>[number];
