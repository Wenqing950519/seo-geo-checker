import type { FaqContent } from "../../types/content";

export function FaqSection({ content }: { content: FaqContent }) {
  return (
    <section id="faq" className="section section-muted">
      <div className="container">
        <header className="section-header">
          <h2>{content.title}</h2>
          <p className="section-subtitle">{content.disclaimer}</p>
        </header>
        <div className="faq-list">
          {content.items.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
