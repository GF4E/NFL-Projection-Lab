export const schemaAuthorityHistory = Object.freeze([
  ["0013_engine_os_urgent", "sha256:6205a3dfe09c2d663bb8c50378f295accd266ff2b2018668ca5353436a6797bb"],
  ["0014_odds_quota_reservations", "sha256:91bc1571f8873ccaeb8a2b8a9a8c2425370b4eec3c0931f1fa3ae02ffae56da1"],
  ["0015_engine_os_origin_identity", "sha256:622fb472f959273563f3dd139b7dde676e27b370a52c0241d6ee4d3726e3444a"],
  ["0016_engine_os_interim_scheduler", "sha256:bad6665a2976440b108e1c0223d01dab3a0313283b8d2e08f0eb509ef57edcb2"],
  ["0017_engine_os_source_capture", "sha256:d25f6119f4d0735247489623e5775cb185c866d7a3f1ebbb791c5f5cfaeac0e7"],
  ["0018_engine_os_forecast_ledger", "sha256:851f66b3ad07afe61be346b09f853875e675d25512f989b0f4337f6c64a1c293"],
  ["0019_engine_os_schema_closure", "sha256:9655dbc30cc725ed1b358cdcac3fcd3a441678e7a3d45bd31fa2c2a3f124b336"],
  ["0020_engine_os_plays_reconciliation", "sha256:ad9cdf8d26293ecc3720bb08c8c1bd8a04df14d72159f4a04684b19debc83247"]
] as const);

export const terminalSchemaAuthority = Object.freeze({
  version: schemaAuthorityHistory.at(-1)![0],
  migrationHash: schemaAuthorityHistory.at(-1)![1]
});

type SchemaVersionRow = {
  version: string;
  migration_hash: string;
};

const verifiedDatabases = new WeakMap<object, Promise<void>>();

async function verifyTerminalReceipt(db: D1Database): Promise<void> {
  const query = await db.prepare(
    "SELECT version, migration_hash FROM engine_schema_versions ORDER BY version"
  ).all<SchemaVersionRow>();
  const rows = query.results ?? [];
  const exact = rows.length === schemaAuthorityHistory.length && rows.every((row, index) => {
    const expected = schemaAuthorityHistory[index]!;
    return row.version === expected[0] && row.migration_hash === expected[1];
  });
  if (!exact) {
    throw new Error(
      `D1 schema authority is unavailable: expected exact history through ` +
      `${terminalSchemaAuthority.version} ${terminalSchemaAuthority.migrationHash}`
    );
  }
}

/**
 * Read-only terminal migration check for every active database execution lane.
 * The promise is cached per binding object, including failures, so a drifted
 * isolate remains fail-closed until it is replaced after a migration/restore.
 */
export function assertD1SchemaAuthority(db: D1Database): Promise<void> {
  const identity = db as unknown as object;
  const current = verifiedDatabases.get(identity);
  if (current) return current;
  const verification = verifyTerminalReceipt(db);
  verifiedDatabases.set(identity, verification);
  return verification;
}
