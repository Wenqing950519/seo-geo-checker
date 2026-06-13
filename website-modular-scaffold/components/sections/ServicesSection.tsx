import type { HomepageContent } from "../../types/content";
import { SectionHeader } from "./SectionHeader";

type ServicesContent = HomepageContent["services"];

export function ServicesSection({ content }: { content: ServicesContent }) {
  return (
    <section id="services" className="section section-muted">
      <div className="container">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} subtitle={content.subtitle} />
        <div className="card-grid">
          {content.items.map((service) => (
            <article className="card" key={service.title}>
              <h3>{service.title}</h3>
              <h4>適合</h4>
              <ul>
                {service.bestFor.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h4>包含</h4>
              <ul>
                {service.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <a className="button" href="#audit">
                {service.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
