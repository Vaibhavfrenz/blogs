---
title: "Quality Belongs in the Table, Not on Top of It"
subtitle: "Netflix's WAP pattern shows where data quality really belongs — and most teams can steal it without rebuilding Netflix"
slug: "quality-belongs-in-the-table"
tags: "data-engineering, dataops, data-architecture"
domain: "vaibhavfrenz.hashnode.dev"
cover: "https://cdn.hashnode.com/res/hashnode/image/upload/PLACEHOLDER"
saveAsDraft: false
ignorePost: false
enableToc: true
seoTitle: "Quality Belongs in the Table, Not on Top of It | Netflix WAP Pattern"
seoDescription: "Netflix pushed data quality into Iceberg's storage layer via Write-Audit-Publish. Here's how to adopt it in 90 days without rebuilding Netflix's platform."
---

> Netflix's quietest contribution to data engineering was pushing quality into the storage layer through Iceberg's Write-Audit-Publish pattern — and most teams can steal it without rebuilding Netflix.

Picture a busy restaurant kitchen. Every plate moves to a counter called the pass, where an expediter checks the garnish, the temperature, the plating. Only plates that survive that glance cross the line into the dining room. The diner never sees a rejected plate — it goes back to the cook.

Most data teams do not have a pass. They have a manager walking the dining room asking diners how the meal is. By the time anyone notices a bad batch, it is already in dashboards, in models, and in the deck the CFO is reading on a Tuesday morning. The trust tax is paid before anyone knew there was a bill.

Netflix figured out something subtle here. The fix is not a better manager. The fix is a pass — and the pass belongs inside the table itself.

## The problem with quality-on-top

Walk through a typical modern stack. Spark or dbt writes to a table. The table is published. Then dbt tests run. Then [Great Expectations](https://greatexpectations.io/) runs. Then [Monte Carlo](https://www.montecarlodata.com/) or [Soda](https://www.soda.io/) sweeps for anomalies. Then a Slack alert fires.

Every one of those tools is good. Every one runs after consumers can already see the data. That is the structural problem.

You wrote the bad row. You published it. The dashboard refreshed. Now you are racing the consumer's first glance. The industry spent five years optimising how fast you can apologise, not how to stop the bad plate from leaving the kitchen.

The cost is not just the broken dashboard. It is the rollback, the Slack thread, the "is this number still wrong?" message three days later, and the slow erosion of trust that makes analysts triple-check every figure before they ship it. Every bad publish is a small tax on how seriously anyone takes your data.

This is the layer the industry got wrong. Catalogs, observability vendors, post-publish tests — all of them sit on top of the table. None of them stops the table from going bad in the first place.

![Quality-on-top vs Write-Audit-Publish side by side. The old model alerts after bad data is already visible; WAP inspects before consumers can see it.](https://raw.githubusercontent.com/Vaibhavfrenz/blogs/main/blogs/diagrams/quality-diagram-comparison.svg)

*The old model alerts you after the bad row is already on dashboards. WAP inspects the plate before it crosses the line — consumers reading `main` never see a failed batch.*

## Netflix's insight: make the table itself transactional

Netflix runs roughly a one-exabyte data lake on [Apache Iceberg](https://iceberg.apache.org/), with thousands of tables and a Hive-to-Iceberg migration of around 300 petabytes ([AWS re:Invent 2023, NFX306](https://www.classcentral.com/course/youtube-aws-re-invent-2023-netflix-s-journey-to-an-apache-iceberg-only-data-lake-nfx306-405862)). At that scale, manual quality is fantasy. So Netflix did something the rest of the industry mostly missed. They pushed quality checks into the table format itself, then upstreamed those checks into open-source Iceberg so anyone could use them.

The pattern is called Write-Audit-Publish, or WAP. In plain English, here is how it works.

When a job writes to an Iceberg table, the write does not land on `main`. It lands on a hidden branch — think `wap_<run_id>` — that consumers cannot see. Consumers reading `main` see the last good snapshot. They do not even know a write is in progress. The pass is set; the food is waiting.

An auditor runs against that branch snapshot. The auditor is just your quality checks: row counts, null rates, distribution checks, referential rules — whatever you already write. If the checks pass, a single metadata commit fast-forwards `main` to point at the new snapshot. The publish is atomic and nearly instant because no data is copied — only a pointer moves ([Vu Trinh's writeup of Netflix's pattern](https://vutr.substack.com/p/how-does-netflix-ensure-the-data)).

If the checks fail, `main` never moves. The branch stays around for forensics. Consumers keep reading the previous good snapshot. A bad batch never reaches the dining room.

The mechanism is exposed through two Iceberg table properties — `wap.id` and `wap.branch` — so your existing Spark or dbt writers do not need code changes. You set the properties on the table; the engine routes the write to a branch automatically ([AWS big data blog on WAP with Iceberg and Glue Data Quality](https://aws.amazon.com/blogs/big-data/build-write-audit-publish-pattern-with-apache-iceberg-branching-and-aws-glue-data-quality/)).

This is the pass. The branch holds the plate. The auditor inspects. The fast-forward commit is the moment the plate crosses the line. Diners never see a rejected dish.

![Sequence diagram of the Write-Audit-Publish loop. Writer sends data to a hidden branch, auditor inspects, and either fast-forwards main or quarantines the branch.](https://raw.githubusercontent.com/Vaibhavfrenz/blogs/main/blogs/diagrams/quality-wap-sequence.svg)

*The Write-Audit-Publish loop on an Iceberg table. The publish is a single metadata commit — no data is copied, and consumers reading `main` are never blocked.*

Netflix did not bolt this on with a wrapper service or a custom CI pipeline. They built it into the standard. That is why the rest of us can use it.

## How you adopt this in 90 days

Here the kitchen metaphor stops being a poem and starts being a checklist. The pattern is transferable. Expedia shipped it in production and wrote up the experience ([Chill Your Data with Iceberg Write Audit Publish, Expedia Group Tech](https://medium.com/expedia-group-tech/chill-your-data-with-iceberg-write-audit-publish-746c9eb3db48)) — they are not Netflix-scale, and neither are you.

Three phases.

**Phase one: confirm you are on Iceberg.** If your highest-stakes tables still live in vanilla Parquet or Hive, that migration is the project. Pick the tables that hurt the most when they break — the finance reconciliation table, the experiment exposure log, the daily revenue rollup. Move those first. Tables nobody complains about can wait.

**Phase two: wire WAP on three to five critical tables.** Set the `wap.id` and `wap.branch` table properties so the Iceberg Spark extensions route writes to a hidden branch. Pick a branch convention — `wap_<run_id>` per pipeline run is common — and add a publish task in your orchestrator that fast-forwards `main` on success. Tag the snapshot before the publish so a rollback is one command. Plan for days of work per table, not weeks.

**Phase three: plug your existing checks into the audit step.** You do not need new tooling. [dbt tests](https://docs.getdbt.com/docs/build/data-tests), Great Expectations, Soda — anything that runs against a Spark or Trino query — works as the auditor. You are not buying a new framework. You are running the one you already own, against the branch instead of `main`. The change is sequence, not stack.

Three honest pitfalls to plan for.

**Branch sprawl.** Branches accumulate. Without a TTL (time-to-live) or a cleanup job, your metastore quietly bloats and your storage bill creeps up. Build the cleanup into the same pipeline that creates the branch.

**Theatre audits.** A check that always passes is worse than no check, because it makes everyone feel safe. Review your audit definitions quarterly. Ask: when was the last time this check failed? If the answer is "never," it is probably wrong.

**The freshness tradeoff.** Every audit adds latency. If consumers expect minute-fresh data and your audit takes ten minutes, you have traded timeliness for accuracy. That can be the right trade — but make it deliberately, and pair WAP with a freshness SLA so the conversation is in the open.

Notice what is not on this list. You are not building Netflix's auditor framework. You are not standing up Maestro. You are not writing your own anomaly detection service. You are using a pattern that ships in the open-source table format, wired to checks you already own.

## The honest limits — and what Netflix didn't solve

WAP-on-branches is the pattern worth stealing. The rest of Netflix's data platform is mostly not.

Do not build your own Maestro. Do not build your own Unified Data Architecture. Do not try to replicate Netflix's internal auditor or their hierarchical robust PCA anomaly detector (a statistical method for spotting outliers across many signals at once). Those are platform programs that took a hundred engineers and years. For 99% of teams, the engineering math does not work.

Netflix's public material is loud about detection and quiet about remediation. Who owns fixing a rejected plate? What is the SLA on republishing? How does an analyst know, at a glance, whether the asset on their dashboard is trustworthy this morning? Netflix has answers internally. They have not published a playbook the rest of us can copy.

This is where other FAANG teams have the better story. Airbnb publishes a [DQ Score](https://medium.com/airbnb-engineering/how-airbnb-built-wall-to-prevent-data-bugs-ad1b081d6e8f) — a consumer-facing number, scored across a few dimensions, that tells an analyst how much to trust a table. Uber publishes a [statistical detection program](https://www.uber.com/us/en/blog/monitoring-data-quality-at-scale/) tuned hard against alert fatigue. LinkedIn puts quality in the catalog through DataHub assertions. Each one chose a different layer to put the work in.

![Flowchart showing Netflix, Uber, LinkedIn, and Airbnb each targeting a different layer of the data stack with their quality approach.](https://raw.githubusercontent.com/Vaibhavfrenz/blogs/main/blogs/diagrams/quality-faang-layers.svg)

*Four FAANG teams, four different layers. Netflix is alone at the storage layer — which is why the pattern is both the most under-appreciated and the most incomplete without a consumer-facing answer.*

Netflix's bet on the storage layer is the most under-appreciated of the four. It is also the most incomplete. WAP handles prevention — it stops the bad plate from reaching the diner. A consumer-facing score handles trust — it tells the diner how confident the kitchen is in tonight's menu. You want both.

The pragmatic move: adopt Netflix's pattern, buy a check or observability tool, and spend the saved engineering budget on the things only your team can build. Stewardship roles. Ownership models for each critical table. An incident response playbook. Some version of a consumer-facing score for the assets your business actually depends on. That is 80% of the Netflix outcome at 5% of the Netflix investment, and it fills the governance gap their public material leaves wide open.

This is also the DAMA pillar lens worth naming. Data Quality Management ([Pillar 11 in DMBOK](https://www.dama.org/cpages/body-of-knowledge)) is the obvious anchor. The unusual move is that WAP makes data quality a property of Data Storage and Operations (Pillar 4), not just an application-layer concern. That is the shift that matters. Quality stops being something a tool checks. It becomes something the table guarantees.

## Build the pass this quarter

The best kitchens do not rely on diners to spot a bad plate. They have a pass. Every serious data platform should too.

You do not need to be Netflix to build one. The primitives are in Iceberg, the blueprint is on the AWS blog, and at least one non-FAANG team has already done it and written about it. The pattern is sitting on the shelf.

Three time-boxed actions.

- **This week:** identify the one table your consumers complain about most. The table that breaks dashboards. The table that triggers Slack threads. That is your first candidate.
- **This sprint:** ship WAP on that single table. Set the table properties, wire your existing dbt or Great Expectations checks into the audit step, add the publish task.
- **This quarter:** roll the pattern out to your top ten highest-impact tables. Then turn to the part Netflix did not solve — who owns fixing a rejected plate, and what a consumer-facing quality score looks like for your organisation.

Stop asking diners how the food was. Build a pass.

---

## Sources

- [How does Netflix ensure the data quality for thousands of Apache Iceberg tables? — Vu Trinh](https://vutr.substack.com/p/how-does-netflix-ensure-the-data)
- [AWS re:Invent 2023 NFX306 — Netflix's Journey to an Apache Iceberg-Only Data Lake](https://www.classcentral.com/course/youtube-aws-re-invent-2023-netflix-s-journey-to-an-apache-iceberg-only-data-lake-nfx306-405862)
- [Build Write-Audit-Publish pattern with Apache Iceberg branching and AWS Glue Data Quality](https://aws.amazon.com/blogs/big-data/build-write-audit-publish-pattern-with-apache-iceberg-branching-and-aws-glue-data-quality/) — AWS Big Data Blog
- [Chill Your Data with Iceberg Write Audit Publish](https://medium.com/expedia-group-tech/chill-your-data-with-iceberg-write-audit-publish-746c9eb3db48) — Expedia Group Tech
- [How Airbnb Built "Wall" to Prevent Data Bugs](https://medium.com/airbnb-engineering/how-airbnb-built-wall-to-prevent-data-bugs-ad1b081d6e8f) — Airbnb Engineering
- [Monitoring Data Quality at Scale with Statistical Modeling](https://www.uber.com/us/en/blog/monitoring-data-quality-at-scale/) — Uber Engineering
- [Apache Iceberg documentation](https://iceberg.apache.org/)
- [dbt tests documentation](https://docs.getdbt.com/docs/build/data-tests)
- [DAMA-DMBOK Body of Knowledge](https://www.dama.org/cpages/body-of-knowledge)


