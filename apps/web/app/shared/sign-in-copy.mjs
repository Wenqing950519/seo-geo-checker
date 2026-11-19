const editions = {
  'zh-Hant-TW': {
    language: 'zh-Hant-TW',
    title: 'GeoCheck Track by LS-Labs — AI 品牌可見度與證據監控',
    description: 'GeoCheck Track 為品牌團隊保存跨期 AI 可見度觀測、第一方引用證據與不可變題組，並清楚標示未知、部分與失敗狀態。',
    heading: '登入 GeoCheck Track',
    purpose: '品牌的 AI 可見度與證據監控平台。',
    access: '請使用 Google 帳戶登入以存取品牌專案、提問監測與引用分析。',
    button: '使用 Google 帳戶登入',
    skip: '跳到主要內容',
    home: '返回 LS-Labs 首頁',
    homeUrl: 'https://lslabs.tw/',
    languages: '語言'
  },
  'zh-CN': {
    language: 'zh-CN',
    title: 'GeoCheck Track by LS-Labs — 品牌 AI 可见度与引用证据监测',
    description: 'GeoCheck Track 为品牌团队保存不同时段的 AI 可见度观测、第一方引用证据及固定题组，并标明未知、部分完成和失败状态。',
    heading: '登录 GeoCheck Track',
    purpose: '跟踪品牌在 AI 回答中的可见度和引用证据。',
    access: '使用 Google 账号登录后，即可查看品牌项目、跟踪提问并分析引用来源。',
    button: '使用 Google 账号登录',
    skip: '跳至主要内容',
    home: '返回 LS-Labs 首页',
    homeUrl: 'https://lslabs.tw/zh-cn/',
    languages: '语言'
  },
  en: {
    language: 'en',
    title: 'GeoCheck Track by LS-Labs | Brand visibility and citations in AI search',
    description: 'GeoCheck Track keeps records of AI visibility, first-party citations and fixed question sets over time. Unknown, partial and failed results are labeled separately.',
    heading: 'Sign in to GeoCheck Track',
    purpose: 'Track your brand’s visibility in AI answers and see which sources they cite.',
    access: 'Sign in with Google to access your brand projects, track questions and review citations.',
    button: 'Sign in with Google',
    skip: 'Skip to main content',
    home: 'Back to the LS-Labs homepage',
    homeUrl: 'https://lslabs.tw/en/',
    languages: 'Languages'
  }
};

export function signInCopy(search) {
  const language = new URLSearchParams(search).get('lang')?.toLowerCase();
  if (language === 'en') return editions.en;
  if (language === 'zh-cn') return editions['zh-CN'];
  return editions['zh-Hant-TW'];
}

export function signInLanguageLink(language, hash) {
  const fragment = hash ? '#' + encodeURIComponent(hash.slice(1)) : '';
  return '?lang=' + encodeURIComponent(language) + fragment;
}
