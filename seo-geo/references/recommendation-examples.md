# Recommendation Examples

Use these examples to calibrate output quality. Prefer specific, evidence-backed recommendations.

## Bad Recommendations

- Add FAQ content.
- Improve schema markup.
- Write a blog post for this keyword.
- Add more internal links.
- Improve E-E-A-T.

## Better Recommendations

- Add a decision-stage FAQ block to `/pricing` answering q7 and q9 from `questions.json`.
  Use the implementation-time comparison in `evidence-inventory.md` and mark it with FAQPage schema.
  This matters because competitors are cited for comparison questions while our pricing page lacks
  a self-contained answer.

- Update `/blog/how-to-choose` with a 5-row comparison table covering cost, setup time, integration,
  support, and best-fit customer. Pull proof from the customer case in `evidence-inventory.md`.
  This supports consideration-stage users in `icp.md` and gives AI engines a compact quotable source.

- Do not chase the high-volume query if it maps to the avoided audience in `strategy.md`.
  Instead, create a narrower page for the decision-stage variant with lower volume but stronger
  conversion intent.

## Required Shape

Every recommendation should include:

- Target page or new asset.
- User question or keyword.
- Strategy reason.
- Evidence to use or evidence missing.
- Concrete edit.
- Expected impact and uncertainty.
