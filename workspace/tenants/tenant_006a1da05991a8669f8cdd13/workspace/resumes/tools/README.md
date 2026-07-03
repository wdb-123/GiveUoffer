# Resume Tools

This directory contains user-specific resume document helpers.

These scripts are intentionally inside `workspace/resumes/tools/` because they operate on personal resume sources, headshots, and generated DOCX files.

## Scripts

- `add_resume_headshot.py` crops `workspace/profile/headshots/职业照.jpg` and injects the cropped image into selected DOCX resumes under `workspace/resumes/source/`.
- `build_optimized_resumes.py` builds selected optimized DOCX resume variants under `workspace/resumes/source/`.

## Boundary

- Project-wide automation belongs in `scripts/`.
- Stable product CLI commands belong in `scripts/cli/`.
- Personal resume generation helpers belong here.
- Do not hardcode absolute machine paths; resolve paths from this file location.
