import fs from "fs";
import * as cheerio from "cheerio";

const SOURCE_URL = "https://manshurat.org/node/14677";

const OUTPUT_FILE = "data/raw/egyptian-penal-code.json";

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
  const map = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
  };

  return String(text).replace(/[٠-٩]/g, (digit) => map[digit]);
}

function normalizeArticleNumber(raw = "") {
  return normalizeArabicDigits(raw)
    .replace(/مكرراً/gu, "مكرر")
    .replace(/مكررًا/gu, "مكرر")
    .replace(/مكررا/gu, "مكرر")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================================================
// ARTICLE HEADING
//
// Supports:
//
// المادة 1
// المادة 44 مكرر
// المادة 83 (أ)
// المادة 84 ثالثة
// المادة 106 مكرر (أ)
// المادة 375 مكرر (أ)
// =========================================================

function isArticleHeading(text = "") {
  const value = normalizeArabicDigits(normalizeText(text));

  return /^المادة\s+\d+(?:\s+مكرر)?(?:\s*\([^)]+\)|\s+[^\d\s][^\n]*)?$/u.test(
    value,
  );
}

function extractArticleNumber(text = "") {
  const value = normalizeArabicDigits(normalizeText(text));

  const match = value.match(/^المادة\s+(.+)$/u);

  if (!match) {
    return null;
  }

  return normalizeArticleNumber(match[1]);
}

// =========================================================
// STRUCTURE
// =========================================================

function isBookHeading(text = "") {
  return /^الكتاب\s+/u.test(normalizeText(text));
}

function isPartHeading(text = "") {
  return /^الباب\s+/u.test(normalizeText(text));
}

function isChapterHeading(text = "") {
  return /^الفصل\s+/u.test(normalizeText(text));
}

function isSectionHeading(text = "") {
  return /^القسم\s+/u.test(normalizeText(text));
}

function cleanHeading(text = "") {
  return normalizeText(text)
    .replace(/\s*[-–—]\s*/gu, ": ")
    .replace(/\s+/g, " ")
    .trim();
}

function isRepealedText(text = "") {
  const value = normalizeText(text)
    .replace(/[.،؛:]+$/u, "")
    .trim();

  return value === "ملغاة" || value === "ملغى";
}

// =========================================================
// DOWNLOAD PAGE
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING PENAL CODE");

console.log("==============================");

console.log("");

const response = await fetch(SOURCE_URL, {
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",

    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

    "Accept-Language": "ar-EG,ar;q=0.9,en;q=0.8",

    "Cache-Control": "no-cache",
  },

  redirect: "follow",
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const html = await response.text();

const $ = cheerio.load(html);

// =========================================================
// FIND MAIN CONTENT
// =========================================================

let container = $(".field-name-body .field-item").first();

if (!container.length) {
  container = $(".field--name-body").first();
}

if (!container.length) {
  container = $(".node__content").first();
}

if (!container.length) {
  container = $("article").first();
}

if (!container.length) {
  container = $("main").first();
}

if (!container.length) {
  throw new Error("Could not find main law content.");
}

// =========================================================
// EXTRACT DOM BLOCKS
// =========================================================

const blocks = [];

container.find("p, h1, h2, h3, h4, h5, h6, li").each((_, element) => {
  const $element = $(element);

  // Convert <br> tags into real new lines
  $element.find("br").replaceWith("\n");

  const rawText = $element.text();

  // Some Manshurat paragraphs contain several
  // logical blocks separated by <br>.
  const lines = rawText
    .split(/\n+/u)
    .map((line) => normalizeText(line))
    .filter(Boolean);

  for (const line of lines) {
    blocks.push(line);
  }
});

// Remove immediate duplicates
const uniqueBlocks = blocks.filter(
  (block, index) => index === 0 || block !== blocks[index - 1],
);

console.log(`DOM blocks found: ${uniqueBlocks.length}`);

// Helpful debugging
const penalStartMatches = uniqueBlocks.filter((block) =>
  block.includes("قانون العقوبات"),
);

console.log("Possible Penal Code start blocks:", penalStartMatches);

// =========================================================
// PARSER STATE
// =========================================================

const articles = [];

let startedLaw = false;

let currentArticle = null;

let currentBook = null;

let currentPart = null;

let currentChapter = null;

let currentSection = null;

const LAW_START_TITLE = "قانون العقوبات";

// =========================================================
// FLUSH ARTICLE
// =========================================================

function flushCurrentArticle() {
  if (!currentArticle) {
    return;
  }

  currentArticle.content_ar = normalizeText(currentArticle.content_ar);

  if (isRepealedText(currentArticle.content_ar)) {
    currentArticle.status = "repealed";

    currentArticle.content_ar = null;
  }

  articles.push(currentArticle);

  currentArticle = null;
}

// =========================================================
// PARSE BLOCKS
// =========================================================

for (let index = 0; index < uniqueBlocks.length; index++) {
  const text = uniqueBlocks[index];

  // -------------------------------------------------------
  // WAIT FOR ACTUAL PENAL CODE
  //
  // This skips:
  // قانون رقم 58 لسنة 1937
  // إصدار قانون العقوبات
  // المادة 1
  // المادة 2
  // -------------------------------------------------------

  if (!startedLaw) {
    const normalizedStartText = normalizeText(text);

    // IMPORTANT:
    // We want "قانون العقوبات"
    // but NOT "إصدار قانون العقوبات"
    // and NOT the page title
    // "قانون العقوبات رقم 58 لسنة 1937".
    if (normalizedStartText === "قانون العقوبات") {
      startedLaw = true;

      currentBook = null;
      currentPart = null;
      currentChapter = null;
      currentSection = null;

      console.log("✅ Found start of actual Penal Code.");
    }

    continue;
  }
  // -------------------------------------------------------
  // ARTICLE
  // -------------------------------------------------------

  if (isArticleHeading(text)) {
    flushCurrentArticle();

    const articleNumber = extractArticleNumber(text);

    currentArticle = {
      article_number: articleNumber,

      article_order: articles.length + 1,

      division_title: null,

      book_title: currentBook,

      part_title: currentPart,

      chapter_title: currentChapter,

      section_title: currentSection,

      subsection_title: null,

      title_ar: null,

      status: "active",

      content_ar: "",
    };

    continue;
  }

  // -------------------------------------------------------
  // BOOK
  // -------------------------------------------------------

  if (isBookHeading(text)) {
    flushCurrentArticle();

    currentBook = cleanHeading(text);

    currentPart = null;

    currentChapter = null;

    currentSection = null;

    continue;
  }

  // -------------------------------------------------------
  // PART / BAB
  // -------------------------------------------------------

  if (isPartHeading(text)) {
    flushCurrentArticle();

    currentPart = cleanHeading(text);

    currentChapter = null;

    currentSection = null;

    continue;
  }

  // -------------------------------------------------------
  // CHAPTER
  // -------------------------------------------------------

  if (isChapterHeading(text)) {
    flushCurrentArticle();

    currentChapter = cleanHeading(text);

    currentSection = null;

    continue;
  }

  // -------------------------------------------------------
  // SECTION
  // -------------------------------------------------------

  if (isSectionHeading(text)) {
    flushCurrentArticle();

    currentSection = cleanHeading(text);

    continue;
  }

  // -------------------------------------------------------
  // CONTENT
  // -------------------------------------------------------

  if (currentArticle) {
    if (currentArticle.content_ar) {
      currentArticle.content_ar += "\n";
    }

    currentArticle.content_ar += text;
  }
}

flushCurrentArticle();

// =========================================================
// VALIDATION
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

// ---------------------------------------------------------
// DUPLICATES
// ---------------------------------------------------------

const seen = new Set();

const duplicates = [];

for (const number of articleNumbers) {
  if (seen.has(number)) {
    duplicates.push(number);
  }

  seen.add(number);
}

// ---------------------------------------------------------
// REPEALED
// ---------------------------------------------------------

const repealedArticles = articles
  .filter((article) => article.status === "repealed")
  .map((article) => article.article_number);

// ---------------------------------------------------------
// EMPTY ACTIVE ARTICLES
// ---------------------------------------------------------

const emptyActiveArticles = articles
  .filter(
    (article) =>
      article.status === "active" && !normalizeText(article.content_ar),
  )
  .map((article) => article.article_number);

// ---------------------------------------------------------
// NON-STANDARD ARTICLE NUMBERS
// ---------------------------------------------------------

const specialArticleNumbers = articleNumbers.filter(
  (number) => !/^\d+$/u.test(number),
);

// ---------------------------------------------------------
// BASE NUMERIC ARTICLES
// ---------------------------------------------------------

const numericBaseNumbers = new Set(
  articleNumbers.filter((number) => /^\d+$/u.test(number)).map(Number),
);

// The source reaches article 395.
const missingNumericArticles = [];

for (let number = 1; number <= 395; number++) {
  if (!numericBaseNumbers.has(number)) {
    missingNumericArticles.push(number);
  }
}

// ---------------------------------------------------------
// ARTICLE ORDER
// ---------------------------------------------------------

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// HIERARCHY LEAK
// ---------------------------------------------------------

const suspiciousHierarchy = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /\nالكتاب\s+/u.test(content) ||
      /\nالباب\s+/u.test(content) ||
      /\nالفصل\s+/u.test(content) ||
      /\nالقسم\s+/u.test(content)
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// POSSIBLE REPEALED TEXT NOT DETECTED
// ---------------------------------------------------------

const suspiciousRepealed = articles
  .filter((article) => {
    if (article.status === "repealed") {
      return false;
    }

    return /ملغا[ةى]/u.test(article.content_ar || "");
  })
  .map((article) => article.article_number);

// =========================================================
// OUTPUT
// =========================================================

const output = {
  law: {
    title_ar: "قانون العقوبات",

    short_title_ar: "قانون العقوبات",

    law_number: "58",

    law_year: 1937,

    source_name: "منشورات قانونية",

    source_url: SOURCE_URL,

    source_reference:
      "صفحة المصدر تشير إلى آخر تعديل بتاريخ 15 أغسطس 2021 بالقانون رقم 141 لسنة 2021",
  },

  extracted_at: new Date().toISOString(),

  total_articles: articles.length,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    active_articles: articles.filter((article) => article.status === "active")
      .length,

    repealed_articles: repealedArticles.length,

    repealed_article_numbers: repealedArticles,

    duplicate_article_numbers: [...new Set(duplicates)],

    duplicate_article_numbers_count: [...new Set(duplicates)].length,

    empty_active_articles: emptyActiveArticles,

    empty_active_articles_count: emptyActiveArticles.length,

    special_article_numbers: specialArticleNumbers,

    special_article_numbers_count: specialArticleNumbers.length,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    suspicious_repealed_text: suspiciousRepealed,

    suspicious_repealed_text_count: suspiciousRepealed.length,
  },

  articles,
};

// =========================================================
// WRITE
// =========================================================

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

// =========================================================
// SUMMARY
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING COMPLETE");

console.log("==============================");

console.log(`Articles: ${articles.length}`);

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log(`Active: ${output.validation.active_articles}`);

console.log(`Repealed: ${output.validation.repealed_articles}`);

console.log(
  `Duplicates: ${
    duplicates.length ? [...new Set(duplicates)].join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log(`Special article numbers: ${specialArticleNumbers.length}`);

console.log(
  specialArticleNumbers.length ? specialArticleNumbers.join(", ") : "None",
);

console.log(
  `Missing base numeric articles: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
  }`,
);

console.log(
  `Invalid article orders: ${
    invalidOrders.length ? invalidOrders.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious hierarchy: ${
    suspiciousHierarchy.length ? suspiciousHierarchy.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious repealed text: ${
    suspiciousRepealed.length ? suspiciousRepealed.join(", ") : "None"
  }`,
);

console.log("");
console.log(`Saved → ${OUTPUT_FILE}`);
