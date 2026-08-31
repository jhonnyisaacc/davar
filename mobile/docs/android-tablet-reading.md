# Android tablet reading QA

The reading screen now switches at 768 dp: tablet widths get a 960 dp maximum
reading measure, wider gutters, increased Hebrew type, and more vertical rhythm.
Phone widths retain the existing values. The content remains centered so both
portrait and landscape layouts use space intentionally without stretching lines
across the entire display.

Manual release checks still required:

- 8–9 inch and 10–12 inch Android tablets, portrait and landscape
- Hebrew RTL wrapping and translation alignment
- top navigation and bottom navigation hierarchy
- phone regression at 360–430 dp

Physical tablet QA was unavailable for this implementation pass.
