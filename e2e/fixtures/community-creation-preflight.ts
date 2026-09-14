import { requireMutationEnvironment } from "./environment.ts";

export default function preflight(): void {
  requireMutationEnvironment();
}
