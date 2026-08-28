import { readFileSync } from "node:fs";

import {
  assertFrozenAuthorityLoaderProcess,
  type BuildToolchainAuthorityLoaderEvidence
} from "../../scripts/os01-build-toolchain-evidence";

const evidencePath = process.argv[2];
if (!evidencePath) throw new Error("authority-loader fixture requires evidence");
const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
  authorityLoader: BuildToolchainAuthorityLoaderEvidence;
  nodeExecutableSha256: string;
};
assertFrozenAuthorityLoaderProcess({
  root: process.cwd(),
  authorityLoader: evidence.authorityLoader,
  nodeExecutableSha256: evidence.nodeExecutableSha256
});
process.stdout.write("authority-loader-ok\n");
