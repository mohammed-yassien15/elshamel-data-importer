import fs from "fs";
import * as cheerio from "cheerio";

const SOURCE_URL = "https://alhasswalawfirm.com/law-library/law-25-1920";

const OUTPUT_FILE = "data/raw/personal-status-law-25-1920.json";

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
  return String(text).replace(/[٠-٩]/g, (digit) => "٠١٢٣٤٥٦٧٨٩".indexOf(digit));
}

function normalizeForDetection(text = "") {
  return normalizeArabicDigits(normalizeText(text))
    .replace(/ـ/g, "")
    .replace(/[\u064B-\u0652]/g, "")
    .trim();
}

// Supports:
// مادة (١)
// مادة (1)
// مادة ١
// مادة 1
function extractArticleNumber(text = "") {
  const normalized = normalizeForDetection(text);

  const match = normalized.match(/^(?:المادة|مادة)\s*\(?\s*(\d+)\s*\)?$/u);

  return match ? match[1] : null;
}

function isPartHeading(text = "") {
  return /^الباب\s+/u.test(normalizeText(text));
}

function isSectionHeading(text = "") {
  return /^القسم\s+/u.test(normalizeText(text));
}

function looksLikeHierarchySubtitle(text = "") {
  const value = normalizeText(text);

  if (!value) {
    return false;
  }

  if (
    extractArticleNumber(value) ||
    isPartHeading(value) ||
    isSectionHeading(value)
  ) {
    return false;
  }

  if (
    /^المواد$/u.test(value) ||
    /^الديباجة$/u.test(value) ||
    /^المصدر الرسمي$/u.test(value)
  ) {
    return false;
  }

  return value.length <= 120 && !/[.!؟]$/u.test(value);
}

// =========================================================
// FETCH
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING PERSONAL STATUS LAW 25/1920");

console.log("==============================");

console.log("");

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
}

const html = await response.text();

const $ = cheerio.load(html);

// =========================================================
// EXTRACT BLOCKS
// =========================================================

// This site does not necessarily wrap
// the law body in a single article element,
// so we parse relevant blocks from body.
const blocks = [];

$("body")
  .find("h1, h2, h3, h4, h5, h6, p, li")
  .each((_, element) => {
    const $element = $(element);

    $element.find("br").replaceWith("\n");

    const raw = $element.text();

    const lines = raw
      .split(/\n+/u)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    for (const line of lines) {
      blocks.push(line);
    }
  });

// Remove consecutive duplicates
const uniqueBlocks = blocks.filter(
  (block, index) => index === 0 || block !== blocks[index - 1],
);

console.log(`DOM blocks found: ${uniqueBlocks.length}`);

// =========================================================
// DEBUG
// =========================================================

const articleLikeBlocks = uniqueBlocks
  .filter((block) => /^(?:المادة|مادة)/u.test(normalizeText(block)))
  .slice(0, 30);

console.log("Article-like blocks:", articleLikeBlocks);

// =========================================================
// PARSER STATE
// =========================================================

let started = false;

let finished = false;

let currentPart = null;

let currentSection = null;

let currentArticle = null;

let waitingForPartTitle = false;

let waitingForSectionTitle = false;

const articles = [];

// =========================================================
// FLUSH ARTICLE
// =========================================================

function flushArticle() {
  if (!currentArticle) {
    return;
  }

  let content = normalizeText(currentArticle.contentParts.join("\n"));

  let status = "active";

  // Handles examples like:
  // ملغاة
  // ملغاة.
  // ملغاة (٣)
  // ملغاة. (٣)
  const normalizedContent = normalizeForDetection(content);

  if (
    /^ملغاة(?:\.\s*)?(?:\(\d+\))?\.?$/u.test(normalizedContent) ||
    /^ملغى(?:\.\s*)?(?:\(\d+\))?\.?$/u.test(normalizedContent)
  ) {
    status = "repealed";

    content = null;
  }

  articles.push({
    article_number: currentArticle.article_number,

    article_order: articles.length + 1,

    division_title: null,

    book_title: null,

    part_title: currentArticle.part_title,

    chapter_title: null,

    section_title: currentArticle.section_title,

    subsection_title: null,

    title_ar: null,

    status,

    content_ar: content || null,
  });

  currentArticle = null;
}

// =========================================================
// PARSE
// =========================================================

for (let index = 0; index < uniqueBlocks.length; index++) {
  if (finished) {
    break;
  }

  const text = normalizeText(uniqueBlocks[index]);

  if (!text) {
    continue;
  }

  // =======================================================
  // START
  //
  // Start from first "الباب ..."
  // This is more robust than checking exact
  // "الباب الأول" spelling.
  // =======================================================

  if (!started) {
    if (isPartHeading(text)) {
      started = true;

      currentPart = text;

      currentSection = null;

      waitingForPartTitle = true;

      waitingForSectionTitle = false;

      console.log(`✅ Found start of law body: ${text}`);
    }

    continue;
  }

  // =======================================================
  // STOP AFTER ARTICLE 13
  //
  // Prevent footnotes/footer from leaking
  // into the final article.
  // =======================================================

  if (
    currentArticle?.article_number === "13" &&
    (/^صدر بسراي/u.test(text) ||
      /^_+$/u.test(text) ||
      /^\(١\)/u.test(text) ||
      /^\(1\)/u.test(normalizeForDetection(text)) ||
      /^المصدر الرسمي$/u.test(text))
  ) {
    flushArticle();

    finished = true;

    break;
  }

  // =======================================================
  // ARTICLE
  // =======================================================

  const articleNumber = extractArticleNumber(text);

  if (articleNumber) {
    flushArticle();

    currentArticle = {
      article_number: articleNumber,

      part_title: currentPart,

      section_title: currentSection,

      contentParts: [],
    };

    waitingForPartTitle = false;

    waitingForSectionTitle = false;

    continue;
  }

  // =======================================================
  // PART / BAB
  // =======================================================

  if (isPartHeading(text)) {
    flushArticle();

    currentPart = text;

    currentSection = null;

    waitingForPartTitle = true;

    waitingForSectionTitle = false;

    continue;
  }

  if (waitingForPartTitle && looksLikeHierarchySubtitle(text)) {
    currentPart = `${currentPart}: ${text}`;

    waitingForPartTitle = false;

    continue;
  }

  // =======================================================
  // SECTION
  // =======================================================

  if (isSectionHeading(text)) {
    flushArticle();

    currentSection = text;

    waitingForSectionTitle = true;

    waitingForPartTitle = false;

    continue;
  }

  if (waitingForSectionTitle && looksLikeHierarchySubtitle(text)) {
    currentSection = `${currentSection}: ${text}`;

    waitingForSectionTitle = false;

    continue;
  }

  // Ignore generic label
  if (/^المواد$/u.test(text)) {
    continue;
  }

  // =======================================================
  // CONTENT
  // =======================================================

  if (currentArticle) {
    currentArticle.contentParts.push(text);
  }
}

flushArticle();

// =========================================================
// VALIDATION
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

const duplicates = [
  ...new Set(
    articleNumbers.filter(
      (number, index) => articleNumbers.indexOf(number) !== index,
    ),
  ),
];

const activeArticles = articles.filter(
  (article) => article.status === "active",
);

const repealedArticles = articles.filter(
  (article) => article.status === "repealed",
);

const emptyActiveArticles = articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// NUMERIC GAP CHECK
// =========================================================

const numericNumbers = articles
  .map((article) => article.article_number)
  .filter((number) => /^\d+$/u.test(number))
  .map(Number);

const maxNumeric = numericNumbers.length ? Math.max(...numericNumbers) : 0;

const numericSet = new Set(numericNumbers);

const missingNumericArticles = [];

for (let number = 1; number <= maxNumeric; number++) {
  if (!numericSet.has(number)) {
    missingNumericArticles.push(number);
  }
}

// =========================================================
// SUSPICIOUS CONTENT
// =========================================================

const suspiciousHierarchy = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /(?:^|\n)الباب\s+/u.test(content) || /(?:^|\n)القسم\s+/u.test(content)
    );
  })
  .map((article) => article.article_number);

const suspiciousRepealedText = articles
  .filter(
    (article) =>
      article.status !== "repealed" &&
      /ملغاة|ملغى/u.test(article.content_ar || ""),
  )
  .map((article) => article.article_number);

// =========================================================
// FOOTNOTE / EDITORIAL LEAK CHECK
// =========================================================

const suspiciousFootnotes = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /مستبدلة بالقانون/u.test(content) ||
      /مصححة بالاستدراك/u.test(content) ||
      /وفقا لما جاء بالقانون/u.test(normalizeForDetection(content)) ||
      /ملاحظة من مؤسسة/u.test(content) ||
      /المصدر الرسمي/u.test(content)
    );
  })
  .map((article) => article.article_number);

// =========================================================
// EXPECTED VALUES
// =========================================================

const expectedRepealed = ["3", "7", "12"];

const missingExpectedRepealed = expectedRepealed.filter(
  (number) =>
    !repealedArticles.some((article) => article.article_number === number),
);

const unexpectedRepealed = repealedArticles
  .map((article) => article.article_number)
  .filter((number) => !expectedRepealed.includes(number));

// =========================================================
// OUTPUT
// =========================================================

const output = {
  collection: {
    title_ar: "الأحوال الشخصية",
  },

  law: {
    title_ar: "قانون بشأن أحكام النفقة وبعض مسائل الأحوال الشخصية",

    short_title_ar: "قانون الأحوال الشخصية رقم 25 لسنة 1920",

    law_number: "25",

    law_year: 1920,

    source_name: "مؤسسة المستشار عاطف الحصوة",

    source_url: SOURCE_URL,

    source_reference:
      "الصفحة تشير إلى أن النص منقول عن بوابة تشريعات محكمة النقض والجريدة الرسمية، وفقاً لآخر تعديل صادر في 4 يوليو 1985",
  },

  extracted_at: new Date().toISOString(),

  total_articles: articles.length,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    active_articles: activeArticles.length,

    repealed_articles: repealedArticles.length,

    repealed_article_numbers: repealedArticles.map(
      (article) => article.article_number,
    ),

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    empty_active_articles: emptyActiveArticles,

    empty_active_articles_count: emptyActiveArticles.length,

    max_numeric_article: maxNumeric,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    suspicious_repealed_text: suspiciousRepealedText,

    suspicious_repealed_text_count: suspiciousRepealedText.length,

    suspicious_footnotes: suspiciousFootnotes,

    suspicious_footnotes_count: suspiciousFootnotes.length,

    missing_expected_repealed_articles: missingExpectedRepealed,

    missing_expected_repealed_articles_count: missingExpectedRepealed.length,

    unexpected_repealed_articles: unexpectedRepealed,

    unexpected_repealed_articles_count: unexpectedRepealed.length,
  },

  articles,
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

console.log(`Articles: ${articles.length}`);

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log(`Active: ${activeArticles.length}`);

console.log(`Repealed: ${repealedArticles.length}`);

console.log("");

console.log(
  `Repealed articles: ${
    repealedArticles.length
      ? repealedArticles.map((article) => article.article_number).join(", ")
      : "None"
  }`,
);

console.log(
  `Duplicates: ${duplicates.length ? duplicates.join(", ") : "None"}`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log(
  `Missing numeric articles: ${
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
    suspiciousRepealedText.length ? suspiciousRepealedText.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious footnotes: ${
    suspiciousFootnotes.length ? suspiciousFootnotes.join(", ") : "None"
  }`,
);

console.log(
  `Missing expected repealed articles: ${
    missingExpectedRepealed.length ? missingExpectedRepealed.join(", ") : "None"
  }`,
);

console.log(
  `Unexpected repealed articles: ${
    unexpectedRepealed.length ? unexpectedRepealed.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
