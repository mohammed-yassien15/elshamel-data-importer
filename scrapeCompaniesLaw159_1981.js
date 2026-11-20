import fs from "fs";
import * as cheerio from "cheerio";

const HTML_FILE = "companies-law-159-1981.html";

const OUTPUT_FILE = "companies-law-159-1981.json";

const SOURCE_URL =
  "https://alberonsy.com/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-159-%D9%84%D8%B3%D9%86%D8%A9-1981-%D8%A8%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B4%D8%B1%D9%83%D8%A7%D8%AA-%D8%A7%D9%84/";

const EXPECTED = {
  issuanceArticles: 6,
  firstNumericArticle: 1,
  lastNumericArticle: 184,
};

// =========================================================
// TEXT HELPERS
// =========================================================

function normalizeText(text = "") {
  return String(text)
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeInvisibleChars(text = "") {
  return String(text).replace(
    /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
    "",
  );
}

function removeArabicDiacritics(text = "") {
  return String(text).replace(/[\u064B-\u065F\u0670]/g, "");
}

function normalizeArabicDigits(text = "") {
  const arabic = "٠١٢٣٤٥٦٧٨٩";

  const persian = "۰۱۲۳۴۵۶۷۸۹";

  return String(text).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabic.indexOf(digit);

    if (arabicIndex !== -1) {
      return String(arabicIndex);
    }

    const persianIndex = persian.indexOf(digit);

    if (persianIndex !== -1) {
      return String(persianIndex);
    }

    return digit;
  });
}

function normalizeForDetection(text = "") {
  return removeArabicDiacritics(
    normalizeArabicDigits(removeInvisibleChars(normalizeText(text))),
  )
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================================================
// ISSUANCE ARTICLES
// =========================================================

const issuanceNames = new Map([
  ["الماده الاولي", "1"],
  ["الماده الثانيه", "2"],
  ["الماده الثالثه", "3"],
  ["الماده الرابعه", "4"],
  ["الماده الخامسه", "5"],
  ["الماده السادسه", "6"],
]);

function extractIssuanceNumber(text = "") {
  let normalized = normalizeForDetection(text)
    .replace(/ة/g, "ه")
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .replace(/[:：]\s*$/u, "")
    .trim();

  return issuanceNames.get(normalized) ?? null;
}

// =========================================================
// ARTICLE NUMBERS
// =========================================================

function normalizeArticleSuffix(suffix = "") {
  let value = normalizeForDetection(suffix);

  value = value
    .replace(/مكررا?/u, "مكرر")
    .replace(/\s*\/\s*/g, "/")
    .trim();

  if (!value) {
    return "";
  }

  if (value === "مكرر") {
    return " مكرر";
  }

  const match = value.match(/^مكرر\s*\/?\s*([ابجدهو])$/u);

  if (match) {
    return ` مكرر/${match[1]}`;
  }

  return ` ${value}`;
}

function extractLawArticleNumber(text = "") {
  const normalized = normalizeForDetection(text);

  /*
    Supported:

    مادة (17):
    مادة (21 مكررًا):
    مادة (135 مكررًا / أ):
    مادة (135 مكررًا / ب):
  */

  let match = normalized.match(
    /^(?:مادة|المادة)\s*\(\s*(\d+)\s*(.*?)\s*\)\s*[:：]?\s*$/u,
  );

  if (match) {
    const base = match[1];

    const suffix = normalizeArticleSuffix(match[2]);

    return base + suffix;
  }

  match = normalized.match(/^(?:مادة|المادة)\s+(\d+)\s*(.*?)\s*[:：]?\s*$/u);

  if (match) {
    const base = match[1];

    const suffix = normalizeArticleSuffix(match[2]);

    return base + suffix;
  }

  return null;
}

function getBaseArticleNumber(articleNumber = "") {
  const match = String(articleNumber).match(/^(\d+)/u);

  return match ? Number(match[1]) : null;
}

function isRegularNumericArticle(articleNumber = "") {
  return /^\d+$/u.test(String(articleNumber));
}

// =========================================================
// HIERARCHY
// =========================================================

function isBookHeading(text = "") {
  return /^الكتاب\s+/u.test(normalizeForDetection(text));
}

function isPartHeading(text = "") {
  return /^الباب\s+/u.test(normalizeForDetection(text));
}

function isChapterHeading(text = "") {
  return /^الفصل\s+/u.test(
    normalizeForDetection(text)
      .replace(/^\(\s*/u, "")
      .replace(/\s*\)$/u, ""),
  );
}

function isSectionHeading(text = "") {
  const value = normalizeForDetection(text);

  return /^الفرع\s+/u.test(value) || /^المبحث\s+/u.test(value);
}

function looksLikeDivisionHeading(text = "") {
  const value = normalizeForDetection(text)
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "");

  return /^(اولا|ثانيا|ثالثا|رابعا|خامسا|سادسا|سابعا|ثامنا|تاسعا|عاشرا)\b/u.test(
    value,
  );
}

function cleanHierarchyHeading(text = "") {
  return normalizeText(text)
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .trim();
}

// =========================================================
// STATUS DETECTION
// =========================================================

function detectArticleStatus(content = "") {
  const normalized = normalizeForDetection(content).replace(/ة/g, "ه");

  if (/^ملغاه\b/u.test(normalized) || /^ملغي\b/u.test(normalized)) {
    return "repealed";
  }

  return "active";
}

// =========================================================
// SOURCE NOTE DETECTION
// =========================================================

const SEPARATOR_REGEX = /_{8,}/u;

function splitArticleContent(content = "") {
  const value = normalizeText(content);

  const match = value.match(SEPARATOR_REGEX);

  if (!match) {
    return {
      content: value || null,
      source_note: null,
    };
  }

  const index = match.index;

  return {
    content: value.slice(0, index).trim() || null,

    source_note: value.slice(index + match[0].length).trim() || null,
  };
}

function looksLikeFootnoteLine(text = "") {
  const value = normalizeForDetection(text);

  return (
    /^\(\s*\d+(?:\s*\/\s*\d+)?\s*\)/u.test(value) ||
    value.includes("بالقانون رقم") ||
    value.includes("الجريده الرسميه") ||
    value.includes("المحكمه الدستوريه") ||
    value.includes("بعدم دستوريه")
  );
}

// =========================================================
// LOAD HTML
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING COMPANIES LAW 159/1981");

console.log("==============================");

console.log("");

if (!fs.existsSync(HTML_FILE)) {
  throw new Error(`File not found: ${HTML_FILE}`);
}

const html = fs.readFileSync(HTML_FILE, "utf8");

if (html.length < 1000) {
  throw new Error("HTML file looks incomplete.");
}

console.log(`Loaded HTML: ${HTML_FILE}`);

console.log(`HTML size: ${html.length} characters`);

const $ = cheerio.load(html);

// =========================================================
// BUILD BLOCKS
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

    blocks.push(...lines);
  });

const cleanedBlocks = blocks.filter(Boolean);

console.log(`DOM blocks found: ${cleanedBlocks.length}`);

// =========================================================
// DIAGNOSTIC
// =========================================================

const issuanceHeadings = cleanedBlocks.filter((block) =>
  extractIssuanceNumber(block),
);

console.log("");
console.log("ISSUANCE HEADING TEST");

for (const heading of issuanceHeadings) {
  console.log(`${heading} => ${extractIssuanceNumber(heading)}`);
}

const articleHeadings = cleanedBlocks
  .map((block) => extractLawArticleNumber(block))
  .filter(Boolean);

console.log("");
console.log(`Detected law article headings: ${articleHeadings.length}`);

console.log("First:", articleHeadings.slice(0, 20));

console.log("Last:", articleHeadings.slice(-20));

const specialArticleHeadings = articleHeadings.filter(
  (number) => !isRegularNumericArticle(number),
);

console.log("");

console.log(`Detected special/mكرر headings: ${specialArticleHeadings.length}`);

console.log(specialArticleHeadings);

// =========================================================
// STATE
// =========================================================

const issuanceArticles = [];

const rawArticles = [];

let currentIssuance = null;

let currentArticle = null;

let lawStarted = false;

let currentDivision = null;

let currentBook = null;

let currentPart = null;

let currentChapter = null;

let currentSection = null;

// =========================================================
// FLUSH ISSUANCE
// =========================================================

function flushIssuance() {
  if (!currentIssuance) {
    return;
  }

  issuanceArticles.push({
    article_number: currentIssuance.article_number,

    article_order: issuanceArticles.length + 1,

    title_ar: currentIssuance.title_ar,

    content_ar: normalizeText(currentIssuance.contentParts.join("\n")) || null,
  });

  currentIssuance = null;
}

// =========================================================
// FLUSH ARTICLE
// =========================================================

function flushArticle() {
  if (!currentArticle) {
    return;
  }

  const rawContent = normalizeText(currentArticle.contentParts.join("\n"));

  const split = splitArticleContent(rawContent);

  const status = detectArticleStatus(split.content);

  rawArticles.push({
    article_number: currentArticle.article_number,

    article_order: rawArticles.length + 1,

    division_title: currentArticle.division_title,

    book_title: currentArticle.book_title,

    part_title: currentArticle.part_title,

    chapter_title: currentArticle.chapter_title,

    section_title: currentArticle.section_title,

    subsection_title: null,

    title_ar: null,

    status,

    content_ar: split.content,

    legal_note: null,

    source_note: split.source_note,
  });

  currentArticle = null;
}

// =========================================================
// PARSE
// =========================================================

for (let index = 0; index < cleanedBlocks.length; index++) {
  const text = cleanedBlocks[index];

  const normalized = normalizeForDetection(text);

  // -------------------------------------------------------
  // BEFORE LAW
  // -------------------------------------------------------

  if (!lawStarted) {
    const issuanceNumber = extractIssuanceNumber(text);

    if (issuanceNumber) {
      flushIssuance();

      currentIssuance = {
        article_number: issuanceNumber,

        title_ar: text.replace(/[()]/g, "").trim(),

        contentParts: [],
      };

      continue;
    }

    const articleNumber = extractLawArticleNumber(text);

    if (articleNumber === "1") {
      flushIssuance();

      lawStarted = true;

      currentArticle = {
        article_number: articleNumber,

        division_title: currentDivision,

        book_title: currentBook,

        part_title: currentPart,

        chapter_title: currentChapter,

        section_title: currentSection,

        contentParts: [],
      };

      console.log("");
      console.log("✅ Found attached law at Article 1");

      continue;
    }

    if (currentIssuance) {
      currentIssuance.contentParts.push(text);
    }

    continue;
  }

  // -------------------------------------------------------
  // STOP DUPLICATED DOM
  // -------------------------------------------------------

  if (
    currentArticle &&
    getBaseArticleNumber(currentArticle.article_number) >= 184
  ) {
    const nextArticle = extractLawArticleNumber(text);

    const repeatedStart =
      normalized.includes("قانون رقم 159 لسنه 1981") ||
      normalized === "رئيس الجمهوريه";

    const siteFooter =
      normalized === "عن الموقع" ||
      normalized === "اتصل بنا" ||
      normalized.includes("this post has one comment");

    if (
      repeatedStart ||
      siteFooter ||
      (nextArticle && getBaseArticleNumber(nextArticle) < 50)
    ) {
      flushArticle();

      console.log("✅ Reached end of first law copy.");

      break;
    }
  }

  // -------------------------------------------------------
  // ARTICLE HEADING
  // -------------------------------------------------------

  const articleNumber = extractLawArticleNumber(text);

  if (articleNumber) {
    flushArticle();

    currentArticle = {
      article_number: articleNumber,

      division_title: currentDivision,

      book_title: currentBook,

      part_title: currentPart,

      chapter_title: currentChapter,

      section_title: currentSection,

      contentParts: [],
    };

    continue;
  }

  // -------------------------------------------------------
  // HIERARCHY
  // -------------------------------------------------------

  if (looksLikeDivisionHeading(text)) {
    flushArticle();

    currentDivision = cleanHierarchyHeading(text);

    currentChapter = null;

    currentSection = null;

    continue;
  }

  if (isBookHeading(text)) {
    flushArticle();

    currentBook = cleanHierarchyHeading(text);

    currentPart = null;

    currentChapter = null;

    currentSection = null;

    continue;
  }

  if (isPartHeading(text)) {
    flushArticle();

    currentPart = cleanHierarchyHeading(text);

    currentChapter = null;

    currentSection = null;

    continue;
  }

  if (isChapterHeading(text)) {
    flushArticle();

    currentChapter = cleanHierarchyHeading(text);

    currentSection = null;

    continue;
  }

  if (isSectionHeading(text)) {
    flushArticle();

    currentSection = cleanHierarchyHeading(text);

    continue;
  }

  // -------------------------------------------------------
  // CONTENT
  // -------------------------------------------------------

  if (currentArticle) {
    currentArticle.contentParts.push(text);
  }
}

// =========================================================
// FINAL FLUSH
// =========================================================

flushIssuance();
flushArticle();

// =========================================================
// DEDUPE
// =========================================================

const duplicateNumbers = [];

const seen = new Set();

const articles = [];

for (const article of rawArticles) {
  if (seen.has(article.article_number)) {
    duplicateNumbers.push(article.article_number);

    continue;
  }

  seen.add(article.article_number);

  articles.push(article);
}

// =========================================================
// REBUILD ORDER
// =========================================================

articles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// NUMERIC COVERAGE 1–184
// =========================================================

const regularNumericNumbers = new Set(
  articles
    .filter((article) => isRegularNumericArticle(article.article_number))
    .map((article) => Number(article.article_number)),
);

const missingNumericArticles = [];

for (
  let number = EXPECTED.firstNumericArticle;
  number <= EXPECTED.lastNumericArticle;
  number++
) {
  if (!regularNumericNumbers.has(number)) {
    missingNumericArticles.push(number);
  }
}

// =========================================================
// STATUS COUNTS
// =========================================================

const activeArticles = articles.filter(
  (article) => article.status === "active",
);

const repealedArticles = articles.filter(
  (article) => article.status === "repealed",
);

// =========================================================
// EMPTY ARTICLES
// =========================================================

const emptyActiveArticles = activeArticles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// =========================================================
// SPECIAL ARTICLES
// =========================================================

const specialArticles = articles
  .filter((article) => !isRegularNumericArticle(article.article_number))
  .map((article) => article.article_number);

// =========================================================
// REPEALED LIST
// =========================================================

const repealedArticleNumbers = repealedArticles.map(
  (article) => article.article_number,
);

// =========================================================
// HIERARCHY
// =========================================================

const divisions = [
  ...new Set(articles.map((article) => article.division_title).filter(Boolean)),
];

const books = [
  ...new Set(articles.map((article) => article.book_title).filter(Boolean)),
];

const parts = [
  ...new Set(articles.map((article) => article.part_title).filter(Boolean)),
];

const chapters = [
  ...new Set(articles.map((article) => article.chapter_title).filter(Boolean)),
];

const sections = [
  ...new Set(articles.map((article) => article.section_title).filter(Boolean)),
];

// =========================================================
// SOURCE NOTES
// =========================================================

const articlesWithSourceNotes = articles
  .filter((article) => article.source_note)
  .map((article) => article.article_number);

const suspiciousFootnoteArticles = articles
  .filter(
    (article) =>
      article.content_ar && looksLikeFootnoteLine(article.content_ar),
  )
  .map((article) => article.article_number);

// =========================================================
// ISSUANCE VALIDATION
// =========================================================

const issuanceNumbers = new Set(
  issuanceArticles.map((article) => Number(article.article_number)),
);

const missingIssuance = [];

for (let number = 1; number <= EXPECTED.issuanceArticles; number++) {
  if (!issuanceNumbers.has(number)) {
    missingIssuance.push(number);
  }
}

// =========================================================
// BASIC PROBLEMS
// =========================================================

const problems = [];

if (issuanceArticles.length !== EXPECTED.issuanceArticles) {
  problems.push(
    `Expected ${EXPECTED.issuanceArticles} issuance articles, got ${issuanceArticles.length}`,
  );
}

if (articles[0]?.article_number !== "1") {
  problems.push(`Unexpected first article: ${articles[0]?.article_number}`);
}

if (!articles.some((article) => article.article_number === "184")) {
  problems.push("Article 184 missing");
}

if (missingNumericArticles.length) {
  problems.push(
    `Missing numeric articles: ${missingNumericArticles.join(", ")}`,
  );
}

if (emptyActiveArticles.length) {
  problems.push(`Empty active articles: ${emptyActiveArticles.join(", ")}`);
}

// =========================================================
// OUTPUT
// =========================================================

const output = {
  collection: {
    title_ar: "الشركات",
  },

  law: {
    title_ar:
      "قانون رقم 159 لسنة 1981 بإصدار قانون شركات المساهمة وشركات التوصية بالأسهم والشركات ذات المسئولية المحدودة وشركات الشخص الواحد",

    short_title_ar: "قانون الشركات رقم 159 لسنة 1981",

    law_number: "159",

    law_year: 1981,

    source_name: "مكتب البارونسي للمحاماة",

    source_url: SOURCE_URL,

    source_reference:
      "النص المنشور لقانون الشركات رقم 159 لسنة 1981 وفقًا للتعديلات الواردة بالمصدر",

    source_claim:
      "المصدر يصف النص بأنه وفقًا لآخر تعديل صادر في 15 سبتمبر 2020",
  },

  source_snapshot: HTML_FILE,

  extracted_at: new Date().toISOString(),

  issuance_articles: issuanceArticles,

  total_issuance_articles: issuanceArticles.length,

  total_articles: articles.length,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    active_articles: activeArticles.length,

    repealed_articles: repealedArticles.length,

    special_articles: specialArticles,

    special_articles_count: specialArticles.length,

    repealed_article_numbers: repealedArticleNumbers,

    duplicate_article_numbers: [...new Set(duplicateNumbers)],

    missing_issuance_articles: missingIssuance,

    missing_numeric_articles: missingNumericArticles,

    empty_active_articles: emptyActiveArticles,

    detected_divisions: divisions,

    detected_divisions_count: divisions.length,

    detected_books: books,

    detected_books_count: books.length,

    detected_parts: parts,

    detected_parts_count: parts.length,

    detected_chapters: chapters,

    detected_chapters_count: chapters.length,

    detected_sections: sections,

    detected_sections_count: sections.length,

    articles_with_source_notes: articlesWithSourceNotes,

    suspicious_footnote_articles: suspiciousFootnoteArticles,

    problems,
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

console.log(`Issuance articles: ${issuanceArticles.length}`);

console.log(`Total article rows: ${articles.length}`);

console.log(`Active articles: ${activeArticles.length}`);

console.log(`Repealed articles: ${repealedArticles.length}`);

console.log("");

console.log(`First article: ${articles[0]?.article_number}`);

console.log(`Last article: ${articles[articles.length - 1]?.article_number}`);

console.log("");

console.log(
  `Special/mكرر articles (${specialArticles.length}): ${
    specialArticles.length ? specialArticles.join(", ") : "None"
  }`,
);

console.log("");

console.log(
  `Repealed articles (${repealedArticleNumbers.length}): ${
    repealedArticleNumbers.length ? repealedArticleNumbers.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Divisions: ${divisions.length}`);

console.log(`Books: ${books.length}`);

console.log(`Parts: ${parts.length}`);

console.log(`Chapters: ${chapters.length}`);

console.log(`Sections: ${sections.length}`);

console.log("");

console.log(
  `Missing issuance articles: ${
    missingIssuance.length ? missingIssuance.join(", ") : "None"
  }`,
);

console.log(
  `Duplicate article numbers: ${
    duplicateNumbers.length ? [...new Set(duplicateNumbers)].join(", ") : "None"
  }`,
);

console.log(
  `Missing numeric articles 1-184: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log("");

console.log(
  `Articles with separated source notes: ${
    articlesWithSourceNotes.length ? articlesWithSourceNotes.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious footnote articles: ${
    suspiciousFootnoteArticles.length
      ? suspiciousFootnoteArticles.join(", ")
      : "None"
  }`,
);

console.log("");

console.log(`Problems: ${problems.length ? problems.join(" | ") : "None"}`);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
