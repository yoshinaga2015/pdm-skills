---
name: analysis-report
description: Builds or revises an HTML analysis report or dashboard of ad, site, or signup metrics for a non-engineer stakeholder, with rules for layout, KPI cards, charts, tables, and wording. Use when the user asks for an analysis report, an HTML report, "make it a dashboard", a summary of ad results, or tables of CVR/CPA/CTR by channel, ad, page, or segment.
---

# Analysis Report Skill

## Purpose
Turn raw marketing numbers (ad platform exports, product analytics, signup records) into a report a stakeholder can read top to bottom in a few minutes and act on. These rules come from a real report that a PdM corrected point by point.

## When to Use
- "Analyze these ad results and make a report"
- "Turn this into a dashboard" / "add a card for X"
- Comparing channels, ads, landing pages, or segments by CVR, CPA, or CTR
- Projecting how long and how much it takes to reach a signup goal

## Page Order (Required)
Build it as a dashboard, not an essay. From top to bottom:
1. Title and a one-sentence conclusion
2. KPI cards
3. A time-series view where the flow over time matters (an animated chart is fine)
4. Comparisons: by channel, ad, landing page, segment
5. Hypotheses, recommended next actions, projections
6. **Appendix**: a collapsible heading labeled "Appendix", closed by default

Definitions, counting rules, data sources, and known gaps go in the Appendix. Never put explanatory text above the numbers.

## KPI Cards
- The card label says what the number is, briefly (e.g., "Best CPA", "Highest page CVR (visitors who stayed 30s+)").
- Render units (件, people, sessions) smaller than the number.
- The caption under the number uses a small note size (~11px). Write it as **segment condition + outcome**, not as a formula.
  - Good: "3 signups came from 120 sessions of visitors from Ad A."
  - Bad: "3 ÷ 120 sessions"
- Use a breakdown list under a divider only when the items truly add up to the total (e.g., spend by channel). For a separate count that would look like a breakdown, write a caption starting with "Besides this, ...".
- If a value cannot be computed, show "—" and put the reason in a hover tooltip. Render the tooltip in the page itself; the native `title` attribute does not show reliably.
- Make a card that reports a bad result red (border, label, number, faint background). Use a rounded chip for tags such as "Ineffective creative".
- For top/bottom rankings, use 2–3 cards and add gold/silver/bronze medals to the top ones.

## Choosing Numbers
- Pick a "best" or "highest" value only from segments with a sufficient base, e.g., 100+ sessions or 100+ people. Tag values with a smaller base ("base under 100").
- Compare rates, not counts: CTR instead of clicks, CVR instead of signups, especially across age groups or ads with different delivery volume.
- Do not compare along a dimension that the delivery settings biased. Example: if ads ran only on mobile and tablet, device type is not a fair segment.
- Never show the same quantity with different values in two places. If two counting rules are needed, state both breakdowns in the captions.
- If fake or bot signups are mixed in, lead with the count that excludes them and always show the fake count separately. Do not treat the ad platform's conversion count as the result without checking it against your own signup records.

## Charts
- For values with different units (spend vs. signups), use a multi-series bar chart with left and right axes, and say in the legend which axis each series uses.
- For time series, put dates on the x-axis and counts on the y-axis. If animated, count up per day and slide so the next date comes to the center. Model the playback controls on a video player's seek bar.
- Explain how to read a chart with axis units, legends, chips, and tooltips, not with a gray footnote under it.
- Build projections from observed values. If an assumption is not observed, name it so the reader can tell. When projections use different assumptions, switch between them with a segmented control.
- When projecting growth, consider elasticity: CPA usually rises with spend as the best-responding audience is used up, the audience size caps reach, and each additional exposure is worth less than the first.

## Tables
- Put full tables inside a "Full table (N rows)" toggle, and show only the top rows or a chart above it.
- Never show two tables with the same content.
- A column holds only what its header says. Put assumptions or conditions in their own column.
- Put column definitions in header tooltips.

## Wording
- No small gray footnotes under charts or cards. Readers see them as excuses.
- Use the stakeholder's words (conversion, organic, ad, fake signup) instead of internal classification labels.
- Avoid phrases that can be read two ways; choose the unambiguous one.

## Privacy
- Keep a report that lists individual signups on the author's machine. Before sharing it or committing it to a repository, remove per-person rows, email addresses, and IP addresses.

## Output Checklist
- [ ] Conclusion and KPI cards come first; explanations are in a closed Appendix
- [ ] Every card caption is "condition + outcome", not a formula
- [ ] Every "best" value has a base of 100+
- [ ] Comparisons use rates and avoid biased dimensions
- [ ] Fake/bot signups are shown separately
- [ ] No footnotes under charts; tooltips and legends explain instead
- [ ] Full tables are collapsed; no duplicate tables
- [ ] No personal data in a shared or committed copy
