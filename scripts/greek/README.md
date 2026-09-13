# Greek Besorah importer

Reproducible TAGNT / TBESG importer for the SBLGNT reading edition. This does not wire Greek into web or mobile.

Official revision: `STEPBible/STEPBible-Data` `ae39711d7843b2902d54993e432de9c12d6a4b9a`.

```text
PYTHONPATH=. python -m scripts.greek fetch --local /path/to/official-files
PYTHONPATH=. python -m scripts.greek import --source-dir data/greek/source/ae39711d7843b2902d54993e432de9c12d6a4b9a --output-dir data/greek/sblgnt-tagnt/ae39711d7843b2902d54993e432de9c12d6a4b9a
PYTHONPATH=. python -m scripts.greek define --import-dir data/greek/sblgnt-tagnt/ae39711d7843b2902d54993e432de9c12d6a4b9a --ubs data/greek/source/ae39711d7843b2902d54993e432de9c12d6a4b9a/UBSGreekNTDic-v1.0-es.JSON --output-dir data/greek/definitions/ae39711d7843b2902d54993e432de9c12d6a4b9a
PYTHONPATH=. python -m scripts.greek check --import-dir data/greek/sblgnt-tagnt/ae39711d7843b2902d54993e432de9c12d6a4b9a
```

`fetch` verifies git blob SHAs recorded in `docs/greek-besorah-source-licenses.md`. `import` rebuilds twice and refuses output that is not byte-stable. `define` stores English TBESG as the approved baseline, maps UBS Spanish only with lemma and sense evidence, and leaves leftover Spanish plus all Hebrew as `draft`.

Tests use committed fixtures. They do not download the official 30 MB files.
