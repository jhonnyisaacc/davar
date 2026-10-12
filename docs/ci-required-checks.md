# See which CI checks a pull request runs

The required status check on `main` is `policy-gate`, from `.github/rulesets/main.json`. That job runs gitleaks. It does not install Bun.

`branch-name` and `legacy-names` run on every pull request.

Other workflows start only when the pull request base is in their branch list and a changed path matches their path filter. To list those workflows, run this command from the repository root.

```
python3 .github/workflows/lib/which-workflows.py --base main web/src/main.tsx
```

Pass one path per argument. The command prints one workflow name per line. The same command with `--check` compares sample paths with the filters in `.github/workflows/`.

`web-ci` and `mobile-ci` each run `bun install --frozen-lockfile` once, then `bun audit`. `web-preview` uses that same install, then `bun run build`. The `build` script in `web/package.json` does not install dependencies.

These pytest files have one workflow each.

- `tests/test_merge_strongs.py` and `tests/test_delitzsch_review.py` run in Besorah quality.
- `tests/test_greek_importer.py` and `tests/test_greek_release.py` run in Greek source quality.

Python CI runs `tests/test_hutter_morphology.py` and `tests/test_hutter_attested_morphology.py` when those tests or the Hutter morphology modules they import change.
