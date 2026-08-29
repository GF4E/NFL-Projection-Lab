#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  statSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  canonicalJson,
  codePointCompare,
  STAGING_CENSUS_EXACT_BODY,
  STAGING_CENSUS_EXACT_BODY_SHA256,
  STAGING_CENSUS_ID,
  STAGING_CENSUS_SEMANTIC_CONTRACT
} from "../qualification/os01-staging-census/contract";

type CensusTransport = (request: Request) => Promise<Response>;

export type CensusControllerInput = {
  intentPath: string;
  responsePath: string;
  resultPath: string;
  authorizationToken: string;
  transport?: CensusTransport;
  now?: () => Date;
};

export type CensusControllerResult = {
  version: "engine-os.os01-staging-census-controller-result.v1";
  status: "accepted_read_only_census" | "terminal_transport_uncertain" | "terminal_invalid_response";
  qualificationId: string;
  attemptId: string;
  requestBodySha256: string;
  responseBytesSha256: string | null;
  httpStatus: number | null;
  retryAllowed: false;
  providerSecretRead: false;
  providerRequest: false;
  quotaReservation: false;
  databaseMutationAttempted: false;
  controlPlanePostcheckRequired: true;
  recordedAt: string;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertPrivateParent(path: string): void {
  const parent = dirname(resolve(path));
  const stat = statSync(parent);
  if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
    throw new Error("controller receipt parent must be an existing mode-0700 directory");
  }
}

function exclusiveDurableJson(path: string, value: unknown): void {
  assertPrivateParent(path);
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes, { encoding: "utf8" });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const directory = openSync(dirname(resolve(path)), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

function exclusiveDurableBytes(path: string, bytes: Uint8Array): void {
  assertPrivateParent(path);
  const descriptor = openSync(path, "wx", 0o600);
  try {
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  const directory = openSync(dirname(resolve(path)), "r");
  try {
    fsyncSync(directory);
  } finally {
    closeSync(directory);
  }
}

function assertDistinctPrivatePaths(input: CensusControllerInput): void {
  const paths = [input.intentPath, input.responsePath, input.resultPath].map((path) => resolve(path));
  if (new Set(paths).size !== paths.length) throw new Error("controller receipt paths must be distinct");
  for (const path of paths) assertPrivateParent(path);
}

function validHex(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function validateResponse(bytes: Uint8Array): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return false;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const receipt = parsed as Record<string, unknown>;
  const claimedHash = receipt.receiptHash;
  if (!validHex(claimedHash)) return false;
  const body = { ...receipt };
  delete body.receiptHash;
  if (sha256(canonicalJson(body)) !== claimedHash) return false;
  if (receipt.version !== STAGING_CENSUS_SEMANTIC_CONTRACT.responseVersion ||
      receipt.status !== "read_only_schema_census_captured" ||
      receipt.censusId !== STAGING_CENSUS_ID ||
      receipt.catalogRows !== STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogRows ||
      receipt.catalogHash !== STAGING_CENSUS_SEMANTIC_CONTRACT.expectedCatalogHash ||
      receipt.userTableCount !== STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount ||
      receipt.prePostCatalogMatch !== true || receipt.prePostRowCountsMatch !== true ||
      receipt.snapshotClaim !== STAGING_CENSUS_SEMANTIC_CONTRACT.consistencyClaim ||
      receipt.requestBudgetClaim !== "controller_enforced_single_invocation_not_runtime_durable" ||
      receipt.databaseMutationAttempted !== false || receipt.providerBindings !== 0 ||
      receipt.providerSecretReads !== 0 || receipt.providerDispatches !== 0 ||
      receipt.quotaReservations !== 0 || receipt.captureActivations !== 0 ||
      receipt.productionReads !== 0 || receipt.productionMutations !== 0 ||
      receipt.claimBoundary !== "isolated_staging_read_only_census_only") {
    return false;
  }
  if (!Array.isArray(receipt.tables) ||
      receipt.tables.length !== STAGING_CENSUS_SEMANTIC_CONTRACT.expectedUserTableCount ||
      !Array.isArray(receipt.viewNames) || receipt.userViewCount !== receipt.viewNames.length) {
    return false;
  }
  const tables = receipt.tables as unknown[];
  const normalizedTables: Array<{
    name: string;
    createSql: string;
    rowCount: number;
    foreignKeys: unknown[];
  }> = [];
  for (const value of tables) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const table = value as Record<string, unknown>;
    if (typeof table.name !== "string" || typeof table.createSql !== "string" ||
        table.createSqlHash !== sha256(table.createSql) ||
        !Number.isSafeInteger(table.rowCount) || (table.rowCount as number) < 0 ||
        !Array.isArray(table.foreignKeys)) {
      return false;
    }
    for (const foreignKey of table.foreignKeys) {
      if (!foreignKey || typeof foreignKey !== "object" || Array.isArray(foreignKey)) return false;
      const row = foreignKey as Record<string, unknown>;
      if (!Number.isSafeInteger(row.id) || (row.id as number) < 0 ||
          !Number.isSafeInteger(row.seq) || (row.seq as number) < 0 ||
          typeof row.table !== "string" || typeof row.from !== "string" ||
          (typeof row.to !== "string" && row.to !== null) ||
          typeof row.on_update !== "string" || typeof row.on_delete !== "string" ||
          typeof row.match !== "string") {
        return false;
      }
    }
    normalizedTables.push({
      name: table.name,
      createSql: table.createSql,
      rowCount: table.rowCount as number,
      foreignKeys: table.foreignKeys
    });
  }
  const tableNames = normalizedTables.map((table) => table.name);
  if (new Set(tableNames).size !== tableNames.length ||
      [...tableNames].sort(codePointCompare).some((name, index) => name !== tableNames[index])) return false;
  const viewNames = receipt.viewNames as unknown[];
  if (viewNames.some((name) => typeof name !== "string") || new Set(viewNames).size !== viewNames.length ||
      [...viewNames].sort((left, right) => codePointCompare(String(left), String(right)))
        .some((name, index) => name !== viewNames[index])) {
    return false;
  }
  if (!validHex(receipt.tableSetHash) || !validHex(receipt.viewSetHash) || !validHex(receipt.ddlRoot) ||
      !validHex(receipt.foreignKeyRoot) || !validHex(receipt.rowCountRoot) ||
      receipt.tableSetHash !== sha256(canonicalJson(tableNames)) ||
      receipt.viewSetHash !== sha256(canonicalJson(viewNames)) ||
      receipt.ddlRoot !== sha256(canonicalJson(normalizedTables.map((table) => ({
        name: table.name,
        createSql: table.createSql
      })))) ||
      receipt.foreignKeyRoot !== sha256(canonicalJson(normalizedTables.map((table) => ({
        name: table.name,
        foreignKeys: table.foreignKeys
      })))) ||
      receipt.rowCountRoot !== sha256(canonicalJson(normalizedTables.map((table) => ({
        name: table.name,
        rowCount: table.rowCount
      }))))) {
    return false;
  }
  return true;
}

export async function runOs01StagingCensusController(
  input: CensusControllerInput
): Promise<CensusControllerResult> {
  assertDistinctPrivatePaths(input);
  if (!input.authorizationToken || /[\r\n]/u.test(input.authorizationToken)) {
    throw new Error("one ephemeral Sites authorization token is required");
  }
  const now = input.now ?? (() => new Date());
  const attemptId = randomUUID();
  const intent = {
    version: "engine-os.os01-staging-census-controller-intent.v1",
    status: "reserved_before_transport_no_retry",
    qualificationId: STAGING_CENSUS_ID,
    attemptId,
    projectId: STAGING_CENSUS_SEMANTIC_CONTRACT.projectId,
    origin: STAGING_CENSUS_SEMANTIC_CONTRACT.origin,
    method: STAGING_CENSUS_SEMANTIC_CONTRACT.method,
    route: STAGING_CENSUS_SEMANTIC_CONTRACT.route,
    contentType: STAGING_CENSUS_SEMANTIC_CONTRACT.contentType,
    requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
    credentialKind: "ephemeral_sites_siwe_not_persisted",
    retryAllowedAfterReservation: false,
    controlPlanePrecheckRequired: true,
    controlPlanePostcheckRequired: true,
    databaseMutationAllowed: false,
    providerRequestAllowed: false,
    recordedAt: now().toISOString()
  };
  exclusiveDurableJson(input.intentPath, intent);

  let response: Response;
  try {
    const request = new Request(
      `${STAGING_CENSUS_SEMANTIC_CONTRACT.origin}${STAGING_CENSUS_SEMANTIC_CONTRACT.route}`,
      {
        method: STAGING_CENSUS_SEMANTIC_CONTRACT.method,
        headers: {
          Authorization: `Bearer ${input.authorizationToken}`,
          "Content-Type": STAGING_CENSUS_SEMANTIC_CONTRACT.contentType
        },
        body: STAGING_CENSUS_EXACT_BODY,
        redirect: "error"
      }
    );
    response = await (input.transport ?? fetch)(request);
  } catch {
    const result: CensusControllerResult = {
      version: "engine-os.os01-staging-census-controller-result.v1",
      status: "terminal_transport_uncertain",
      qualificationId: STAGING_CENSUS_ID,
      attemptId,
      requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
      responseBytesSha256: null,
      httpStatus: null,
      retryAllowed: false,
      providerSecretRead: false,
      providerRequest: false,
      quotaReservation: false,
      databaseMutationAttempted: false,
      controlPlanePostcheckRequired: true,
      recordedAt: now().toISOString()
    };
    exclusiveDurableJson(input.resultPath, result);
    return result;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  exclusiveDurableBytes(input.responsePath, bytes);
  const valid = response.status === 200 &&
    response.headers.get("content-type")?.toLowerCase().startsWith("application/json") === true &&
    validateResponse(bytes);
  const result: CensusControllerResult = {
    version: "engine-os.os01-staging-census-controller-result.v1",
    status: valid ? "accepted_read_only_census" : "terminal_invalid_response",
    qualificationId: STAGING_CENSUS_ID,
    attemptId,
    requestBodySha256: STAGING_CENSUS_EXACT_BODY_SHA256,
    responseBytesSha256: sha256(bytes),
    httpStatus: response.status,
    retryAllowed: false,
    providerSecretRead: false,
    providerRequest: false,
    quotaReservation: false,
    databaseMutationAttempted: false,
    controlPlanePostcheckRequired: true,
    recordedAt: now().toISOString()
  };
  exclusiveDurableJson(input.resultPath, result);
  return result;
}

function argument(name: string): string {
  const at = process.argv.indexOf(name);
  if (at < 0 || !process.argv[at + 1]) throw new Error(`missing ${name}`);
  return process.argv[at + 1]!;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const token = readFileSync(0, "utf8").trimEnd();
  const result = await runOs01StagingCensusController({
    intentPath: argument("--intent"),
    responsePath: argument("--response"),
    resultPath: argument("--result"),
    authorizationToken: token
  });
  const resultStat = lstatSync(argument("--result"));
  if (!resultStat.isFile() || resultStat.nlink !== 1 || (resultStat.mode & 0o777) !== 0o600) {
    throw new Error("controller result is not a mode-0600 single-link file");
  }
  process.stdout.write(`${result.status}\n`);
  if (result.status !== "accepted_read_only_census") process.exitCode = 1;
}
