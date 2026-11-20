import fs from "fs";
import * as cheerio from "cheerio";

const SOURCE_URL = "https://manshurat.org/node/14676";

const OUTPUT_FILE = "data/raw/egyptian-criminal-procedure-law.json";

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
  return (
    normalizeArabicDigits(normalizeText(text))
      .replace(/ـ/g, "")
      // remove Arabic diacritics
      .replace(/[\u064B-\u0652]/g, "")
      .trim()
  );
}

function stripTrailingEditorialAnnotation(text = "") {
  return normalizeText(text)
    .replace(
      /\s*\((?:مضافة|معدل(?:ة)?|مستبدل(?:ة)?|استبدلت|أضيفت|أضيف)\s+بالقانون[^)]*\)\s*$/u,
      "",
    )
    .trim();
}

function normalizeArticleNumber(value = "") {
  let text = normalizeForDetection(value);

  text = stripTrailingEditorialAnnotation(text);

  text = text
    .replace(/^المادة\s*/u, "")
    .replace(/^مادة\s*/u, "")
    .replace(/\s+/g, " ")
    .trim();

  return text;
}

// =========================================================
// ARTICLE HEADING
// =========================================================

function extractArticleHeading(text = "") {
  const normalized = normalizeForDetection(text);

  if (!/^المادة\s+\d+/u.test(normalized)) {
    return null;
  }

  const withoutAnnotation = stripTrailingEditorialAnnotation(normalized);

  const match = withoutAnnotation.match(/^المادة\s+(.+)$/u);

  if (!match) {
    return null;
  }

  const candidate = match[1].replace(/\s+/g, " ").trim();

  // Supported:
  //
  // 1
  // 8 مكررا
  // 18 مكرر (أ)
  // 208 مكررا (ب)
  // 113 مكررا
  //
  const valid = /^\d+(?:\s+مكرر(?:ا)?)?(?:\s*\([^)]+\))?$/u.test(candidate);

  if (!valid) {
    return null;
  }

  return normalizeArticleNumber(`المادة ${candidate}`);
}

function isArticleHeading(text = "") {
  return Boolean(extractArticleHeading(text));
}

// =========================================================
// HIERARCHY DETECTION
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

function isSubsectionHeading(text = "") {
  return /^الفرع\s+/u.test(normalizeText(text));
}

function looksLikeHierarchySubtitle(text = "") {
  const value = normalizeText(text);

  if (!value) {
    return false;
  }

  if (
    isArticleHeading(value) ||
    isBookHeading(value) ||
    isPartHeading(value) ||
    isChapterHeading(value) ||
    isSectionHeading(value) ||
    isSubsectionHeading(value)
  ) {
    return false;
  }

  return value.length <= 180 && !/[.!؟]$/u.test(value);
}

// =========================================================
// FETCH
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING CRIMINAL PROCEDURE LAW");

console.log("==============================");

console.log("");

const response = await fetch(SOURCE_URL);

if (!response.ok) {
  throw new Error(`HTTP ${response.status}`);
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
  throw new Error("Could not find page content container.");
}

// =========================================================
// EXTRACT LOGICAL BLOCKS
// =========================================================

const blocks = [];

container.find("p, h1, h2, h3, h4, h5, h6, li").each((_, element) => {
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

// Remove immediate duplicates
const uniqueBlocks = blocks.filter(
  (block, index) => index === 0 || block !== blocks[index - 1],
);

console.log(`DOM blocks found: ${uniqueBlocks.length}`);

// =========================================================
// DEBUG
// =========================================================

const articleLikeBlocks = uniqueBlocks
  .filter((block) => /^المادة\s+/u.test(normalizeForDetection(block)))
  .slice(0, 30);

console.log("First article-like blocks:", articleLikeBlocks);

// =========================================================
// PARSER STATE
// =========================================================

let startedLaw = false;

let currentBook = null;

let currentPart = null;

let currentChapter = null;

let currentSection = null;

let currentSubsection = null;

let currentArticle = null;

let waitingForBookTitle = false;

let waitingForPartTitle = false;

let waitingForChapterTitle = false;

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

  // Exactly repealed
  if (/^(ملغاة|ملغى)[.،؛:]?$/u.test(content)) {
    status = "repealed";

    content = null;
  }

  articles.push({
    article_number: currentArticle.article_number,

    article_order: articles.length + 1,

    division_title: null,

    book_title: currentArticle.book_title,

    part_title: currentArticle.part_title,

    chapter_title: currentArticle.chapter_title,

    section_title: currentArticle.section_title,

    subsection_title: currentArticle.subsection_title,

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
  const text = normalizeText(uniqueBlocks[index]);

  if (!text) {
    continue;
  }

  // =======================================================
  // START OF ACTUAL LAW
  //
  // Skip issuance articles.
  // Actual law begins at "الكتاب الأول".
  // =======================================================

  if (!startedLaw) {
    if (text === "الكتاب الأول") {
      startedLaw = true;

      currentBook = "الكتاب الأول";

      currentPart = null;

      currentChapter = null;

      currentSection = null;

      currentSubsection = null;

      waitingForBookTitle = true;

      waitingForPartTitle = false;

      waitingForChapterTitle = false;

      console.log("✅ Found start of actual Criminal Procedure Law.");
    }

    continue;
  }

  // =======================================================
  // ARTICLE
  // =======================================================

  const articleNumber = extractArticleHeading(text);

  if (articleNumber) {
    flushArticle();

    currentArticle = {
      article_number: articleNumber,

      book_title: currentBook,

      part_title: currentPart,

      chapter_title: currentChapter,

      section_title: currentSection,

      subsection_title: currentSubsection,

      contentParts: [],
    };

    waitingForBookTitle = false;

    waitingForPartTitle = false;

    waitingForChapterTitle = false;

    continue;
  }

  // =======================================================
  // BOOK
  // =======================================================

  if (isBookHeading(text)) {
    flushArticle();

    currentBook = text;

    currentPart = null;

    currentChapter = null;

    currentSection = null;

    currentSubsection = null;

    waitingForBookTitle = true;

    waitingForPartTitle = false;

    waitingForChapterTitle = false;

    continue;
  }

  // Book subtitle
  if (waitingForBookTitle && looksLikeHierarchySubtitle(text)) {
    currentBook = `${currentBook}: ${text}`;

    waitingForBookTitle = false;

    continue;
  }

  // =======================================================
  // BAB / PART
  // =======================================================

  if (isPartHeading(text)) {
    flushArticle();

    currentPart = text;

    currentChapter = null;

    currentSection = null;

    currentSubsection = null;

    waitingForPartTitle = true;

    waitingForBookTitle = false;

    waitingForChapterTitle = false;

    continue;
  }

  // باب subtitle
  if (waitingForPartTitle && looksLikeHierarchySubtitle(text)) {
    currentPart = `${currentPart}: ${text}`;

    waitingForPartTitle = false;

    continue;
  }

  // =======================================================
  // CHAPTER
  // =======================================================

  if (isChapterHeading(text)) {
    flushArticle();

    currentChapter = text;

    currentSection = null;

    currentSubsection = null;

    waitingForChapterTitle = true;

    waitingForBookTitle = false;

    waitingForPartTitle = false;

    continue;
  }

  // Chapter subtitle
  if (waitingForChapterTitle && looksLikeHierarchySubtitle(text)) {
    currentChapter = `${currentChapter}: ${text}`;

    waitingForChapterTitle = false;

    continue;
  }

  // =======================================================
  // SECTION
  // =======================================================

  if (isSectionHeading(text)) {
    flushArticle();

    currentSection = text;

    currentSubsection = null;

    waitingForBookTitle = false;

    waitingForPartTitle = false;

    waitingForChapterTitle = false;

    continue;
  }

  // =======================================================
  // SUBSECTION / BRANCH
  // =======================================================

  if (isSubsectionHeading(text)) {
    flushArticle();

    currentSubsection = text;

    waitingForBookTitle = false;

    waitingForPartTitle = false;

    waitingForChapterTitle = false;

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
// VALIDATION
// =========================================================

// ---------------------------------------------------------
// ARTICLE NUMBERS
// ---------------------------------------------------------

const articleNumbers = articles.map((article) => article.article_number);

// ---------------------------------------------------------
// DUPLICATES
// ---------------------------------------------------------

const duplicateNumbers = articleNumbers.filter(
  (number, index) => articleNumbers.indexOf(number) !== index,
);

const uniqueDuplicates = [...new Set(duplicateNumbers)];

// ---------------------------------------------------------
// ACTIVE / REPEALED
// ---------------------------------------------------------

const activeArticles = articles.filter(
  (article) => article.status === "active",
);

const repealedArticles = articles.filter(
  (article) => article.status === "repealed",
);

// ---------------------------------------------------------
// EMPTY ACTIVE
// ---------------------------------------------------------

const emptyActiveArticles = articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// SPECIAL ARTICLE NUMBERS
// ---------------------------------------------------------

const specialArticleNumbers = articles
  .map((article) => article.article_number)
  .filter((number) => !/^\d+$/u.test(number));

// ---------------------------------------------------------
// ARTICLE ORDER
// ---------------------------------------------------------

const invalidArticleOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// BASE NUMERIC ARTICLES
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
// SUSPICIOUS HIERARCHY INSIDE CONTENT
// =========================================================

const suspiciousHierarchy = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /(?:^|\n)الكتاب\s+/u.test(content) ||
      /(?:^|\n)الباب\s+/u.test(content) ||
      /(?:^|\n)الفصل\s+/u.test(content) ||
      /(?:^|\n)القسم\s+/u.test(content) ||
      /(?:^|\n)الفرع\s+/u.test(content)
    );
  })
  .map((article) => article.article_number);

// =========================================================
// SUSPICIOUS REPEALED TEXT
// =========================================================

const suspiciousRepealedText = articles
  .filter((article) => {
    return (
      article.status !== "repealed" &&
      /ملغاة|ملغى/u.test(article.content_ar || "")
    );
  })
  .map((article) => article.article_number);

// =========================================================
// SUSPICIOUS EDITORIAL NOTES
//
// IMPORTANT:
// Do not search for generic "المعدل بالقانون"
// because it may legitimately occur inside statutory text.
// =========================================================

const suspiciousEditorialNotes = articles
  .filter((article) => {
    const content = normalizeText(article.content_ar || "");

    return (
      /^التعديل الأخير بموجب القانون/u.test(content) ||
      /^\(مضافة بالقانون/u.test(content) ||
      /^مقضي بعدم دستور/u.test(content) ||
      /^قضي بعدم دستور/u.test(content)
    );
  })
  .map((article) => article.article_number);

// =========================================================
// LEAKED ARTICLE HEADINGS
// =========================================================

const leakedArticleHeadings = articles
  .filter((article) => {
    const content = normalizeForDetection(article.content_ar || "");

    return /(?:^|\n)المادة\s+\d+/u.test(content);
  })
  .map((article) => article.article_number);

// =========================================================
// SPECIFIC ARTICLES WE EXPECT
// =========================================================

const expectedSpecificArticles = ["113 مكررا", "208 مكررا (ب)"];

const missingSpecificArticles = expectedSpecificArticles.filter(
  (expected) =>
    !articles.some((article) => article.article_number === expected),
);

// =========================================================
// OUTPUT
// =========================================================

const output = {
  law: {
    title_ar: "قانون الإجراءات الجنائية",

    short_title_ar: "قانون الإجراءات الجنائية",

    law_number: "150",

    law_year: 1950,

    source_name: "منشورات قانونية",

    source_url: SOURCE_URL,

    source_reference:
      "صفحة المصدر تشير إلى آخر تعديل بتاريخ 5 سبتمبر 2020 بالقانون رقم 189 لسنة 2020",
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

    duplicate_article_numbers: uniqueDuplicates,

    duplicate_article_numbers_count: uniqueDuplicates.length,

    empty_active_articles: emptyActiveArticles,

    empty_active_articles_count: emptyActiveArticles.length,

    special_article_numbers: specialArticleNumbers,

    special_article_numbers_count: specialArticleNumbers.length,

    max_numeric_article: maxNumeric,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    invalid_article_orders: invalidArticleOrders,

    invalid_article_orders_count: invalidArticleOrders.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    suspicious_repealed_text: suspiciousRepealedText,

    suspicious_repealed_text_count: suspiciousRepealedText.length,

    suspicious_editorial_notes: suspiciousEditorialNotes,

    suspicious_editorial_notes_count: suspiciousEditorialNotes.length,

    leaked_article_headings: leakedArticleHeadings,

    leaked_article_headings_count: leakedArticleHeadings.length,

    missing_specific_articles: missingSpecificArticles,

    missing_specific_articles_count: missingSpecificArticles.length,
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

console.log(`Max numeric article: ${maxNumeric}`);

console.log(`Active: ${activeArticles.length}`);

console.log(`Repealed: ${repealedArticles.length}`);

console.log("");

console.log(
  `Duplicates: ${
    uniqueDuplicates.length ? uniqueDuplicates.join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Special article numbers: ${specialArticleNumbers.length}`);

console.log(
  specialArticleNumbers.length ? specialArticleNumbers.join(", ") : "None",
);

console.log("");

console.log(
  `Missing base numeric articles: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
  }`,
);

console.log(
  `Invalid article orders: ${
    invalidArticleOrders.length ? invalidArticleOrders.join(", ") : "None"
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
  `Suspicious editorial notes: ${
    suspiciousEditorialNotes.length
      ? suspiciousEditorialNotes.join(", ")
      : "None"
  }`,
);

console.log(
  `Leaked article headings: ${
    leakedArticleHeadings.length ? leakedArticleHeadings.join(", ") : "None"
  }`,
);

console.log(
  `Missing specific articles: ${
    missingSpecificArticles.length ? missingSpecificArticles.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
