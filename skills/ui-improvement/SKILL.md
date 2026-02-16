---
name: ui-improvement
description: Improves existing UI by converting Flow A/B-test learnings into concrete hypotheses, variants, and evaluation plans. Use when the user asks to optimize an existing screen, increase conversion/retention, or diagnose why a current UI is underperforming.
---

# UI Improvement Skill

## Purpose
Turn existing UI problems into reusable, testable improvement rules, and produce complete outputs from hypothesis to experiment plan.

## When to Use
- Requests such as "increase CVR on this screen" or "reduce drop-off"
- Optimization work for existing pricing, paywall, onboarding, checkout, or PDP UI
- Interpreting A/B outcomes, planning follow-up tests, and converting losses into reusable learning

## Improvement Framework (Required)
1. **Assess the current state**
   - Break down target behavior, current flow, and blockers (anxiety, friction, ambiguity).
2. **Classify the problem type**
   - Information gap / information overload
   - Flow friction (input, steps, authentication)
   - Weak value communication
   - Trust deficit (guarantees, transparency, social proof)
   - Meaning mismatch (copy/icon interpretation)
3. **Create comparative hypotheses**
   - Always produce baseline-like + improved + balanced variants.
4. **Define guardrails**
   - Reject any variant that harms transparency or user experience quality, even if conversion rises.
5. **Attach an evaluation plan**
   - Include primary metrics, secondary metrics, and explicit learning goals for failed tests.

## Improvement Rules

### 1) Information Design
- Limit simplification to noise reduction; preserve decision-critical information.
- Use progressive disclosure while keeping access to comparison details.
- Prioritize explainability and predictability in pricing and terms.

### 2) Friction Reduction
- Minimize required upfront input and move heavy steps later where feasible.
- Compare single-page vs multi-step forms, and include progress visibility.
- In checkout, avoid unnecessary pre-purchase auth; consider account setup post-purchase.

### 3) Persuasion and Trust
- Always compare feature-led and benefit-led messaging.
- Prioritize clear trust elements: reviews, guarantees, return/cancellation transparency.
- Emotional messaging is valid, but pair it with concrete proof (numbers, specific terms).

### 4) Pricing and Plan Optimization
- Evaluate `conversion winner` and `profit winner` separately.
- Even with default-plan emphasis, keep alternative paths clearly visible.
- Treat trial eligibility, trial duration, and billing-condition presentation as separate levers.

### 5) Micro UI
- Favor icons and CTAs with immediate, unambiguous meaning.
- When testing emotional expression, always include a neutral control variant.

### 6) Learning Operations
- Do not treat losing tests as dead ends; document boundary conditions (where it works / fails).
- Promote winning patterns into reusable rules for future baseline proposals.

## Output Format
Always return improvement proposals in this structure.

```markdown
## Current Problem Hypothesis
- [Structured summary of blockers]

## Improvement Hypotheses
- H1:
- H2:

## Variants (Comparative)
- Variant A (baseline-friendly):
- Variant B (improved):
- Variant C (balanced):

## Elements to Change
- Information design:
- Copy / CTA:
- Trust signals:
- Flow / input:

## Measurement Plan
- Primary metric:
- Secondary metrics:
- Guardrails:
- Decision criteria:

## Learning Output
- Reusable rule to keep for both win and loss outcomes:
```

## Prioritization
- Start with low-cost, high-impact changes (copy, ordering, visibility of existing elements).
- Then move to medium-cost changes (layout and flow redesign).
- Finally evaluate high-cost changes (new features, data/infrastructure changes).
