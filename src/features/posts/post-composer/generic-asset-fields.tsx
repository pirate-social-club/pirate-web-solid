// Downloadable-file fields shown on the file tab, ported from the React
// post-composer-generic-asset-fields.tsx.

import { Show } from "solid-js";

import { Input, Type } from "../../../design-system";
import type { DownloadFileComposerState } from "./types";

const DOWNLOAD_ACCEPT = ".csv,.tsv,.txt,.json,text/csv,text/tab-separated-values,text/plain,application/json";

export function PostComposerGenericAssetFields(props: {
  file: DownloadFileComposerState;
  onFileChange: (next: DownloadFileComposerState) => void;
}) {
  return (
    <section class="space-y-3 rounded-[var(--radius-lg)] border border-border-soft bg-muted/30 p-4">
      <div>
        <Type as="p" variant="body-strong">Downloadable file</Type>
        <Type as="p" variant="body" class="text-muted-foreground">
          CSV, TSV, TXT, and JSON files are scanned before publication. Locked delivery keeps plaintext available to the platform for rescanning.
        </Type>
      </div>
      <Input
        accept={DOWNLOAD_ACCEPT}
        onChange={(event) => {
          const next = event.currentTarget.files?.[0] ?? null;
          props.onFileChange({ upload: next, label: next?.name });
        }}
        type="file"
      />
      <Show when={props.file.upload}>
        {(upload) => (
          <Type as="p" variant="caption" class="text-muted-foreground">
            {upload().name} · {upload().size.toLocaleString()} bytes
          </Type>
        )}
      </Show>
      <Type as="p" variant="caption" class="text-muted-foreground">
        Public/free delivery is not enabled yet. This creator flow publishes locked goods on the simulated Base Sepolia USDC rail.
      </Type>
    </section>
  );
}
