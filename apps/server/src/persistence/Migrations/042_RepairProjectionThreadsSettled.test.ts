import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

const settledColumns = Effect.fn("settledColumns")(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string; readonly notnull: number }>`
    PRAGMA table_info(projection_threads)
  `;
  return columns
    .filter((column) => column.name === "settled_override" || column.name === "settled_at")
    .map(({ name, notnull }) => ({ name, notnull }));
});

layer("042_RepairProjectionThreadsSettled", (it) => {
  it.effect("repairs databases where the old fork migration consumed ID 33", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* runMigrations({ toMigrationInclusive: 32 });
      yield* sql`
        INSERT INTO effect_sql_migrations (migration_id, name)
        VALUES (33, 'ProjectionThreadSessionExternalControl')
      `;
      yield* runMigrations({ toMigrationInclusive: 41 });

      assert.deepEqual(yield* settledColumns(), []);

      yield* runMigrations({ toMigrationInclusive: 42 });

      assert.deepEqual(yield* settledColumns(), [
        { name: "settled_override", notnull: 0 },
        { name: "settled_at", notnull: 0 },
      ]);
    }),
  );
});
