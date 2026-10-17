import { AuthOrchestrationOperateScope } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";

import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "~/state/entities";
import { useEnvironment, useEnvironments } from "~/state/environments";
import { useEnvironmentScope } from "~/state/session";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import { formatRelativeTimeLabel } from "~/timestampFormat";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { collectPullRequestWatches, type PullRequestWatchEntry } from "./pullRequestWatches.logic";

function WatchRow({
  entry,
  projectTitle,
  onOpenThread,
}: {
  entry: PullRequestWatchEntry;
  projectTitle: string;
  onOpenThread: () => void;
}) {
  const { thread, link, watch } = entry;
  const environment = useEnvironment(thread.environmentId);
  const canOperate = useEnvironmentScope(thread.environmentId, AuthOrchestrationOperateScope);
  const stopWatch = useAtomCommand(threadEnvironment.watchPullRequest, { reportFailure: true });
  const [pending, setPending] = useState(false);
  const connected = environment?.connection.phase === "connected";
  const supported =
    environment?.serverConfig?.environment.capabilities.threadPullRequestWatch === true;
  const stop = async () => {
    if (pending || !connected || !supported || !canOperate) return;
    setPending(true);
    try {
      await stopWatch({
        environmentId: thread.environmentId,
        input: {
          threadId: thread.id,
          host: link.host,
          repository: link.repository,
          number: link.number,
          watching: false,
        },
      });
    } finally {
      setPending(false);
    }
  };
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <a
            href={link.url}
            target="_blank"
            rel="noreferrer"
            className="block break-words text-sm font-medium hover:underline"
          >
            {link.snapshot?.title ?? `${link.repository} #${link.number}`}
          </a>
          <p className="break-words text-xs text-muted-foreground">
            {link.host}/{link.repository} #{link.number}
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
            <Button
              variant="outline"
              size="xs"
              disabled={pending || !connected || !supported || !canOperate}
              aria-label={`Stop watching ${link.repository} #${link.number} in ${thread.title}`}
              onClick={() => void stop()}
            >
              <EyeOffIcon aria-hidden className="size-3.5" />
              {pending ? "Stopping…" : "Stop"}
            </Button>
          </TooltipTrigger>
          <TooltipPopup>
            {!connected
              ? "Reconnect to stop this watch"
              : !supported
                ? "Update this environment to manage watches"
                : !canOperate
                  ? "This connection cannot manage watches"
                  : undefined}
          </TooltipPopup>
        </Tooltip>
      </div>
      <Link
        to="/$environmentId/$threadId"
        params={{ environmentId: thread.environmentId, threadId: thread.id }}
        onClick={onOpenThread}
        className="block break-words text-sm underline underline-offset-2"
      >
        {thread.title || "Untitled thread"}
      </Link>
      <p className="break-words text-xs text-muted-foreground">
        {environment?.label ?? thread.environmentId} · {projectTitle}
        {!connected ? " · Disconnected — last known watch" : ""}
      </p>
      <p className="text-xs text-muted-foreground">
        Started {formatRelativeTimeLabel(watch.startedAt)}
        {link.snapshot
          ? ` · PR synced ${formatRelativeTimeLabel(link.snapshot.syncedAt)}`
          : " · Awaiting PR sync"}
      </p>
    </li>
  );
}

function WatchList({ onOpenThread }: { onOpenThread: () => void }) {
  const threads = useThreadShells();
  const projects = useProjects();
  const ready = useAllEnvironmentShellsBootstrapped();
  const { environments } = useEnvironments();
  const watches = collectPullRequestWatches(threads);
  const unavailable = environments.filter(
    (environment) => environment.connection.phase !== "connected",
  );
  return (
    <>
      {!ready ? (
        <p role="status" className="pb-2 text-sm text-muted-foreground">
          Loading watches…
        </p>
      ) : null}
      {unavailable.length > 0 ? (
        <p className="pb-2 text-sm text-muted-foreground">
          Some environments are disconnected. Their watches may be missing or out of date.
        </p>
      ) : null}
      {watches.length === 0 && ready ? (
        <p className="py-4 text-sm text-muted-foreground">
          No watches found. Ask an agent to watch a pull request, or choose “Watch for changes” from
          a thread’s linked pull requests.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {watches.map((entry) => (
            <WatchRow
              key={entry.key}
              entry={entry}
              onOpenThread={onOpenThread}
              projectTitle={
                projects.find(
                  (project) =>
                    project.environmentId === entry.thread.environmentId &&
                    project.id === entry.thread.projectId,
                )?.title ?? "Unknown project"
              }
            />
          ))}
        </ul>
      )}
    </>
  );
}

export function PullRequestWatches() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="sm" />}>
        <EyeIcon aria-hidden className="size-3.5" />
        <span className="hidden @xl/pr-list:inline">Watching</span>
        <span className="sr-only @xl/pr-list:hidden">Watching pull requests</span>
      </DialogTrigger>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Watching pull requests</DialogTitle>
          <DialogDescription>
            Watches across all projects and environments. Each watch wakes its owning thread when
            the pull request changes.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>{open ? <WatchList onOpenThread={() => setOpen(false)} /> : null}</DialogPanel>
      </DialogPopup>
    </Dialog>
  );
}
