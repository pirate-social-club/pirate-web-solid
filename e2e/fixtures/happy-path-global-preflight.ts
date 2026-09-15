import { requireHappyPathPlaybackEnvironment } from "./happy-path-preflight.ts";

export default function globalPreflight(): void {
  requireHappyPathPlaybackEnvironment();
}
