import type { HomepageContent } from "../../types/content";
import { SectionHeader } from "./SectionHeader";

type MethodologyContent = HomepageContent["methodology"];

export function MethodologySection({ content }: { content: MethodologyContent }) {
  return (
    <section id="methodology" className="section">
      <div className="container">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.body} />
        <div className="card-grid">
          {content.principles.map((principle) => (
            <article className="card" key={principle.title}>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
