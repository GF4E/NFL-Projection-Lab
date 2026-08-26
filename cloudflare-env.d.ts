declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    EVIDENCE: R2Bucket;
  }
}

declare module "*.sql?raw" {
  const sql: string;
  export default sql;
}
