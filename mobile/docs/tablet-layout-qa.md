# Tablet layout QA checklist

The responsive tokens in `src/theme.ts` use 768 dp as the tablet breakpoint
and 1024 dp as the large-tablet breakpoint. Dialog and footnote cards use a
percentage cap rather than the old 420 dp phone cap, so they can adapt to iPad
and Android tablet split-view widths.

Before release, verify the core verse flow at minimum in:

- Android tablet portrait and landscape (8–9 inch and 10–12 inch profiles)
- iPad portrait and landscape
- iPad split view at changing widths around the 768 dp breakpoint
- Hebrew RTL alignment, wrapping, and verse tap targets
- Phone portrait regression (360–430 dp)

Automated unit/build verification cannot prove visual device behavior. Physical
device QA was unavailable during this implementation pass.
