import type { FaqContent, HomepageContent, SampleReport } from "../types/content";
import { AuditModulesSection } from "./sections/AuditModulesSection";
import { FaqSection } from "./sections/FaqSection";
import { FinalCtaSection } from "./sections/FinalCtaSection";
import { HeroSection } from "./sections/HeroSection";
import { HowItWorksSection } from "./sections/HowItWorksSection";
import { MethodologySection } from "./sections/MethodologySection";
import { PainPointsSection } from "./sections/PainPointsSection";
import { ResourcesSection } from "./sections/ResourcesSection";
import { SampleReportSection } from "./sections/SampleReportSection";
import { ServicesSection } from "./sections/ServicesSection";

type HomePageProps = {
  content: HomepageContent;
  faq: FaqContent;
  sampleReport: SampleReport;
};

export function HomePage({ content, faq, sampleReport }: HomePageProps) {
  return (
    <main>
      <HeroSection content={content.hero} />
      <PainPointsSection content={content.painPoints} />
      <HowItWorksSection content={content.howItWorks} />
      <AuditModulesSection content={content.auditModules} />
      <SampleReportSection report={sampleReport} />
      <MethodologySection content={content.methodology} />
      <ServicesSection content={content.services} />
      <ResourcesSection content={content.resources} />
      <FaqSection content={faq} />
      <FinalCtaSection content={content.finalCta} />
    </main>
  );
}
