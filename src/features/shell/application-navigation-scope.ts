import { platformNavigationScope, type ApplicationNavigationScope } from "./navigation-model.ts";

/** Community-domain scope is deferred until its ingress and navigation release. */
export function currentApplicationNavigationScope(): ApplicationNavigationScope {
  return platformNavigationScope;
}
