// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import type { OrchestrationCommand, ProjectId } from "@t3tools/contracts";
import { ProjectId as ProjectIdSchema } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import { afterEach, describe, expect } from "vite-plus/test";

import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as ProviderSessionRuntime from "../../persistence/ProviderSessionRuntime.ts";
import { ProviderSessionDirectoryLive } from "../../provider/Layers/ProviderSessionDirectory.ts";
import { layerTest as ServerSettingsLayerTest } from "../../serverSettings.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import { ClaudeSessionMirror } from "../Services/ClaudeSessionMirror.ts";
import { ClaudeSessionMirrorLive } from "./ClaudeSessionMirror.ts";

const SESSION_ID = "11111111-2222-3333-4444-555555555555";
const PROJECT_ID: ProjectId = ProjectIdSchema.make("project-mirror-test");

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.();
});

/**
 * Claude writes one assistant message as several transcript records — thinking
 * first, then text — and stamps every record with the message's final
 * `stop_reason`.
 */
function transcriptLines(workspaceRoot: string): ReadonlyArray<unknown> {
  const base = {
    sessionId: SESSION_ID,
    cwd: workspaceRoot,
    gitBranch: "main",
  };
  return [
    {
      ...base,
      type: "user",
      uuid: "user-1",
      timestamp: "2026-08-19T00:00:00.000Z",
      message: { content: "what is the answer?" },
    },
    {
      ...base,
      type: "assistant",
      uuid: "assistant-thinking-1",
      timestamp: "2026-08-19T00:00:01.000Z",
      message: {
        content: [{ type: "thinking", thinking: "weighing the options" }],
        stop_reason: "end_turn",
        model: "claude-sonnet-5",
      },
    },
    {
      ...base,
      type: "assistant",
      uuid: "assistant-text-1",
      timestamp: "2026-08-19T00:00:02.000Z",
      message: {
        content: [{ type: "text", text: "The answer is 42." }],
        stop_reason: "end_turn",
        model: "claude-sonnet-5",
      },
    },
  ];
}

function makeClaudeHome(lines: (workspaceRoot: string) => ReadonlyArray<unknown>): {
  readonly homePath: string;
  readonly workspaceRoot: string;
} {
  const homePath = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "claude-mirror-"));
  cleanups.push(() => NodeFS.rmSync(homePath, { recursive: true, force: true }));
  const workspaceRoot = NodePath.join(homePath, "workspace");
  NodeFS.mkdirSync(workspaceRoot, { recursive: true });
  const projectDirectory = NodePath.join(homePath, ".claude", "projects", "-workspace");
  NodeFS.mkdirSync(projectDirectory, { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(projectDirectory, `${SESSION_ID}.jsonl`),
    `${lines(workspaceRoot)
      .map((line) => JSON.stringify(line))
      .join("\n")}\n`,
    "utf8",
  );
  return { homePath, workspaceRoot };
}

function runMirror(lines: (workspaceRoot: string) => ReadonlyArray<unknown>) {
  const home = makeClaudeHome(lines);

  const dispatched: Array<OrchestrationCommand> = [];
  const runtimeRepositoryLayer = ProviderSessionRuntime.layer.pipe(
    Layer.provide(SqlitePersistenceMemory),
  );

  const layer = ClaudeSessionMirrorLive.pipe(
    Layer.provideMerge(ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer))),
    Layer.provideMerge(runtimeRepositoryLayer),
    Layer.provideMerge(
      Layer.succeed(OrchestrationEngineService, {
        readEvents: () => Effect.die("unused"),
        streamDomainEvents: Effect.die("unused") as never,
        dispatch: (command: OrchestrationCommand) =>
          Effect.sync(() => {
            dispatched.push(command);
            return { sequence: dispatched.length };
          }),
      } as never),
    ),
    Layer.provideMerge(
      Layer.succeed(ProjectionSnapshotQuery, {
        getCommandReadModel: () => Effect.die("unused"),
        getSnapshot: () => Effect.die("unused"),
        getShellSnapshot: () => Effect.die("unused"),
        getArchivedShellSnapshot: () => Effect.die("unused"),
        getSnapshotSequence: () => Effect.die("unused"),
        getCounts: () => Effect.die("unused"),
        getProjectShellById: () => Effect.die("unused"),
        getFirstActiveThreadIdByProjectId: () => Effect.die("unused"),
        getThreadCheckpointContext: () => Effect.die("unused"),
        getFullThreadDiffContext: () => Effect.die("unused"),
        getThreadShellById: () => Effect.die("unused"),
        getThreadDetailById: () => Effect.succeed(Option.none()),
        getActiveProjectByWorkspaceRoot: (root: string) =>
          Effect.succeed(
            root === home.workspaceRoot
              ? Option.some({
                  id: PROJECT_ID,
                  title: "mirror test",
                  workspaceRoot: home.workspaceRoot,
                  defaultModelSelection: null,
                  scripts: [],
                  createdAt: "2026-08-19T00:00:00.000Z",
                  updatedAt: "2026-08-19T00:00:00.000Z",
                  deletedAt: null,
                })
              : Option.none(),
          ),
      } as never),
    ),
    Layer.provideMerge(
      ServerSettingsLayerTest({
        providers: {
          claudeAgent: {
            enabled: true,
            homePath: home.homePath,
            mirrorExternalSessions: true,
          },
        },
      }),
    ),
    Layer.provideMerge(NodeServices.layer),
  );

  // The mirror forks its scan loop when the layer is built; wait for the first
  // pass to drain the transcript rather than assuming a fixed delay.
  const waitForScan = Effect.gen(function* () {
    const deadline = (yield* Clock.currentTimeMillis) + 5_000;
    while (dispatched.length === 0 && (yield* Clock.currentTimeMillis) < deadline) {
      yield* Effect.sleep(Duration.millis(25));
    }
  });

  return ClaudeSessionMirror.pipe(
    Effect.andThen(waitForScan),
    Effect.map((): ReadonlyArray<OrchestrationCommand> => dispatched),
    Effect.provide(layer),
  );
}

describe("ClaudeSessionMirror", () => {
  effectIt.live(
    "keeps the turn open across thinking and text records that share a stop_reason",
    () =>
      Effect.gen(function* () {
        const dispatched = yield* runMirror(transcriptLines);

        const deltas = dispatched.filter(
          (command) => command.type === "thread.message.assistant.delta",
        );
        expect(deltas.map((command) => (command as { delta: string }).delta)).toEqual([
          "The answer is 42.",
        ]);

        const completes = dispatched.filter(
          (command) => command.type === "thread.message.assistant.complete",
        );
        expect(completes).toHaveLength(1);
        expect(dispatched.indexOf(completes[0]!)).toBeGreaterThan(dispatched.indexOf(deltas[0]!));
        expect((completes[0] as { messageId: string }).messageId).toBe(
          (deltas[0] as { messageId: string }).messageId,
        );
      }),
  );

  effectIt.live("does not complete an assistant message for a turn that produced no text", () =>
    Effect.gen(function* () {
      const dispatched = yield* runMirror((workspaceRoot) =>
        transcriptLines(workspaceRoot).slice(0, 2),
      );

      expect(
        dispatched.filter((command) => command.type === "thread.message.assistant.complete"),
      ).toHaveLength(0);
      expect(
        dispatched.filter((command) => command.type === "thread.message.assistant.delta"),
      ).toHaveLength(0);
      // The session must still be released so the thread does not look stuck.
      const sessions = dispatched.filter((command) => command.type === "thread.session.set");
      expect((sessions.at(-1) as { session: { status: string } }).session.status).toBe("ready");
    }),
  );
});
