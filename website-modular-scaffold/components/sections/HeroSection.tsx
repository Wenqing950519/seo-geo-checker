import type { HomepageContent } from "../../types/content";

type HeroContent = HomepageContent["hero"];

export function HeroSection({ content }: { content: HeroContent }) {
  return (
    <section id="audit" className="hero-section">
      <div className="container hero-layout">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="hero-subtitle">{content.subtitle}</p>
        <form className="url-form">
          <input aria-label="網站網址" name="url" placeholder="https://your-website.com" type="url" />
          <button type="submit">{content.primaryCta.label}</button>
        </form>
        <a className="secondary-link" href={content.secondaryCta.href}>
          {content.secondaryCta.label}
        </a>
        <p className="trust-text">{content.trustText}</p>
      </div>
    </section>
  );
}
