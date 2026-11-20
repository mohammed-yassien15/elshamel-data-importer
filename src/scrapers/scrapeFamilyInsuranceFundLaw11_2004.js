import fs from "fs";
import * as cheerio from "cheerio";

const HTML_FILE = "family-insurance-fund-law-11-2004.html";

const OUTPUT_FILE = "family-insurance-fund-law-11-2004.json";

const SOURCE_URL = "https://alhasswalawfirm.com/law-library/law-11-2004";

const EXPECTED = {
  total: 6,
  first: "1",
  last: "6",
};

// =========================================================
// HELPERS
// =========================================================

function normalizeText(text = "") {
  return String(text)
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeArabicDigits(text = "") {
  return String(text).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩";

    const persian = "۰۱۲۳۴۵۶۷۸۹";

    const a = arabic.indexOf(digit);

    if (a !== -1) {
      return String(a);
    }

    const p = persian.indexOf(digit);

    return p !== -1 ? String(p) : digit;
  });
}

function removeArabicDiacritics(text = "") {
  return String(text).replace(/[\u064B-\u065F\u0670]/g, "");
}

function normalizeForDetection(text = "") {
  return removeArabicDiacritics(normalizeArabicDigits(normalizeText(text)))
    .replace(/ـ/g, "")
    .trim();
}

// =========================================================
// ARTICLE NAMES
// =========================================================

const articleNames = new Map([
  ["الاولى", "1"],
  ["الثانية", "2"],
  ["الثالثة", "3"],
  ["الرابعة", "4"],
  ["الخامسة", "5"],
  ["السادسة", "6"],
]);

function normalizeArticleHeading(text = "") {
  return normalizeForDetection(text)
    .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArticleNumber(text = "") {
  const normalized = normalizeArticleHeading(text);

  // Example:
  // مادة (الأولى)
  // المادة (الثانية)
  let match = normalized.match(
    /^(?:المادة|مادة)\s*\(\s*([^)]+?)\s*\)\s*:?\s*$/u,
  );

  if (match) {
    const value = match[1].trim().replace(/[أإآ]/g, "ا");

    if (articleNames.has(value)) {
      return articleNames.get(value);
    }

    if (/^\d+$/u.test(value)) {
      return value;
    }
  }

  // Example:
  // مادة الأولى
  // المادة الثانية
  match = normalized.match(/^(?:المادة|مادة)\s+(.+?)\s*:?\s*$/u);

  if (match) {
    const value = match[1].trim().replace(/[أإآ]/g, "ا");

    if (articleNames.has(value)) {
      return articleNames.get(value);
    }

    if (/^\d+$/u.test(value)) {
      return value;
    }
  }

  return null;
}

// =========================================================
// LOAD
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING FAMILY INSURANCE FUND LAW 11/2004");

console.log("==============================");

console.log("");

if (!fs.existsSync(HTML_FILE)) {
  throw new Error(`HTML file not found: ${HTML_FILE}`);
}

const html = fs.readFileSync(HTML_FILE, "utf8");

if (html.length < 1000) {
  throw new Error("HTML file looks incomplete.");
}

console.log(`Loaded HTML: ${HTML_FILE}`);

console.log(`HTML size: ${html.length} characters`);

const $ = cheerio.load(html);

// =========================================================
// DOM BLOCKS
// =========================================================

const blocks = [];

$("body")
  .find("h1, h2, h3, h4, h5, h6, p, li, div")
  .each((_, element) => {
    const $element = $(element);

    if (
      element.tagName === "div" &&
      $element.children("p, h1, h2, h3, h4, h5, h6, li, div").length > 0
    ) {
      return;
    }

    $element.find("br").replaceWith("\n");

    const lines = $element
      .text()
      .split(/\n+/u)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    for (const line of lines) {
      blocks.push(line);
    }
  });

const uniqueBlocks = blocks.filter(
  (block, index) => index === 0 || block !== blocks[index - 1],
);

console.log(`DOM blocks found: ${uniqueBlocks.length}`);

const articleLikeBlocks = uniqueBlocks.filter((block) =>
  /^(?:المادة|مادة)/u.test(normalizeForDetection(block)),
);

console.log("Article-like blocks:", articleLikeBlocks);

// =========================================================
// DEBUG ARTICLE HEADINGS
// =========================================================

console.log("");
console.log("ARTICLE HEADING TEST");

for (const block of articleLikeBlocks) {
  console.log(block, "=>", extractArticleNumber(block));
}

// =========================================================
// PARSE
// =========================================================

const articles = [];

let currentArticle = null;

let started = false;

let finished = false;

function flushArticle() {
  if (!currentArticle) {
    return;
  }

  articles.push({
    article_number: currentArticle.article_number,

    article_order: articles.length + 1,

    division_title: null,

    book_title: null,

    part_title: null,

    chapter_title: null,

    section_title: null,

    subsection_title: null,

    title_ar: null,

    status: "active",

    content_ar: normalizeText(currentArticle.contentParts.join("\n")) || null,
  });

  currentArticle = null;
}

for (let index = 0; index < uniqueBlocks.length; index++) {
  if (finished) {
    break;
  }

  const text = normalizeText(uniqueBlocks[index]);

  if (!text) {
    continue;
  }

  const normalized = normalizeForDetection(text);

  const articleNumber = extractArticleNumber(text);

  // =======================================================
  // START AT ARTICLE 1
  // =======================================================

  if (!started) {
    if (articleNumber === "1") {
      started = true;

      currentArticle = {
        article_number: "1",

        contentParts: [],
      };

      console.log("✅ Found article 1.");
    }

    continue;
  }

  // =======================================================
  // STOP AFTER ARTICLE 6
  // =======================================================

  if (
    currentArticle?.article_number === "6" &&
    (/^_{3,}$/u.test(text) ||
      /^ـ{3,}$/u.test(text) ||
      /^\(\s*[١1]\s*\)\s*(?:يستبدل|يُستبدل)/u.test(normalized) ||
      normalized.includes("ملاحظة من مؤسسة") ||
      normalized === "المصدر الرسمي")
  ) {
    flushArticle();

    finished = true;

    console.log("✅ Reached source notes after article 6.");

    break;
  }

  // =======================================================
  // NEW ARTICLE
  // =======================================================

  if (articleNumber) {
    flushArticle();

    currentArticle = {
      article_number: articleNumber,

      contentParts: [],
    };

    continue;
  }

  // =======================================================
  // ARTICLE CONTENT
  // =======================================================

  if (currentArticle) {
    currentArticle.contentParts.push(text);
  }
}

flushArticle();

// =========================================================
// DEDUPE
// =========================================================

const seen = new Set();

const dedupedArticles = [];

for (const article of articles) {
  if (seen.has(article.article_number)) {
    continue;
  }

  seen.add(article.article_number);

  dedupedArticles.push(article);
}

dedupedArticles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// VALIDATION
// =========================================================

const numbers = dedupedArticles.map((article) => article.article_number);

const duplicates = [
  ...new Set(
    numbers.filter((number, index) => numbers.indexOf(number) !== index),
  ),
];

const numericSet = new Set(numbers.map((number) => Number(number)));

const missingNumeric = [];

for (let number = 1; number <= 6; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

const emptyArticles = dedupedArticles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

const invalidOrders = dedupedArticles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

const articlesWithFootnotes = dedupedArticles
  .filter((article) => /\(\s*[١1]\s*\)\s*$/u.test(article.content_ar || ""))
  .map((article) => article.article_number);

// =========================================================
// SPECIFIC CHECKS
// =========================================================

const specificProblems = [];

const article2 = dedupedArticles.find(
  (article) => article.article_number === "2",
);

const article3 = dedupedArticles.find(
  (article) => article.article_number === "3",
);

if (!article2) {
  specificProblems.push("Article 2 missing");
}

if (!article3) {
  specificProblems.push("Article 3 missing");
}

// =========================================================
// COUNT CHECKS
// =========================================================

const countProblems = [];

if (dedupedArticles.length !== EXPECTED.total) {
  countProblems.push(
    `Expected ${EXPECTED.total} articles, got ${dedupedArticles.length}`,
  );
}

if (dedupedArticles[0]?.article_number !== EXPECTED.first) {
  countProblems.push(
    `Unexpected first article: ${dedupedArticles[0]?.article_number}`,
  );
}

if (
  dedupedArticles[dedupedArticles.length - 1]?.article_number !== EXPECTED.last
) {
  countProblems.push(
    `Unexpected last article: ${
      dedupedArticles[dedupedArticles.length - 1]?.article_number
    }`,
  );
}

// =========================================================
// OUTPUT
// =========================================================

const output = {
  collection: {
    title_ar: "الأحوال الشخصية",
  },

  law: {
    title_ar: "قانون رقم 11 لسنة 2004 بإنشاء صندوق نظام تأمين الأسرة",

    short_title_ar: "قانون صندوق نظام تأمين الأسرة رقم 11 لسنة 2004",

    law_number: "11",

    law_year: 2004,

    source_name: "مؤسسة المستشار عاطف الحصوة",

    source_url: SOURCE_URL,

    source_reference:
      "النص منقول عن بوابة تشريعات محكمة النقض وفقاً لآخر تعديل صادر في 12 نوفمبر 2015",
  },

  source_snapshot: HTML_FILE,

  extracted_at: new Date().toISOString(),

  total_articles: dedupedArticles.length,

  validation: {
    first_article: dedupedArticles[0]?.article_number ?? null,

    last_article:
      dedupedArticles[dedupedArticles.length - 1]?.article_number ?? null,

    total_articles: dedupedArticles.length,

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    missing_numeric_articles: missingNumeric,

    missing_numeric_articles_count: missingNumeric.length,

    empty_articles: emptyArticles,

    empty_articles_count: emptyArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    articles_with_footnote_markers: articlesWithFootnotes,

    articles_with_footnote_markers_count: articlesWithFootnotes.length,

    specific_article_problems: specificProblems,

    specific_article_problems_count: specificProblems.length,

    count_problems: countProblems,

    count_problems_count: countProblems.length,
  },

  articles: dedupedArticles,
};

// =========================================================
// SAVE
// =========================================================

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

// =========================================================
// SUMMARY
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING COMPLETE");

console.log("==============================");

console.log("");

console.log(`Law articles: ${dedupedArticles.length}`);

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log("");

console.log(
  `Duplicates: ${duplicates.length ? duplicates.join(", ") : "None"}`,
);

console.log(
  `Missing numeric articles: ${
    missingNumeric.length ? missingNumeric.join(", ") : "None"
  }`,
);

console.log(
  `Empty articles: ${emptyArticles.length ? emptyArticles.join(", ") : "None"}`,
);

console.log(
  `Invalid article orders: ${
    invalidOrders.length ? invalidOrders.join(", ") : "None"
  }`,
);

console.log(
  `Articles with footnote markers: ${
    articlesWithFootnotes.length ? articlesWithFootnotes.join(", ") : "None"
  }`,
);

console.log(
  `Specific article problems: ${
    specificProblems.length ? specificProblems.join(" | ") : "None"
  }`,
);

console.log(
  `Count problems: ${
    countProblems.length ? countProblems.join(" | ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
