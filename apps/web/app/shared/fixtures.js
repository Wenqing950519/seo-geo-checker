// Acceptance Fixtures for GeoCheck Product A Dashboard
// Strictly fulfills docs/product/dashboard/FRONTEND_ACCEPTANCE.md
// Contains all 5 required fixtures + rich observation evidence for the Evidence Drawer

export const FIXTURE_METAS = [
  { id: 1, key: 'baseline', name: '場景 1：基準首輪 (Baseline)', desc: '首輪無歷史比對資料，無虛構 delta 與趨勢' },
  { id: 2, key: 'twelve_weeks', name: '場景 2：連續 12 週完整 Run', desc: '同一不可變題組，四引擎穩定追蹤，各項比率含分子分母' },
  { id: 3, key: 'partial_run', name: '場景 3：Partial 異常輪', desc: '包含觀測到的真 0 (measured=false) 與 unknown，不把未知混入 0' },
  { id: 4, key: 'failed_run', name: '場景 4：全數中斷 Run (Failed)', desc: '四引擎完全故障，圖表斷點呈現，無人造 0' },
  { id: 5, key: 'version_change', name: '場景 5：題組版本變更 (v1 → v2)', desc: '不可變題組升級，圖表出現中斷界線，跨版比對暫停' }
];

export const DEMO_PROJECT = {
  projectId: 'dprj_wildwood_tw',
  name: 'WILDWOOD 原木燒烤牛排',
  siteUrl: 'https://wildwood.com.tw',
  timezone: 'Asia/Taipei',
  cadence: 'weekly',
  enabled: true,
  createdAt: '2026-06-15T00:00:00.000Z',
  nextRunAt: '2026-09-17T02:00:00.000Z'
};

export const DEMO_QUESTION_SETS = [
  {
    questionSetId: 'dqs_v1_immutable',
    projectId: 'dprj_wildwood_tw',
    version: 1,
    locale: 'zh-TW',
    status: 'active',
    createdAt: '2026-06-15T00:00:00.000Z',
    questions: [
      {
        questionId: 'dqu_101',
        text: '台北信義區約會氣氛餐廳推薦',
        intent: 'discovery',
        tags: ['信義區', '約會', '情調']
      },
      {
        questionId: 'dqu_102',
        text: '台北米其林星級主廚牛排餐廳推薦',
        intent: 'consideration',
        tags: ['牛排', '米其林', '美食']
      },
      {
        questionId: 'dqu_103',
        text: '信義新天地 A9 有哪些適合慶祝生日的聚餐餐廳？',
        intent: 'intent',
        tags: ['新光三越', '慶生', '聚餐']
      },
      {
        questionId: 'dqu_104',
        text: 'WILDWOOD 原木燒烤評價與招牌菜色推薦',
        intent: 'brand_direct',
        tags: ['品牌主詞', '菜單', '評價']
      }
    ]
  },
  {
    questionSetId: 'dqs_v2_immutable',
    projectId: 'dprj_wildwood_tw',
    version: 2,
    locale: 'zh-TW',
    status: 'active',
    createdAt: '2026-09-02T00:00:00.000Z',
    questions: [
      {
        questionId: 'dqu_201',
        text: '台北信義區約會氣氛餐廳推薦',
        intent: 'discovery',
        tags: ['信義區', '約會', '情調']
      },
      {
        questionId: 'dqu_202',
        text: '台北米其林星級主廚牛排餐廳推薦',
        intent: 'consideration',
        tags: ['牛排', '米其林', '美食']
      },
      {
        questionId: 'dqu_203',
        text: '信義新天地 A9 有哪些適合慶祝生日的聚餐餐廳？',
        intent: 'intent',
        tags: ['新光三越', '慶生', '聚餐']
      },
      {
        questionId: 'dqu_204',
        text: 'WILDWOOD 原木燒烤評價與招牌菜色推薦',
        intent: 'brand_direct',
        tags: ['品牌主詞', '菜單', '評價']
      },
      {
        questionId: 'dqu_205',
        text: '信義區戶外露天酒吧景觀餐廳',
        intent: 'discovery',
        tags: ['露天酒吧', '景觀', '夜生活']
      }
    ]
  }
];

// Evidence Store mapped by observationId
export const EVIDENCE_STORE = new Map();

// Helper to seed evidence
function registerEvidence(obs) {
  EVIDENCE_STORE.set(obs.observationId, obs);
  return obs;
}

// Pre-populate evidence items
registerEvidence({
  observationId: 'dobs_measured_wildwood_perplexity',
  questionId: 'dqu_101',
  questionText: '台北信義區約會氣氛餐廳推薦',
  intent: 'discovery',
  engine: 'perplexity',
  model: 'sonar',
  observedAt: '2026-09-09T02:15:32.000Z',
  status: 'measured',
  brandMentioned: true,
  officialCitation: true,
  rawAnswer: `台北信義區具備絕佳約會氣氛的餐廳首推位於新光三越 A9 館 4 樓的 **WILDWOOD Live Fire Cuisine**。該餐廳由米其林星級名廚林明健（Chef Kin）主理，以百萬級頂級原木柴烤爐為核心，提供帶有迷人龍眼木香氣的頂級乾式熟成牛排與在地海鮮，並設有寬敞舒適的戶外景觀露台，能直眺台北 101 夜景，是信義商圈約會求婚首選。\n\n其他知名推薦包括：Morton's The Steakhouse（微風信義 45F）、Smith & Wollensky（微風南山 47F）以及 Saffron 46 番紅花四十六印度景觀餐廳。`,
  citations: [
    { url: 'https://wildwood.com.tw/menu', domain: 'wildwood.com.tw', isOfficial: true, title: 'WILDWOOD 官方最新菜單與線上訂位' },
    { url: 'https://wildwood.com.tw/about', domain: 'wildwood.com.tw', isOfficial: true, title: '關於 WILDWOOD 原木柴燒燒烤餐廳' },
    { url: 'https://inline.app/booking/wildwood', domain: 'inline.app', isOfficial: false, title: 'inline 線上訂位預約系統' },
    { url: 'https://www.vogue.com.tw/lifestyle/article/wildwood-taipei-steak', domain: 'vogue.com.tw', isOfficial: false, title: 'VOGUE Taiwan 推薦信義區約會餐廳' }
  ]
});

registerEvidence({
  observationId: 'dobs_measured_wildwood_openai',
  questionId: 'dqu_101',
  questionText: '台北信義區約會氣氛餐廳推薦',
  intent: 'discovery',
  engine: 'openai',
  model: 'gpt-5.6-luna',
  observedAt: '2026-09-09T02:15:10.000Z',
  status: 'measured',
  brandMentioned: true,
  officialCitation: false,
  rawAnswer: `信義區約會餐廳精選推薦：\n1. **WILDWOOD Live Fire Cuisine**（新光 A9）：柴火燒烤風味濃郁，有超美戶外露天酒吧座，浪漫氣氛滿分。\n2. **Smith & Wollensky**（微風南山）：經典美式牛排，高樓層 101 窗邊景觀。\n3. **Just Grill**（誠品信義）：晶華酒店旗下牛排館，沙拉吧精緻。\n4. **Sea To Sky**（微風信義）：海鮮手抓料理與高空夜景。`,
  citations: [
    { url: 'https://travel.taipei/zh-tw/dining/food', domain: 'travel.taipei', isOfficial: false, title: '台北旅遊網 - 美食餐飲指南' },
    { url: 'https://blog.kkday.com/12345/taipei-romantic-restaurants', domain: 'blog.kkday.com', isOfficial: false, title: 'KKday 台北精選浪漫約會餐廳' }
  ]
});

registerEvidence({
  observationId: 'dobs_zero_wildwood_gemini',
  questionId: 'dqu_103',
  questionText: '信義新天地 A9 有哪些適合慶祝生日的聚餐餐廳？',
  intent: 'intent',
  engine: 'gemini',
  model: 'gemini-3.5-flash-lite',
  observedAt: '2026-09-09T02:15:18.000Z',
  status: 'measured',
  brandMentioned: false, // Measured zero!
  officialCitation: false,
  rawAnswer: `新光三越台北信義新天地 A9 館擁有許多知名聚餐餐廳：\n- 6F-7F：紅花鐵板燒、初魚鮨、黑毛屋本家\n- 5F：老乾杯燒肉、瓦城泰國料理\n- 2F：Paul 法國麵包甜點沙龍\n這些餐廳均提供壽星專屬生日禮或蛋糕慶祝優惠。`,
  citations: [
    { url: 'https://www.skm.com.tw/branch/store/A9', domain: 'skm.com.tw', isOfficial: false, title: '新光三越 A9 館美食餐廳樓層指南' }
  ]
});

registerEvidence({
  observationId: 'dobs_unknown_anthropic',
  questionId: 'dqu_102',
  questionText: '台北米其林星級主廚牛排餐廳推薦',
  intent: 'consideration',
  engine: 'anthropic',
  model: 'claude-haiku-4.5',
  observedAt: '2026-09-09T02:15:45.000Z',
  status: 'unknown', // Unknown!
  brandMentioned: null,
  officialCitation: null,
  rawAnswer: null,
  failureReason: 'AI 供應商當次搜尋連線超時，未回傳可用回答文本。此狀態計為未知 (unknown)，不記入比率分母，亦不人造補零。',
  citations: []
});

registerEvidence({
  observationId: 'dobs_failed_openai',
  questionId: 'dqu_104',
  questionText: 'WILDWOOD 原木燒烤評價與招牌菜色推薦',
  intent: 'brand_direct',
  engine: 'openai',
  model: 'gpt-5.6-luna',
  observedAt: '2026-09-09T02:16:00.000Z',
  status: 'failed',
  brandMentioned: null,
  officialCitation: null,
  rawAnswer: null,
  failureReason: 'Provider rate limit exceeded (HTTP 429). 任務中斷，保留系統異常標籤。',
  citations: []
});

/**
 * Generate full dataset for each Fixture
 */
export function getFixtureData(fixtureKey = 'twelve_weeks') {
  const project = { ...DEMO_PROJECT };
  const questionSets = [...DEMO_QUESTION_SETS];

  if (fixtureKey === 'baseline') {
    // Fixture 1: Baseline run only
    const run1 = {
      run_id: 'drun_baseline_w1',
      observed_at: '2026-09-09T02:15:00.000Z',
      question_set_id: 'dqs_v1_immutable',
      question_set_version: 1,
      state: 'complete',
      coverage: { expected: 16, measured: 16, unknown: 0, failed: 0 },
      metrics: {
        brand_mention_rate: { value: 75.0, numerator: 12, denominator: 16, delta: null, comparison_status: 'no_prior_run' },
        official_citation_rate: { value: 37.5, numerator: 6, denominator: 16, delta: null, comparison_status: 'no_prior_run' },
        distinct_citation_domains: { value: 9, numerator: 9, denominator: null, delta: null, comparison_status: 'no_prior_run' },
        measurement_coverage: { value: 100.0, numerator: 16, denominator: 16, delta: null, comparison_status: 'no_prior_run' }
      }
    };
    return {
      fixtureMeta: FIXTURE_METAS[0],
      project,
      data_freshness_at: run1.observed_at,
      tracking: { cadence: 'weekly', enabled: true, next_run_at: '2026-09-16T02:00:00.000Z' },
      summary: { status: 'available', metrics: run1.metrics },
      series: [run1],
      runs: [run1],
      questionSets: [questionSets[0]],
      sources: [
        { domain: 'wildwood.com.tw', citations: 14, official_citations: 14, isOfficial: true },
        { domain: 'vogue.com.tw', citations: 8, official_citations: 0, isOfficial: false },
        { domain: 'inline.app', citations: 6, official_citations: 0, isOfficial: false },
        { domain: 'skm.com.tw', citations: 5, official_citations: 0, isOfficial: false }
      ]
    };
  }

  if (fixtureKey === 'twelve_weeks') {
    // Fixture 2: Twelve weekly complete runs
    const weeks = [];
    const baseDate = new Date('2026-06-24T02:00:00.000Z');
    const mentionRates = [62.5, 68.8, 62.5, 75.0, 68.8, 75.0, 81.3, 75.0, 81.3, 87.5, 81.3, 87.5];
    const officialRates = [25.0, 25.0, 31.3, 31.3, 37.5, 37.5, 37.5, 43.8, 43.8, 50.0, 43.8, 50.0];

    for (let i = 0; i < 12; i++) {
      const d = new Date(baseDate.getTime() + i * 7 * 24 * 60 * 60 * 1000);
      const mVal = mentionRates[i];
      const mNum = Math.round((mVal / 100) * 16);
      const oVal = officialRates[i];
      const oNum = Math.round((oVal / 100) * 16);
      const prevM = i > 0 ? mentionRates[i - 1] : null;
      const prevO = i > 0 ? officialRates[i - 1] : null;

      weeks.push({
        run_id: `drun_w_${i + 1}`,
        observed_at: d.toISOString(),
        question_set_id: 'dqs_v1_immutable',
        question_set_version: 1,
        state: 'complete',
        coverage: { expected: 16, measured: 16, unknown: 0, failed: 0 },
        metrics: {
          brand_mention_rate: {
            value: mVal, numerator: mNum, denominator: 16,
            delta: prevM !== null ? Number((mVal - prevM).toFixed(1)) : null,
            comparison_status: i === 0 ? 'no_prior_run' : 'comparable'
          },
          official_citation_rate: {
            value: oVal, numerator: oNum, denominator: 16,
            delta: prevO !== null ? Number((oVal - prevO).toFixed(1)) : null,
            comparison_status: i === 0 ? 'no_prior_run' : 'comparable'
          },
          distinct_citation_domains: {
            value: 8 + Math.floor(i / 3), numerator: 8 + Math.floor(i / 3), denominator: null,
            delta: i > 0 ? (Math.floor(i / 3) - Math.floor((i - 1) / 3)) : null,
            comparison_status: i === 0 ? 'no_prior_run' : 'comparable'
          },
          measurement_coverage: {
            value: 100.0, numerator: 16, denominator: 16, delta: 0,
            comparison_status: i === 0 ? 'no_prior_run' : 'comparable'
          }
        },
        engine_metrics: {
          openai: { brand_mention_rate: { value: Math.min(100, mVal + 6.2) } },
          gemini: { brand_mention_rate: { value: Math.max(0, mVal - 6.2) } },
          anthropic: { brand_mention_rate: { value: mVal } },
          perplexity: { brand_mention_rate: { value: Math.min(100, mVal + 12.5) } }
        }
      });
    }

    const latest = weeks[weeks.length - 1];
    return {
      fixtureMeta: FIXTURE_METAS[1],
      project,
      data_freshness_at: latest.observed_at,
      tracking: { cadence: 'weekly', enabled: true, next_run_at: '2026-09-16T02:00:00.000Z' },
      summary: { status: 'available', metrics: latest.metrics },
      series: weeks,
      runs: [...weeks].reverse(),
      questionSets: [questionSets[0]],
      sources: [
        { domain: 'wildwood.com.tw', citations: 48, official_citations: 48, isOfficial: true },
        { domain: 'inline.app', citations: 28, official_citations: 0, isOfficial: false },
        { domain: 'vogue.com.tw', citations: 22, official_citations: 0, isOfficial: false },
        { domain: 'walkerland.com.tw', citations: 19, official_citations: 0, isOfficial: false },
        { domain: 'skm.com.tw', citations: 16, official_citations: 0, isOfficial: false },
        { domain: 'tripadvisor.com.tw', citations: 14, official_citations: 0, isOfficial: false }
      ]
    };
  }

  if (fixtureKey === 'partial_run') {
    // Fixture 3: A partial run with measured zero + unknown observation
    const runNormal = {
      run_id: 'drun_prev_normal',
      observed_at: '2026-09-02T02:00:00.000Z',
      question_set_id: 'dqs_v1_immutable',
      question_set_version: 1,
      state: 'complete',
      coverage: { expected: 16, measured: 16, unknown: 0, failed: 0 },
      metrics: {
        brand_mention_rate: { value: 75.0, numerator: 12, denominator: 16, delta: 0, comparison_status: 'comparable' },
        official_citation_rate: { value: 37.5, numerator: 6, denominator: 16, delta: 0, comparison_status: 'comparable' },
        distinct_citation_domains: { value: 8, numerator: 8, denominator: null, delta: 0, comparison_status: 'comparable' },
        measurement_coverage: { value: 100.0, numerator: 16, denominator: 16, delta: 0, comparison_status: 'comparable' }
      }
    };

    const runPartial = {
      run_id: 'drun_partial_current',
      observed_at: '2026-09-09T02:00:00.000Z',
      question_set_id: 'dqs_v1_immutable',
      question_set_version: 1,
      state: 'partial',
      coverage: { expected: 16, measured: 14, unknown: 2, failed: 0 },
      metrics: {
        // Denominator is 14 because 2 were unknown (excluded from rate denominator)
        brand_mention_rate: {
          value: 71.4, numerator: 10, denominator: 14, delta: -3.6,
          comparison_status: 'comparable'
        },
        official_citation_rate: {
          value: 35.7, numerator: 5, denominator: 14, delta: -1.8,
          comparison_status: 'comparable'
        },
        distinct_citation_domains: {
          value: 7, numerator: 7, denominator: null, delta: -1,
          comparison_status: 'comparable'
        },
        measurement_coverage: {
          value: 87.5, numerator: 14, denominator: 16, delta: -12.5,
          comparison_status: 'comparable'
        }
      },
      warning: '本期有 2 筆觀測狀態為 unknown，已自動自品牌提及率與引用率分母排除，未人造補 0。'
    };

    return {
      fixtureMeta: FIXTURE_METAS[2],
      project,
      data_freshness_at: runPartial.observed_at,
      tracking: { cadence: 'weekly', enabled: true, next_run_at: '2026-09-16T02:00:00.000Z' },
      summary: { status: 'available', metrics: runPartial.metrics },
      series: [runNormal, runPartial],
      runs: [runPartial, runNormal],
      questionSets: [questionSets[0]],
      sources: [
        { domain: 'wildwood.com.tw', citations: 12, official_citations: 12, isOfficial: true },
        { domain: 'inline.app', citations: 7, official_citations: 0, isOfficial: false },
        { domain: 'skm.com.tw', citations: 4, official_citations: 0, isOfficial: false }
      ]
    };
  }

  if (fixtureKey === 'failed_run') {
    // Fixture 4: Fully failed run with no invented zeroes
    const runNormal = {
      run_id: 'drun_prev_normal',
      observed_at: '2026-09-02T02:00:00.000Z',
      question_set_id: 'dqs_v1_immutable',
      question_set_version: 1,
      state: 'complete',
      coverage: { expected: 16, measured: 16, unknown: 0, failed: 0 },
      metrics: {
        brand_mention_rate: { value: 75.0, numerator: 12, denominator: 16, delta: null, comparison_status: 'comparable' },
        official_citation_rate: { value: 37.5, numerator: 6, denominator: 16, delta: null, comparison_status: 'comparable' },
        distinct_citation_domains: { value: 8, numerator: 8, denominator: null, delta: null, comparison_status: 'comparable' },
        measurement_coverage: { value: 100.0, numerator: 16, denominator: 16, delta: null, comparison_status: 'comparable' }
      }
    };

    const runFailed = {
      run_id: 'drun_fully_failed',
      observed_at: '2026-09-09T02:00:00.000Z',
      question_set_id: 'dqs_v1_immutable',
      question_set_version: 1,
      state: 'failed',
      coverage: { expected: 16, measured: 0, unknown: 0, failed: 16 },
      metrics: {
        brand_mention_rate: { value: null, numerator: 0, denominator: 0, delta: null, comparison_status: 'no_data' },
        official_citation_rate: { value: null, numerator: 0, denominator: 0, delta: null, comparison_status: 'no_data' },
        distinct_citation_domains: { value: 0, numerator: 0, denominator: null, delta: null, comparison_status: 'no_data' },
        measurement_coverage: { value: 0.0, numerator: 0, denominator: 16, delta: -100.0, comparison_status: 'comparable' }
      },
      failureReason: '排程執行期間遭遇大規模上游 AI 服務連線故障，所有 16 筆觀測全數失敗。本系統絕不虛構 0% 數據欺騙行銷決策。'
    };

    return {
      fixtureMeta: FIXTURE_METAS[3],
      project,
      data_freshness_at: runFailed.observed_at,
      tracking: { cadence: 'weekly', enabled: true, next_run_at: '2026-09-16T02:00:00.000Z' },
      summary: { status: 'failed', metrics: runFailed.metrics },
      series: [runNormal, runFailed],
      runs: [runFailed, runNormal],
      questionSets: [questionSets[0]],
      sources: []
    };
  }

  if (fixtureKey === 'version_change') {
    // Fixture 5: A new question-set version that visibly breaks comparison continuity
    const runV1 = {
      run_id: 'drun_v1_last',
      observed_at: '2026-08-26T02:00:00.000Z',
      question_set_id: 'dqs_v1_immutable',
      question_set_version: 1,
      state: 'complete',
      coverage: { expected: 16, measured: 16, unknown: 0, failed: 0 },
      metrics: {
        brand_mention_rate: { value: 75.0, numerator: 12, denominator: 16, delta: 0, comparison_status: 'comparable' },
        official_citation_rate: { value: 37.5, numerator: 6, denominator: 16, delta: 0, comparison_status: 'comparable' },
        distinct_citation_domains: { value: 9, numerator: 9, denominator: null, delta: 0, comparison_status: 'comparable' },
        measurement_coverage: { value: 100.0, numerator: 16, denominator: 16, delta: 0, comparison_status: 'comparable' }
      }
    };

    const runV2 = {
      run_id: 'drun_v2_first',
      observed_at: '2026-09-02T02:00:00.000Z',
      question_set_id: 'dqs_v2_immutable',
      question_set_version: 2,
      state: 'complete',
      coverage: { expected: 20, measured: 20, unknown: 0, failed: 0 },
      metrics: {
        brand_mention_rate: {
          value: 70.0, numerator: 14, denominator: 20, delta: null,
          comparison_status: 'question_set_changed' // Delta disabled!
        },
        official_citation_rate: {
          value: 40.0, numerator: 8, denominator: 20, delta: null,
          comparison_status: 'question_set_changed'
        },
        distinct_citation_domains: {
          value: 12, numerator: 12, denominator: null, delta: null,
          comparison_status: 'question_set_changed'
        },
        measurement_coverage: {
          value: 100.0, numerator: 20, denominator: 20, delta: null,
          comparison_status: 'question_set_changed'
        }
      }
    };

    const runV2Next = {
      run_id: 'drun_v2_second',
      observed_at: '2026-09-09T02:00:00.000Z',
      question_set_id: 'dqs_v2_immutable',
      question_set_version: 2,
      state: 'complete',
      coverage: { expected: 20, measured: 20, unknown: 0, failed: 0 },
      metrics: {
        brand_mention_rate: {
          value: 80.0, numerator: 16, denominator: 20, delta: 10.0,
          comparison_status: 'comparable' // Comparable again within v2!
        },
        official_citation_rate: {
          value: 45.0, numerator: 9, denominator: 20, delta: 5.0,
          comparison_status: 'comparable'
        },
        distinct_citation_domains: {
          value: 13, numerator: 13, denominator: null, delta: 1,
          comparison_status: 'comparable'
        },
        measurement_coverage: {
          value: 100.0, numerator: 20, denominator: 20, delta: 0,
          comparison_status: 'comparable'
        }
      }
    };

    return {
      fixtureMeta: FIXTURE_METAS[4],
      project,
      data_freshness_at: runV2Next.observed_at,
      tracking: { cadence: 'weekly', enabled: true, next_run_at: '2026-09-16T02:00:00.000Z' },
      summary: { status: 'available', metrics: runV2Next.metrics },
      series: [runV1, runV2, runV2Next],
      runs: [runV2Next, runV2, runV1],
      questionSets: [questionSets[1], questionSets[0]],
      sources: [
        { domain: 'wildwood.com.tw', citations: 32, official_citations: 32, isOfficial: true },
        { domain: 'inline.app', citations: 18, official_citations: 0, isOfficial: false },
        { domain: 'vogue.com.tw', citations: 15, official_citations: 0, isOfficial: false },
        { domain: 'walkerland.com.tw', citations: 12, official_citations: 0, isOfficial: false }
      ]
    };
  }

  // Fallback
  return getFixtureData('twelve_weeks');
}
