import type { HomepageContent } from "../../types/content";
import { SectionHeader } from "./SectionHeader";

type PainPointsContent = HomepageContent["painPoints"];

export function PainPointsSection({ content }: { content: PainPointsContent }) {
  return (
    <section id="pain-points" className="section">
      <div className="container">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
        <div className="card-grid">
          {content.items.map((item) => (
            <article className="card" key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
