import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import Settled from "./Migrations/033_ProjectionThreadsSettled.ts";
import AuthClientConnection from "./Migrations/041_AuthSessionClientConnection.ts";
import LinkedPullRequest from "./Migrations/042_ProjectionThreadLinkedPullRequest.ts";
import PullRequestFilesViewed from "./Migrations/053_PullRequestFilesViewed.ts";
import AutoSettleDisabledAt from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";
import OrchestrationV2 from "./Migrations/055_OrchestrationV2.ts";
import RemoveRedundantProjectionIndexes from "./Migrations/056_RemoveRedundantProjectionIndexes.ts";

// These IDs shipped in the fork. Preserve their ledger, repairing the skipped
// upstream schema before later migrations use it (57 already needs V2 tables).
export const reconcileForkRelayMigration = Effect.fn("reconcileForkRelayMigration")(function* (
  throughId = Number.POSITIVE_INFINITY,
) {
  const sql = yield* SqlClient.SqlClient;
  yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql<{ readonly name: string }>`
        SELECT name FROM sqlite_master WHERE type = 'table'
      `;
      const tableNames = new Set(tables.map(({ name }) => name));
      if (!tableNames.has("effect_sql_migrations")) return;
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations
      `;
      const names = new Map(history.map(({ migration_id, name }) => [migration_id, name]));
      const collided = (id: number, name: string) => id <= throughId && names.get(id) === name;

      if (collided(33, "ProjectionThreadSessionExternalControl")) yield* Settled;
      if (collided(41, "ProjectionThreadSessionExternalControl")) yield* AuthClientConnection;
      if (collided(42, "RepairProjectionThreadsSettled")) yield* LinkedPullRequest;
      if (collided(53, "ProjectionThreadSessionExternalControl")) yield* PullRequestFilesViewed;
      if (collided(54, "RepairProjectionThreadsSettled")) yield* AutoSettleDisabledAt;

      if (collided(55, "RepairAuthSessionClientConnection")) {
        const v2Tables = [
          "orchestration_v2_events",
          "orchestration_v2_projection_threads",
          "orchestration_v2_legacy_imports",
          "scheduled_tasks",
        ];
        const hasV2 = v2Tables.some((name) => tableNames.has(name));
        if (!hasV2) {
          yield* OrchestrationV2;
        } else {
          // A committed bootstrap is safe to retry. A partial/manual schema is
          // not: do not guess which non-idempotent bootstrap steps already ran.
          const eventColumns = yield* sql<{ readonly name: string }>`
            PRAGMA table_info(orchestration_events)
          `;
          if (
            !v2Tables.every((name) => tableNames.has(name)) ||
            !eventColumns.some(({ name }) => name === "application_event_version")
          ) {
            return yield* new Migrator.MigrationError({
              kind: "BadState",
              message: "Cannot reconcile fork migration 55 with an incomplete V2 schema.",
            });
          }
        }
      }
      if (collided(56, "RepairForkRelaySchema")) yield* RemoveRedundantProjectionIndexes;
    }).pipe(
      Effect.catchTags({
        SchemaError: (cause) =>
          Effect.fail(
            new Migrator.MigrationError({
              kind: "Failed",
              message: "Cannot decode legacy data while reconciling fork migrations.",
              cause,
            }),
          ),
      }),
    ),
  );
});
