---
name: seo
description: Reusable SEO planning and implementation workflow for web projects. Produces three default outputs: implementation checklist, keyword/intent brief, and verification runbook. Prioritizes source-owned metadata, crawl/index reliability, and measurable results.
license: MIT
---

# SEO

## Overview

Use this skill when you need to improve search discoverability in a structured, repeatable way without guessing.

This skill always produces three outputs:
1. Implementation checklist
2. Keyword and intent brief
3. Verification runbook

## When to Use

Use this skill when:
- A site is not appearing for important queries.
- Rankings are weak for target terms in one or more languages.
- SEO signals exist only in generated output and not in source files.
- You need a reusable SEO process for new projects.

Do not use this skill when:
- The task is only visual design with no discoverability objective.
- The project has no indexable web surface.

## Core Principles

1. Source first: metadata and crawl artifacts must be owned by source code or deterministic build scripts.
2. Crawl reliability before content expansion.
3. Canonical and language policy must be explicit.
4. Measure outcomes in Search Console before declaring success.
5. Prefer incremental releases with validation gates.

## Inputs Required

Collect these inputs before planning:
- Primary target queries per language.
- Current route inventory.
- Current metadata and schema implementation.
- Current robots, sitemap, and crawl directives.
- Hosting and routing behavior for deep links and non-HTML assets.
- Search Console access status.

## Output 1: Implementation Checklist

Produce a file-by-file checklist with acceptance criteria.

Template:

```md
## Implementation Checklist

### A. Source Metadata Ownership
- [ ] File: <path>
  - Add static title, meta description, robots, canonical.
  - Acceptance: page source contains expected tags before JS executes.

### B. Language and Canonical Policy
- [ ] File: <path>
  - Add hreflang alternates and x-default policy.
  - Acceptance: canonical and alternates match route policy.

### C. Crawl Artifacts
- [ ] File: <path>
  - Add or generate robots.txt, sitemap.xml, llms.txt (and ai.txt if needed).
  - Acceptance: files are source-owned and served as text/xml, not HTML fallback.

### D. Structured Data
- [ ] File: <path>
  - Add JSON-LD blocks for WebSite, Organization, and relevant page types.
  - Acceptance: structured data parses cleanly in Rich Results tests.

### E. Routing Safeguards
- [ ] File: <path>
  - Ensure txt/xml endpoints bypass SPA fallback.
  - Acceptance: direct requests return raw artifact content with correct MIME.

### F. Internal Linking and Entry Pages
- [ ] File: <path>
  - Add high-intent entry pages and clear internal links.
  - Acceptance: target pages are crawlable and linked from at least one indexable page.
```

## Output 2: Keyword and Intent Brief

Produce a bilingual or multilingual query brief that maps terms to pages.

Template:

```md
## Keyword and Intent Brief

### Market Targets
- Language: <lang>
- Primary head term: <term>
- Secondary terms: <list>

### Intent Clusters
1. Informational: <queries>
2. Navigational: <queries>
3. Comparative or tool-driven: <queries>

### Page Mapping
- Query cluster: <name>
- Target URL: <url>
- Primary title angle: <copy>
- Primary description angle: <copy>
- Supporting internal links: <list>

### Content Gaps
- Missing page or section: <gap>
- Priority: High/Medium/Low
```

## Output 3: Verification Runbook

Produce pre-merge and post-deploy validation steps plus KPI tracking.

Template:

```md
## Verification Runbook

### Pre-Merge
1. Validate source tags for title, description, robots, canonical, alternates.
2. Validate JSON-LD structure and syntax.
3. Validate robots/sitemap artifacts exist in source.
4. Validate routing rules preserve txt/xml endpoints.

### Post-Deploy
1. Fetch /robots.txt and verify directives.
2. Fetch /sitemap.xml and verify URL set quality.
3. Inspect homepage source and confirm static SEO tags.
4. Run Rich Results validation.
5. Submit or refresh sitemap in Search Console.
6. Inspect key URLs for indexability and canonical status.

### KPI Monitoring
1. Query impressions and clicks by target cluster.
2. Average position by target cluster.
3. Indexed coverage by route class.
4. CTR trend on primary landing pages.
5. Weekly review for 4-8 weeks.
```

## Reusable Implementation Sequence

Follow this order:
1. Baseline audit and gap list.
2. Source metadata and canonical policy.
3. Crawl artifact ownership and routing safeguards.
4. Structured data layering.
5. Intent page mapping and internal links.
6. Search Console submission and KPI tracking.

## Common Failure Modes

1. SEO tags only in generated dist output.
2. robots.txt or sitemap.xml rewritten to index.html by SPA fallback.
3. Canonical mismatch across routes.
4. hreflang added without consistent language routing.
5. Measuring rankings without first fixing indexability.

## Optional Advanced Patterns

Use when applicable:
1. Route-level X-Robots-Tag headers for special endpoints.
2. Plain-text sitemap in addition to XML sitemap.
3. llms.txt and ai.txt for machine-readable discovery guidance.
4. Route-specific metadata generation for high-value deep pages.

## Deliverable Contract

When this skill is used, always deliver:
1. A concrete implementation checklist with exact file targets.
2. A query intent brief mapped to URLs and metadata copy direction.
3. A verification runbook with deploy checks and KPI review cadence.
