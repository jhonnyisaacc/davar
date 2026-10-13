# See which CI checks a pull request runs

`.github/workflows/ci.yml` runs on every pull request, with no base-branch filter, and on a push to `main`. A push to `staging` does not start it.

The job `gate` is the check to require on `main`. It fails when any needed job failed or was cancelled. A job that the path filter skipped does not fail `gate`. `.github/rulesets/main.json` still names `policy-gate`. Change the GitHub ruleset to require `gate` and signed commits. Do not add a ruleset on `staging`.

`hygiene` runs on every pull request. It checks the branch name, that each commit is Verified and authored by `jhonnyisaacc`, that no commit message has an AI co-author trailer, gitleaks, and actionlint.

`api`, `web`, `mobile`, `python`, and `knowledge` run only when `.github/ci/path-filters.yml` matches a changed path. `dup-code` runs on every pull request. The duplicate count is `.github/ci/dup-baseline.json`. A higher count fails the job. Lower the file in the same pull request after extracting the shared code.

To list the workflows a path starts, run this command from the repository root.

```
python3 .github/workflows/lib/which-workflows.py --base main web/src/main.tsx
```

Pass one path per argument. The command prints one workflow name per line. `--check` compares sample paths with the workflow filters.

`web` and `mobile` each run `bun install --frozen-lockfile` once, then `bun audit`. `web-preview` uses that same install, then `bun run build`. The `build` script in `web/package.json` does not install dependencies.

These pytest files run in the `CI` workflow.

- `tests/test_merge_strongs.py` and `tests/test_delitzsch_review.py` run in the `besorah` python suite.
- `tests/test_greek_importer.py` and `tests/test_greek_release.py` run in the `greek-source` python suite.

The `morphology` suite runs `tests/test_hutter_morphology.py` and `tests/test_hutter_attested_morphology.py` when those tests or the Hutter morphology modules they import change.
