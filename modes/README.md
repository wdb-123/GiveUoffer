# Ucareer Modes

`modes/` contains system-owned prompt instructions used by CLI agents and the backend workflow layer. These files are product source, not user workspace content.

## Structure

```text
modes/
  _shared.md             # common scoring, evidence and safety rules
  _profile.template.md   # template copied to workspace/profile/_profile.md
  *.md                   # default English-compatible workflow modes
  de/ fr/ ja/ tr/        # maintained language-specific mode packs
```

## Ownership

- User-specific preferences belong in `workspace/profile/_profile.md` or `workspace/profile/profile.yml`.
- Job-search artifacts belong under `workspace/`.
- Do not create user data, reports, JDs, resumes or generated exports inside `modes/`.
- Backend workflow routing should reference modes only as legacy prompt context; routing and file permissions belong in `apps/daemon/src/workflow/*` and `apps/daemon/src/policy/*`.

## Maintained Language Packs

Only these language packs are kept in source:

- `de/` German
- `fr/` French
- `ja/` Japanese
- `tr/` Turkish

Additional translations should be added only when they are part of the product language policy and have a matching `language.modes_dir` rule in `AGENTS.md`, `CLAUDE.md` and `DATA_CONTRACT.md`.
