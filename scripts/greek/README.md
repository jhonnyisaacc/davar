# Greek Besorah importer

Reproducible TAGNT / TBESG importer for the SBLGNT reading edition. This does not wire Greek into web or mobile.

Official revision: `STEPBible/STEPBible-Data` `ae39711d7843b2902d54993e432de9c12d6a4b9a`.

```text
PYTHONPATH=. python -m scripts.greek fetch --local /path/to/official-files
PYTHONPATH=. python -m scripts.greek import --source-dir data/greek/source/ae39711d7843b2902d54993e432de9c12d6a4b9a --output-dir data/greek/sblgnt-tagnt/ae39711d7843b2902d54993e432de9c12d6a4b9a
PYTHONPATH=. python -m scripts.greek define --import-dir data/greek/sblgnt-tagnt/ae39711d7843b2902d54993e432de9c12d6a4b9a --ubs data/greek/source/ae39711d7843b2902d54993e432de9c12d6a4b9a/UBSGreekNTDic-v1.0-es.JSON --output-dir data/greek/definitions/ae39711d7843b2902d54993e432de9c12d6a4b9a
PYTHONPATH=. python -m scripts.greek translate --dry-run
PYTHONPATH=. python -m scripts.greek translate
PYTHONPATH=. python -m scripts.greek check --import-dir data/greek/sblgnt-tagnt/ae39711d7843b2902d54993e432de9c12d6a4b9a
```

`fetch` verifies git blob SHAs recorded in `docs/greek-besorah-source-licenses.md`. `import` rebuilds twice and refuses output that is not byte-stable. `define` stores English TBESG as the approved baseline, maps UBS Spanish only with lemma and sense evidence, and leaves leftover Spanish plus all Hebrew as `draft`. `translate` fills those drafts through the shared OpenRouter client in `python -m scripts.translate` (use `--dry-run` or `--fake` until credits are available). Put `OPENROUTER_API_KEY` in the repo-root `.env` (see `.env.example`). The cache at `data/greek/definitions/<revision>/translation-cache.json` skips identical English and is reapplied after every `define` / `publish-preview`.

Tests use committed fixtures. They do not download the official ~48 MB source files. `publish-preview` writes compact JSON and drops duplicated per-word transliteration objects so the runtime bundle stays under Cloudflare Pages' 25 MiB file limit. The published tree is mirrored to `data/greek/preview/` for git; static-data generation copies that preview into `web/public/data`.
