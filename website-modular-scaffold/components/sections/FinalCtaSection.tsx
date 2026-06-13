import type { HomepageContent } from "../../types/content";

type FinalCtaContent = HomepageContent["finalCta"];

export function FinalCtaSection({ content }: { content: FinalCtaContent }) {
  return (
    <section id="final-cta" className="section final-cta">
      <div className="container">
        <h2>{content.title}</h2>
        <p>{content.subtitle}</p>
        <a className="button" href={content.primaryCta.href}>
          {content.primaryCta.label}
        </a>
        <p className="trust-text">{content.secondaryText}</p>
      </div>
    </section>
  );
}
