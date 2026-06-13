export type Cta = {
  label: string;
  href: string;
};

export type HomepageContent = {
  meta: {
    title: string;
    description: string;
  };
  navigation: {
    logo: string;
    links: Array<{ label: string; href: string }>;
    cta: Cta;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCta: Cta;
    secondaryCta: Cta;
    trustText: string;
  };
  painPoints: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{ title: string; body: string }>;
  };
  howItWorks: {
    eyebrow: string;
    title: string;
    subtitle: string;
    steps: Array<{ title: string; body: string; outcome: string }>;
    disclaimer: string;
  };
  auditModules: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{ name: string; label: string; body: string; checks: string[] }>;
  };
  methodology: {
    eyebrow: string;
    title: string;
    body: string;
    principles: Array<{ title: string; body: string }>;
  };
  services: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{ title: string; bestFor: string[]; includes: string[]; cta: string }>;
  };
  resources: {
    eyebrow: string;
    title: string;
    subtitle: string;
    items: Array<{ title: string; summary: string; href: string }>;
  };
  finalCta: {
    title: string;
    subtitle: string;
    primaryCta: Cta;
    secondaryText: string;
  };
};

export type SampleReport = {
  scenario: string;
  score: {
    value: number;
    label: string;
    summary: string;
  };
  positioning: {
    summary: string;
    gaps: string[];
  };
  seoIssues: string[];
  geoQuestions: string[];
  actions: Array<{
    priority: "P1" | "P2" | "P3";
    type: string;
    target: string;
    recommendation: string;
  }>;
};

export type FaqContent = {
  title: string;
  disclaimer: string;
  items: Array<{ question: string; answer: string }>;
};
