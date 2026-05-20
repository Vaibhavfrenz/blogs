# Visuals Added: netflix-dq

## Mermaid diagrams

1. **End of Section 1 (The problem with quality-on-top)** — Side-by-side flowchart contrasting "quality-on-top" (write -> publish -> test -> alert fires after dashboards are wrong) with "quality-in-the-table" (write -> hidden branch -> audit -> publish only if clean). Makes the contrarian argument visual before the reader hits the mechanism. Alt text: "Two flowcharts side by side. On the left, a writer publishes directly to a main table that feeds dashboards, with tests and Slack alerts firing afterward. On the right, a writer publishes to a hidden branch that is audited; only passing data fast-forwards to main and reaches dashboards."

2. **End of Section 2 (Netflix's insight)** — Sequence diagram of the WAP loop showing writer, hidden branch, auditor, main snapshot, and consumer over time, with pass/fail branches. This is the most important diagram in the article because WAP is the single concept the whole piece turns on. Alt text: "Sequence diagram showing a writer pushing data to a hidden Iceberg branch, an auditor running checks against the branch, and either fast-forwarding the main snapshot or keeping the branch quarantined while the consumer continues reading the last good snapshot."

3. **Middle of Section 4 (The honest limits)** — Layered diagram of producer -> storage -> pipeline -> catalog -> consumer, with Netflix / Uber / LinkedIn / Airbnb tagged onto the layer each one chose. Makes the "different layers" point concrete and reinforces why Netflix's bet is unique. Alt text: "Five-layer stack from producer to consumer, with Netflix labelled at the storage layer, Uber at the pipeline layer, LinkedIn at the catalog layer, and Airbnb at the consumer layer."

## Image placeholders for the user
None. The article is self-contained and the three Mermaid diagrams cover the load-bearing concepts. A real Iceberg WAP config screenshot or Monte Carlo dashboard could be added later, but neither is necessary for the argument and either would push the piece toward "tutorial" instead of "opinion-led deep-dive."

## Notes
- Skipped a 90-day phases flowchart on purpose. The Section 3 prose is already a tight numbered checklist with three named phases and three named pitfalls — a flowchart there would be visual filler that competes with the prose rather than replacing it. The edit notes also warned not to dilute Section 4 with a generic "modern data stack" visual; the FAANG-layers diagram is specifically anchored to the four named companies and their cited sources, so it earns its place.
- The WAP sequence diagram (#2) deliberately uses `alt` to show both pass and fail paths — the fail path is the whole reason the pattern matters, and burying it would weaken the diagram.
- The FAANG-layers diagram uses brand colors as a light visual cue (Netflix red, LinkedIn blue, Airbnb coral, Uber black). If GitHub's Mermaid renderer drops the `classDef` colors for any reason, the diagram still reads correctly in monochrome — colors are reinforcement, not the message.
- All three diagrams stay well under the 15-node ceiling (largest is the side-by-side at 12 nodes total).
