import homepage from "../content/homepage.json";
import faq from "../content/faq.json";
import sampleReport from "../content/sample-report.json";
import type { FaqContent, HomepageContent, SampleReport } from "../types/content";

export function getHomepageContent(): HomepageContent {
  return homepage as HomepageContent;
}

export function getFaqContent(): FaqContent {
  return faq as FaqContent;
}

export function getSampleReport(): SampleReport {
  return sampleReport as SampleReport;
}
