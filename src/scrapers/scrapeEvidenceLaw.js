import fs from "fs";
import * as cheerio from "cheerio";

const SOURCE_URL =
  "https://alberonsy.com/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%A7%D9%84%D8%A5%D8%AB%D8%A8%D8%A7%D8%AA-%D9%81%D9%8A-%D8%A7%D9%84%D9%85%D9%88%D8%A7%D8%AF-%D8%A7%D9%84%D9%85%D8%AF%D9%86%D9%8A%D8%A9-%D9%88%D8%A7%D9%84%D8%AA%D8%AC/";

const OUTPUT_FILE = "egyptian-evidence-law.json";

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
  let value = normalizeArabicDigits(raw)
    .replace(/مكرراً/gu, "مكرر")
    .replace(/مكررًا/gu, "مكرر")
    .replace(/مكررا/gu, "مكرر")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

function isArticleHeading(text = "") {
  const value = normalizeArabicDigits(normalizeText(text));

  return /^مادة\s*\(\s*\d+\s*(?:مكرر(?:اً|ًا|ا)?)?\s*\)\s*:?\s*$/u.test(value);
}

function extractArticleNumber(text = "") {
  const value = normalizeArabicDigits(normalizeText(text));

  const match = value.match(
    /^مادة\s*\(\s*(\d+\s*(?:مكرر(?:اً|ًا|ا)?)?)\s*\)\s*:?\s*$/u,
  );

  if (!match) {
    return null;
  }

  return normalizeArticleNumber(match[1]);
}

function isBookHeading(text = "") {
  return /^الكتاب\s+/u.test(normalizeText(text));
}

function isPartHeading(text = "") {
  return /^الباب\s+/u.test(normalizeText(text));
}

function isChapterHeading(text = "") {
  return /^\(?الفصل\s+/u.test(normalizeText(text));
}

function isSectionHeading(text = "") {
  return /^الفرع\s+/u.test(normalizeText(text));
}

function cleanStructuralHeading(text = "") {
  return normalizeText(text)
    .replace(/^\((الفصل[^)]+)\)$/u, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeFootnoteSeparator(text = "") {
  return /^_{10,}$/u.test(normalizeText(text));
}

function looksLikeFootnoteLine(text = "") {
  const value = normalizeText(text);

  return /^\(\d+\)\s+/u.test(normalizeArabicDigits(value));
}

function looksLikeShortTitle(text = "") {
  const value = normalizeText(text);

  if (!value) return false;

  if (
    isArticleHeading(value) ||
    isPartHeading(value) ||
    isChapterHeading(value) ||
    isSectionHeading(value) ||
    isBookHeading(value)
  ) {
    return false;
  }

  if (looksLikeFootnoteSeparator(value)) {
    return false;
  }

  if (value.length > 120) {
    return false;
  }

  if (/[.!؟؛:]$/u.test(value)) {
    return false;
  }

  if (value.split(/\s+/u).length > 12) {
    return false;
  }

  return true;
}

// =========================================================
// FETCH
// =========================================================

console.log("");
console.log("==============================");
console.log("SCRAPING EVIDENCE LAW");
console.log("==============================");
console.log("");

const response = await fetch(SOURCE_URL, {
  method: "GET",

  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",

    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",

    "Accept-Language": "ar-EG,ar;q=0.9,en-US;q=0.8,en;q=0.7",

    "Cache-Control": "no-cache",

    Pragma: "no-cache",

    "Upgrade-Insecure-Requests": "1",

    "Sec-Fetch-Dest": "document",

    "Sec-Fetch-Mode": "navigate",

    "Sec-Fetch-Site": "none",

    "Sec-Fetch-User": "?1",

    Referer: "https://alberonsy.com/",
  },

  redirect: "follow",
});

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${response.statusText}`);
}

const html = await response.text();

const $ = cheerio.load(html);

// =========================================================
// LOCATE ARTICLE CONTENT
// =========================================================

let container = $(".entry-content").first();

if (!container.length) {
  container = $(".post-content").first();
}

if (!container.length) {
  container = $("article").first();
}

if (!container.length) {
  container = $("main").first();
}

if (!container.length) {
  throw new Error("Could not find article content container.");
}

// =========================================================
// EXTRACT ORDERED BLOCKS
// =========================================================

const blocks = [];

container.find("p, h1, h2, h3, h4, h5, h6, li").each((_, element) => {
  const text = normalizeText($(element).text());

  if (!text) {
    return;
  }

  blocks.push(text);
});

console.log(`DOM blocks found: ${blocks.length}`);

// =========================================================
// PARSE
// =========================================================

const articles = [];

let startedLaw = false;

let currentArticle = null;

let currentBook = null;
let currentPart = null;
let currentChapter = null;
let currentSection = null;
let currentSubsection = null;
let currentTitle = null;

let inFootnotes = false;

const LAW_START_TITLE = "قانون الإثبات في المواد المدنية والتجارية";

function flushCurrentArticle() {
  if (!currentArticle) {
    return;
  }

  currentArticle.content_ar = normalizeText(currentArticle.content_ar);

  articles.push(currentArticle);

  currentArticle = null;
}

// =========================================================
// WALK BLOCKS
// =========================================================

for (let index = 0; index < blocks.length; index++) {
  const text = blocks[index];

  // -------------------------------------------------------
  // Skip issuance law until actual Evidence Law starts
  // -------------------------------------------------------

  if (!startedLaw) {
    if (text === LAW_START_TITLE) {
      startedLaw = true;

      currentBook = null;
      currentPart = null;
      currentChapter = null;
      currentSection = null;
      currentSubsection = null;
      currentTitle = null;

      console.log("✅ Found start of actual Evidence Law.");
    }

    continue;
  }

  // -------------------------------------------------------
  // FOOTNOTE SEPARATOR
  // -------------------------------------------------------

  // -------------------------------------------------------
  // FOOTNOTE SEPARATOR
  // -------------------------------------------------------

  if (looksLikeFootnoteSeparator(text)) {
    inFootnotes = true;

    continue;
  }

  // -------------------------------------------------------
  // SKIP FOOTNOTES UNTIL LAW STRUCTURE RESUMES
  // -------------------------------------------------------

  if (inFootnotes) {
    const structureResumed =
      isArticleHeading(text) ||
      isBookHeading(text) ||
      isPartHeading(text) ||
      isChapterHeading(text) ||
      isSectionHeading(text);

    if (!structureResumed) {
      // This is still a source footnote / amendment note.
      // Do not add it to article content.
      continue;
    }

    // We reached the next part/chapter/article,
    // so footnotes are finished.
    inFootnotes = false;

    // IMPORTANT:
    // Do not "continue" here.
    // Let the same block continue through the parser below.
  }

  // -------------------------------------------------------
  // ARTICLE HEADING
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

      subsection_title: currentSubsection,

      title_ar: currentTitle,

      status: "active",

      content_ar: "",
    };

    currentTitle = null;

    continue;
  }

  // -------------------------------------------------------
  // BOOK
  // -------------------------------------------------------

  if (isBookHeading(text)) {
    flushCurrentArticle();

    currentBook = cleanStructuralHeading(text);

    currentPart = null;
    currentChapter = null;
    currentSection = null;
    currentSubsection = null;
    currentTitle = null;

    continue;
  }

  // -------------------------------------------------------
  // PART / الباب
  // -------------------------------------------------------

  if (isPartHeading(text)) {
    flushCurrentArticle();

    const nextText = blocks[index + 1]
      ? normalizeText(blocks[index + 1])
      : null;

    let partTitle = cleanStructuralHeading(text);

    if (
      nextText &&
      looksLikeShortTitle(nextText) &&
      !isArticleHeading(nextText)
    ) {
      partTitle = `${partTitle}: ${nextText}`;

      index++;
    }

    currentPart = partTitle;

    currentChapter = null;
    currentSection = null;
    currentSubsection = null;
    currentTitle = null;

    continue;
  }

  // -------------------------------------------------------
  // CHAPTER / الفصل
  // -------------------------------------------------------

  if (isChapterHeading(text)) {
    flushCurrentArticle();

    const nextText = blocks[index + 1]
      ? normalizeText(blocks[index + 1])
      : null;

    let chapterTitle = cleanStructuralHeading(text);

    if (
      nextText &&
      looksLikeShortTitle(nextText) &&
      !isArticleHeading(nextText)
    ) {
      chapterTitle = `${chapterTitle}: ${nextText}`;

      index++;
    }

    currentChapter = chapterTitle;

    currentSection = null;
    currentSubsection = null;
    currentTitle = null;

    continue;
  }

  // -------------------------------------------------------
  // SECTION / الفرع
  // -------------------------------------------------------

  if (isSectionHeading(text)) {
    flushCurrentArticle();

    const nextText = blocks[index + 1]
      ? normalizeText(blocks[index + 1])
      : null;

    let sectionTitle = cleanStructuralHeading(text);

    if (
      nextText &&
      looksLikeShortTitle(nextText) &&
      !isArticleHeading(nextText)
    ) {
      sectionTitle = `${sectionTitle}: ${nextText}`;

      index++;
    }

    currentSection = sectionTitle;

    currentSubsection = null;
    currentTitle = null;

    continue;
  }

  // -------------------------------------------------------
  // SHORT TITLE BEFORE FIRST ARTICLE OF A SECTION
  // -------------------------------------------------------

  if (!currentArticle && looksLikeShortTitle(text)) {
    currentSubsection = text;

    currentTitle = text;

    continue;
  }

  // -------------------------------------------------------
  // ARTICLE CONTENT
  // -------------------------------------------------------

  if (currentArticle) {
    if (currentArticle.content_ar) {
      currentArticle.content_ar += "\n";
    }

    currentArticle.content_ar += text;
  }
}

// =========================================================
// FINAL FLUSH
// =========================================================

flushCurrentArticle();

// =========================================================
// VALIDATION
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

const seen = new Set();

const duplicates = [];

for (const number of articleNumbers) {
  if (seen.has(number)) {
    duplicates.push(number);
  }

  seen.add(number);
}

const emptyArticles = articles
  .filter((article) => !normalizeText(article.content_ar))
  .map((article) => article.article_number);

const repeatedArticles = articles
  .filter((article) => /مكرر/u.test(article.article_number))
  .map((article) => article.article_number);

const suspiciousContent = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /\nالباب\s+/u.test(content) ||
      /\nالفصل\s+/u.test(content) ||
      /\nالفرع\s+/u.test(content)
    );
  })
  .map((article) => article.article_number);

// =========================================================
// NUMERIC BASE CHECK
// =========================================================

const numericBaseNumbers = new Set(
  articleNumbers.filter((number) => /^\d+$/u.test(number)).map(Number),
);

const missingNumericArticles = [];

for (let number = 1; number <= 162; number++) {
  if (!numericBaseNumbers.has(number)) {
    missingNumericArticles.push(number);
  }
}

// =========================================================
// OUTPUT
// =========================================================

const output = {
  law: {
    title_ar: "قانون الإثبات في المواد المدنية والتجارية",

    short_title_ar: "قانون الإثبات",

    law_number: "25",

    law_year: 1968,

    source_name: "Alber Onsy",

    source_url: SOURCE_URL,
  },

  extracted_at: new Date().toISOString(),

  total_articles: articles.length,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    duplicate_article_numbers: [...new Set(duplicates)],

    empty_articles: emptyArticles,

    empty_articles_count: emptyArticles.length,

    repeated_articles: repeatedArticles,

    repeated_articles_count: repeatedArticles.length,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    suspicious_hierarchy_in_content: suspiciousContent,

    suspicious_hierarchy_in_content_count: suspiciousContent.length,
  },

  articles,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

// =========================================================
// TERMINAL SUMMARY
// =========================================================

console.log("");
console.log("==============================");
console.log("SCRAPING COMPLETE");
console.log("==============================");

console.log(`Articles: ${articles.length}`);

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log(
  `Duplicates: ${
    duplicates.length ? [...new Set(duplicates)].join(", ") : "None"
  }`,
);

console.log(
  `Empty articles: ${emptyArticles.length ? emptyArticles.join(", ") : "None"}`,
);

console.log(`Empty articles count: ${emptyArticles.length}`);

console.log(
  `Repeated articles: ${
    repeatedArticles.length ? repeatedArticles.join(", ") : "None"
  }`,
);

console.log(
  `Missing numeric articles: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
  }`,
);

console.log(`Suspicious content count: ${suspiciousContent.length}`);

console.log(`Saved → ${OUTPUT_FILE}`);
