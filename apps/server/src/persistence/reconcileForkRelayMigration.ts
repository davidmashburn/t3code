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

// Inspection must stay read-only: CLI callers use it before taking database ownership.
// These exact id/name pairs shipped in the fork; repair schema without rewriting its ledger.
export const planForkRelayMigration = Effect.fn("planForkRelayMigration")(function* (
  throughId = Number.POSITIVE_INFINITY,
) {
  const sql = yield* SqlClient.SqlClient;
  const tables = yield* sql<{ readonly name: string }>`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `;
  const tableNames = new Set(tables.map(({ name }) => name));
  const repairs: Array<typeof OrchestrationV2> = [];
  const repairedV2MigrationIds: Array<number> = [];
  if (tableNames.has("effect_sql_migrations")) {
    const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
      SELECT migration_id, name FROM effect_sql_migrations
    `;
    const names = new Map(history.map(({ migration_id, name }) => [migration_id, name]));
    const collided = (id: number, name: string) => id <= throughId && names.get(id) === name;
    const hasColumns = Effect.fn("ForkRelayMigration.hasColumns")(function* (
      table: string,
      expected: ReadonlyArray<string>,
    ) {
      const columns = yield* sql<{ readonly name: string }>`PRAGMA table_info(${sql(table)})`;
      return expected.every((name) => columns.some((column) => column.name === name));
    });

    if (
      collided(33, "ProjectionThreadSessionExternalControl") &&
      !(yield* hasColumns("projection_threads", ["settled_override", "settled_at"]))
    ) {
      repairs.push(Settled);
    }
    if (
      collided(41, "ProjectionThreadSessionExternalControl") &&
      !(yield* hasColumns("auth_sessions", ["client_surface", "client_app_version"]))
    ) {
      repairs.push(AuthClientConnection);
    }
    if (
      collided(42, "RepairProjectionThreadsSettled") &&
      !(yield* hasColumns("projection_threads", ["linked_pull_request_json"]))
    ) {
      repairs.push(LinkedPullRequest);
    }
    if (
      collided(53, "ProjectionThreadSessionExternalControl") &&
      !tableNames.has("pull_request_files_viewed")
    ) {
      repairs.push(PullRequestFilesViewed);
    }
    if (
      collided(54, "RepairProjectionThreadsSettled") &&
      !(yield* hasColumns("projection_threads", ["auto_settle_disabled_at"]))
    ) {
      repairs.push(AutoSettleDisabledAt);
    }

    if (collided(55, "RepairAuthSessionClientConnection")) {
      const v2Tables = [
        "orchestration_v2_events",
        "orchestration_v2_projection_threads",
        "orchestration_v2_legacy_imports",
        "scheduled_tasks",
      ];
      const hasApplicationEvents = yield* hasColumns("orchestration_events", [
        "application_event_version",
      ]);
      if (!v2Tables.some((name) => tableNames.has(name)) && !hasApplicationEvents) {
        repairs.push(OrchestrationV2);
      } else if (!v2Tables.every((name) => tableNames.has(name)) || !hasApplicationEvents) {
        // A transactional bootstrap can be retried; do not replay it over a partial/manual schema.
        return yield* new Migrator.MigrationError({
          kind: "BadState",
          message: "Cannot reconcile fork migration 55 with an incomplete V2 schema.",
        });
      }
      repairedV2MigrationIds.push(55);
    }
    if (collided(56, "RepairForkRelaySchema")) {
      const indexes = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'index' AND name IN (
          'idx_projection_threads_project_id',
          'idx_projection_thread_messages_thread_created',
          'idx_projection_thread_activities_thread_sequence',
          'idx_projection_turns_thread_requested'
        )
      `;
      if (indexes.length > 0) repairs.push(RemoveRedundantProjectionIndexes);
      repairedV2MigrationIds.push(56);
    }
  }

  return {
    hasPending: repairs.length > 0,
    repairedV2MigrationIds,
    reconcile:
      repairs.length === 0
        ? Effect.void
        : sql.withTransaction(
            Effect.forEach(repairs, (repair) => repair, { discard: true }).pipe(
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
          ),
  };
});
