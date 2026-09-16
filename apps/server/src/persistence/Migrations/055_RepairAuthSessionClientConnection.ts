import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(auth_sessions)
  `;

  // Fork builds previously occupied migration id 41. Reapply the idempotent
  // upstream schema change for databases where that numeric id was skipped.
  if (!columns.some((column) => column.name === "client_surface")) {
    yield* sql`
      ALTER TABLE auth_sessions
      ADD COLUMN client_surface TEXT
    `;
  }

  if (!columns.some((column) => column.name === "client_app_version")) {
    yield* sql`
      ALTER TABLE auth_sessions
      ADD COLUMN client_app_version TEXT
    `;
  }
});
