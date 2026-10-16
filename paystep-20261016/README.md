# PayStep story evidence (PR #91)

Local Storybook sweep evidence for pirate-web-solid#91, commit
`e4e9b519f57b22eb23ec89d502f42f53e1febece`, merged as `60d8f61`.

- `summary-*.txt`: the 13 local sweep summaries, 2026-10-16 08:00–08:14 UTC
  (first draft 08:00–08:07, five reruns 08:10–08:12, negative control 08:14).
- `paystep-ledger-extract.jsonl`: one row per PayStep story per run: run, story,
  interaction status, error text and the dialog's alert text.
- `paystep-evidence-summaries-and-extract.tar.gz`: the summaries and extract.
- `paystep-evidence-raw-ledgers.tar.gz`: the raw PayStep ledger lines from every run.
- `SHA256SUMS`: hashes of the files above.

The full-catalog gate summary is not included; it is in PR #91's body.
