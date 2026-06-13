import type { HomepageContent } from "../../types/content";
import { SectionHeader } from "./SectionHeader";

type AuditModulesContent = HomepageContent["auditModules"];

export function AuditModulesSection({ content }: { content: AuditModulesContent }) {
  return (
    <section id="modules" className="section">
      <div className="container">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
        <div className="module-list">
          {content.items.map((item) => (
            <article className="module-card" key={item.name}>
              <div>
                <p className="module-label">{item.label}</p>
                <h3>{item.name}</h3>
                <p>{item.body}</p>
              </div>
              <ul className="chip-list">
                {item.checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
