import type { HomepageContent } from "../../types/content";
import { SectionHeader } from "./SectionHeader";

type ResourcesContent = HomepageContent["resources"];

export function ResourcesSection({ content }: { content: ResourcesContent }) {
  return (
    <section id="resources" className="section">
      <div className="container">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
        <div className="card-grid">
          {content.items.map((resource) => (
            <article className="card" key={resource.title}>
              <h3>{resource.title}</h3>
              <p>{resource.summary}</p>
              <a href={resource.href}>閱讀主題</a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
