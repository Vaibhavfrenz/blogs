# Edit Report: netflix-dq

## Verdict
Ship-ready

## What I changed
- Tightened passive-voice phrasing throughout ("is noticed" -> "anyone notices", "every audit is latency" -> "every audit adds latency", "The change is sequence" kept but surrounding lines sharpened).
- Cut filler and hedging ("The thing worth noticing is", "More importantly", "genuinely", "actually", "quietly missed"/"mostly missed" tightened to one usage).
- Split a couple of long sentences into shorter declaratives in the contrarian section ("The pragmatic move..." rewritten as four short sentences).
- Glossed two pieces of jargon on first use: TTL (time-to-live), and the hierarchical robust PCA anomaly detector got a one-line plain-English gloss.
- Renamed the closing heading from "Where this is heading" to "Build the pass this quarter" so it tells the reader what they will learn / do.
- Smoothed transitions where successive sentences both started with "Every one of those tools" / "Every one of them" — gave them parallel but distinct openers.

## Flags for the writer / analyst
- [ ] Stat to verify: "Netflix runs roughly a one-exabyte data lake on Apache Iceberg, with thousands of tables and a Hive-to-Iceberg migration of around 300 petabytes." Single source (re:Invent 2023 NFX306) is two years old. Worth a 30-second check that the exabyte/300PB figures still represent the latest public number, or that the citation date is acknowledged. Not blocking.
- [ ] Outdated risk: Monte Carlo / Soda / Great Expectations product positioning moves fast — the draft only name-drops them as examples of post-hoc tools, which is safe. No claim about their feature set, so probably fine as is.
- [ ] Weak section: none. Section 4 ("The honest limits") is the strongest part of the article; do not let the diagram designer dilute it with a generic "modern data stack" visual.
- [ ] Source note: the DAMA-DMBOK link points to the body-of-knowledge landing page rather than a specific Pillar 11 section. Acceptable, but a deeper link would be stronger if one exists.

## Metaphor check
The restaurant-pass metaphor runs strong through the hook (full scene with expediter, line, dining room), returns explicitly in Section 2 ("This is the pass. The branch holds the plate."), surfaces again at the end of Section 3 ("the kitchen metaphor stops being a poem and starts being a checklist"), and closes the piece ("Stop asking diners how the food was. Build a pass."). No mixed metaphors. Strong throughout.

## Voice check
- Plain English: pass. Every piece of jargon (WAP, `wap.id`/`wap.branch`, fast-forward, hierarchical robust PCA, TTL) now has a plain-English gloss on first use.
- Short paragraphs: pass. Almost all paragraphs are 2–4 sentences; the longest is the Netflix-scale opener of Section 2, which earns its length.
- "You"-voice: pass. "You wrote the bad row. You published it. Your pipeline. Your team." Consistent throughout body and close.
- Active voice: pass. Remaining passives ("is exposed through two Iceberg table properties", "the publish is atomic") are technical descriptions where passive reads naturally.
