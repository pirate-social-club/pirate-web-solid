import type { NamespaceCommandIdempotencyKeys } from "./owner-settings-model";

export function namespaceIdempotencyKeys(operationId: string): NamespaceCommandIdempotencyKeys {
  return {
    acknowledge_complete_resource: `${operationId}-acknowledge-complete-resource`,
    activate: `${operationId}-activate`,
    change_namespace: `${operationId}-change-namespace`,
    poll: `${operationId}-poll`,
    restart: `${operationId}-restart`,
    select_namespace: `${operationId}-select-namespace`,
    start_verification: `${operationId}-start-verification`,
    submit_name_signature: `${operationId}-submit-name-signature`,
  };
}
