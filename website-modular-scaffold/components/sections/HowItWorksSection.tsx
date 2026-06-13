import type { HomepageContent } from "../../types/content";
import { SectionHeader } from "./SectionHeader";

type HowItWorksContent = HomepageContent["howItWorks"];

export function HowItWorksSection({ content }: { content: HowItWorksContent }) {
  return (
    <section id="how-it-works" className="section section-muted">
      <div className="container">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
        <ol className="step-list">
          {content.steps.map((step) => (
            <li className="step-card" key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
              <p className="outcome">{step.outcome}</p>
            </li>
          ))}
        </ol>
        <aside className="disclaimer">{content.disclaimer}</aside>
      </div>
    </section>
  );
}
