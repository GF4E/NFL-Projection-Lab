declare module "virtual:os01-hosted-migration-authority" {
  import type { Os01HostedMigrationAuthority } from "./core";

  export const authorizedActions: readonly ["blank_prestate_component_probe"];
  const authority: Os01HostedMigrationAuthority;
  export default authority;
}
