# CI budget

A pull request starts a job only when that job's path filter matches a changed file, or when the workflow has no path filter.

## Web preview

On `pull_request`, `web-preview.yml` ignores `mobile/**`, `docs/**`, and root `*.md`. The preview job runs when any changed file falls outside those patterns. `workflow_dispatch` has no path filter.

## Web CI install

`web-ci.yml` runs `bun install --frozen-lockfile` once. The bundle step is `bun --env-file=.env ./build.ts`. The `build` script in `web/package.json` still runs `bun install --frozen-lockfile`, because Cloudflare Pages uses that script as its build command.

## Audits

Web CI and Mobile CI run `bun audit` after install. A finding is a warning, and the job continues. Policy Gate runs gitleaks and keeps the check name `policy-gate`.

## Python CI

`python-ci.yml` runs `tests/test_hutter_morphology.py` and `tests/test_hutter_attested_morphology.py`. It starts for those tests and for `scripts/hutter/morphology.py`, `scripts/hutter/attested_morphology.py`, `scripts/hutter/evaluate_attested_morphology.py`, and `scripts/hutter/map_strongs.py`. Transcription QA stays in `hutter-transcription-ci.yml`. API checks stay in `api-ci.yml`.

## Pytest

Besorah quality owns `tests/test_besorah_remediation.py`, `tests/test_merge_strongs.py`, and `tests/test_delitzsch_review.py`. Greek source quality owns `tests/test_greek_*.py`. The knowledge compatibility job does not run those files.

## Timeouts

Jobs that install a toolchain, run a suite, deploy, or call EAS set `timeout-minutes`.

| Job | Minutes |
| --- | --- |
| web-ci | 25 |
| web-preview | 30 |
| mobile-ci | 20 |
| api | 25 |
| bore-parity | 10 |
| knowledge foundation | 20 |
| davar-compatibility | 20 |
| shaul-compatibility | 30 |
| python-ci pytest | 15 |
| besorah | 15 |
| greek-source | 15 |
| hutter transcription | 15 |
| bani phonology | 15 |
| transliteration | 20 |
| policy-gate | 15 |
| greek upstream | 20 |
| mobile-eas | 120 |
| mobile-eas-release | 120 |

## Checks that stay

`branch-name.yml` and `legacy-names.yml` still run on every pull request. The branch check accepts the prefixes `feat`, `fix`, `hotfix`, `chore`, `docs`, `refactor`, `test`, and `release`.
