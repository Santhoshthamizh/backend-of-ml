/* ═══════════════════════════════════════════════════════
   content.js — Job data extraction for Fake Job Detector
   Runs on: LinkedIn, Indeed, Naukri, Glassdoor
═══════════════════════════════════════════════════════ */

// Max character lengths for extracted fields
const MAX_TITLE_LEN       = 500;
const MAX_DESCRIPTION_LEN = 5000;
const MAX_COMPANY_LEN     = 200;

/**
 * Try an ordered list of CSS selectors; return the first
 * non-empty text content found, or an empty string.
 */
function trySelectors(selectors) {
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.innerText || el.textContent || '').trim();
        if (text) return text;
      }
    } catch (_) {
      // ignore invalid selector
    }
  }
  return '';
}

/**
 * Extract job title, description and company from the current page.
 * Returns { title, description, company, url, success, error }.
 */
function extractJobData() {
  const hostname = window.location.hostname;
  let title = '';
  let description = '';
  let company = '';

  /* ── LinkedIn ─────────────────────────────────────── */
  if (hostname === 'linkedin.com' || hostname.endsWith('.linkedin.com')) {
    title = trySelectors([
      'h1.t-24',
      '.top-card-layout__title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      'h1',
    ]);
    description = trySelectors([
      '.jobs-description-content__text',
      '.jobs-description__content .jobs-box__html-content',
      '.show-more-less-html__markup',
      '.jobs-description-content',
      '.jobs-box__html-content',
    ]);
    company = trySelectors([
      '.topcard__org-name-link',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      '.top-card-layout__second-subline a',
      '.job-details-jobs-unified-top-card__company-name a',
    ]);
  }

  /* ── Indeed ──────────────────────────────────────── */
  else if (hostname === 'indeed.com' || hostname.endsWith('.indeed.com')) {
    title = trySelectors([
      'h1[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
      'h1.jobsearch-JobInfoHeader-title',
      'h1',
    ]);
    description = trySelectors([
      '#jobDescriptionText',
      '.jobsearch-jobDescriptionText',
      '[data-testid="job-description"]',
      '.jobsearch-JobComponent-description',
    ]);
    company = trySelectors([
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-InlineCompanyRating-companyHeader',
      '.icl-u-lg-mr--sm.icl-u-xs-mr--xs',
    ]);
  }

  /* ── Naukri ──────────────────────────────────────── */
  else if (hostname === 'naukri.com' || hostname.endsWith('.naukri.com')) {
    title = trySelectors([
      'h1.jd-header-title',
      '.jd-header-title',
      'h1',
    ]);
    description = trySelectors([
      '.job-desc',
      '.dang-inner-html',
      '.jd-desc .dang-inner-html',
    ]);
    company = trySelectors([
      '.jd-header-comp-name a',
      '.company-info a',
      '.jd-header-comp-name',
    ]);
  }

  /* ── Glassdoor ───────────────────────────────────── */
  else if (hostname === 'glassdoor.com' || hostname.endsWith('.glassdoor.com')) {
    title = trySelectors([
      '[data-test="job-title"]',
      '.css-1vg6q84',
      'h1',
    ]);
    description = trySelectors([
      '.jobDescriptionContent',
      '[data-test="job-description"]',
      '.desc',
    ]);
    company = trySelectors([
      '[data-test="employer-name"]',
      '.css-87uc0g',
      '[data-test="job-employer"]',
    ]);
  }

  /* ── Generic fallback ────────────────────────────── */
  if (!title) {
    title = trySelectors([
      'h1.job-title',
      'h1[class*="title"]',
      '.job-title',
      '[class*="job-title"]',
      '[class*="jobTitle"]',
      'h1',
    ]);
  }

  if (!description) {
    description = trySelectors([
      '[class*="description"]',
      '[id*="description"]',
      '[class*="job-desc"]',
      'article',
      'main p',
    ]);
  }

  if (!company) {
    company = trySelectors([
      '[class*="company"]',
      '[class*="employer"]',
      '[class*="org-name"]',
    ]);
  }

  /* Last resort: meta tags */
  if (!title) {
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) title = ogTitle.getAttribute('content') || '';
  }

  if (!description) {
    const ogDesc = document.querySelector('meta[property="og:description"]') ||
                   document.querySelector('meta[name="description"]');
    if (ogDesc) description = ogDesc.getAttribute('content') || '';
  }

  const hasData = !!(title || description || company);

  return {
    title:       title.slice(0, MAX_TITLE_LEN),
    description: description.slice(0, MAX_DESCRIPTION_LEN),
    company:     company.slice(0, MAX_COMPANY_LEN),
    url:         window.location.href,
    success:     hasData,
    error:       hasData ? null : 'Could not extract job data from this page.',
  };
}

/* ── Message listener ─────────────────────────────── */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'extractJobData') {
    try {
      const data = extractJobData();
      sendResponse(data);
    } catch (err) {
      sendResponse({
        title: '', description: '', company: '',
        url: window.location.href,
        success: false,
        error: 'Extraction error: ' + err.message,
      });
    }
  }
  // Return true to indicate we will call sendResponse asynchronously
  // (not strictly needed here but good practice)
  return true;
});
