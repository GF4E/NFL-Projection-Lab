import authority, { authorizedActions } from "virtual:os01-hosted-migration-authority";
import { handleOs01HostedMigrationQualification } from "./core";

interface QualificationEnvironment {
  DB: D1Database;
}

/**
 * Standalone staging entrypoint. It is not imported by worker/index.ts and the
 * build script packages it without the application's migration directory, so
 * Sites cannot run a second automatic migration path before this route.
 */
const worker = {
  fetch(request: Request, environment: QualificationEnvironment): Promise<Response> {
    return handleOs01HostedMigrationQualification(
      request,
      environment.DB,
      authority,
      authorizedActions
    );
  }
};

export default worker;
