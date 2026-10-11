# CV verification and publication

The owner will not pay GitHub for this CV. `sync-private-cv.yml` uses standard
`ubuntu-24.04` runners in this public repository, which are
[free for public repositories](https://docs.github.com/en/billing/concepts/product-billing/github-actions).
Do not introduce larger runners, paid services, private hosted workflows, or
additional source/write credentials. The only retained artifact is the small
verified web pair plus its SHA-256 manifest, with one-day retention; keep it
within the included storage allowance. No persistent build cache is used.

The build job checks out the private canonical source with `PRIVATE_CV_READ_KEY`.
It runs `final_generic/scripts/verify_ci.sh`, covering unit tests, all 24 CV
variants, private DRV editions, delivery verification, and forced public PDF
verification. The helper captures Make, LaTeX, OCR, and test diagnostics in an
ephemeral private directory, emits only fixed gate summaries, and deletes those
diagnostics on success or failure. Never print private diagnostics or upload
logs, source, photographs, signatures, normal PDFs, or restricted-mode PDFs.
Reproduce a failed gate locally in the private checkout for detailed output.

Daily scheduled builds refresh metrics once in their ephemeral checkout before
running every gate. Other events use the committed snapshot and enforce its
30-hour freshness limit. The source key is read-only, so this automation never
writes refreshed snapshots back into the private repository.

Only the verified default-mode English and German web PDFs and `SHA256SUMS`
cross into the publishing job. The build verifies that exact artifact allowlist
before upload and removes its private checkout afterward, including on failure.
The isolated publishing job uses `PUBLIC_CV_WRITE_KEY`, publishes only the
approved pair, and verifies the live GitHub Pages bytes. Keep the two credential
domains separate.

A private content release must still run `make deploy-web` from the private
canonical source after its signed commit is pushed. That command dispatches a
new manual run for the exact pushed 40-character private SHA and requires the
full verification step, checksum artifact, landing page, public two-PDF tree,
and byte-for-byte live URL checks to pass. A prior scheduled success is not
evidence for a new private commit. Private pushes and pull requests do not
automatically dispatch this workflow.
