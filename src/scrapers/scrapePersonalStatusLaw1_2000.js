import fs from "fs";
import * as cheerio from "cheerio";

const HTML_FILE = "data/source/personal-status-law-1-2000.html";

const OUTPUT_FILE = "personal-status-law-1-2000.json";

const SOURCE_URL =
  "https://alberonsy.com/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-1-%D9%84%D8%B3%D9%86%D8%A9-2000-%D8%A8%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%AA%D9%86%D8%B8%D9%8A%D9%85-%D8%A8%D8%B9%D8%B6/";

const EXPECTED = {
  issuanceArticles: 6,

  lawArticles: 80,

  baseNumericArticles: 79,

  specialArticles: ["76 مكررا"],

  first: "1",

  last: "79",
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
// LAW ARTICLE NUMBER
//
// مادة (1)
// مادة (76 مكررًا)
// =========================================================

function extractArticleNumber(text = "") {
  const normalized = normalizeForDetection(text);

  const match =
    normalized.match(
      /^(?:المادة|مادة)\s*\(\s*(\d+(?:\s+مكررا(?:\s+(?:ثانيا|ثالثا))?)?)\s*\)\s*:?\s*$/u,
    ) ||
    normalized.match(
      /^(?:المادة|مادة)\s+(\d+(?:\s+مكررا(?:\s+(?:ثانيا|ثالثا))?)?)\s*:?\s*$/u,
    );

  return match ? normalizeText(match[1]) : null;
}

// =========================================================
// ISSUANCE ARTICLES
//
// (المادة الأولى)
// (المادة الثانية)
// ...
// =========================================================

const issuanceNames = new Map([
  ["المادة الأولى", "الأولى"],

  ["المادة الثانية", "الثانية"],

  ["المادة الثالثة", "الثالثة"],

  ["المادة الرابعة", "الرابعة"],

  ["المادة الخامسة", "الخامسة"],

  ["المادة السادسة", "السادسة"],
]);

function extractIssuanceArticle(text = "") {
  let normalized = normalizeText(text)
    .replace(/^[([]\s*/u, "")
    .replace(/\s*[)\]]$/u, "")
    .trim();

  normalized = removeArabicDiacritics(normalized);

  if (issuanceNames.has(normalized)) {
    return {
      article_number: issuanceNames.get(normalized),

      title_ar: normalized,
    };
  }

  return null;
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
  const normalized = normalizeForDetection(text)
    .replace(/^[([]\s*/u, "")
    .replace(/\s*[)\]]$/u, "");

  return /^الفصل\s+/u.test(normalized);
}

function cleanHierarchyTitle(text = "") {
  return normalizeText(text)
    .replace(/^[([]\s*/u, "")
    .replace(/\s*[)\]]$/u, "")
    .trim();
}

// =========================================================
// LOAD HTML
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING PERSONAL STATUS PROCEDURE LAW 1/2000");

console.log("==============================");

console.log("");

if (!fs.existsSync(HTML_FILE)) {
  throw new Error(`HTML file not found: ${HTML_FILE}`);
}

const html = fs.readFileSync(HTML_FILE, "utf8");

if (html.length < 1000) {
  throw new Error("HTML file looks empty or incomplete.");
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

// Consecutive duplicate removal.
const uniqueBlocks = blocks.filter(
  (block, index) => index === 0 || block !== blocks[index - 1],
);

console.log(`DOM blocks found: ${uniqueBlocks.length}`);

// =========================================================
// DEBUG HEADINGS
// =========================================================

const articleLikeBlocks = uniqueBlocks
  .filter((block) => /^(?:المادة|مادة|\(المادة)/u.test(normalizeText(block)))
  .slice(0, 120);

console.log("Article-like blocks:", articleLikeBlocks);

// =========================================================
// PARSER STATE
// =========================================================

const issuanceArticles = [];

const articles = [];

let currentIssuanceArticle = null;

let currentArticle = null;

let currentBook = null;

let currentPart = null;

let currentChapter = null;

let lawBodyStarted = false;

let lawFinished = false;

// =========================================================
// FLUSH ISSUANCE
// =========================================================

function flushIssuanceArticle() {
  if (!currentIssuanceArticle) {
    return;
  }

  issuanceArticles.push({
    article_number: currentIssuanceArticle.article_number,

    article_order: issuanceArticles.length + 1,

    title_ar: currentIssuanceArticle.title_ar,

    content_ar:
      normalizeText(currentIssuanceArticle.contentParts.join("\n")) || null,
  });

  currentIssuanceArticle = null;
}

// =========================================================
// FLUSH LAW ARTICLE
// =========================================================

function flushArticle() {
  if (!currentArticle) {
    return;
  }

  const content = normalizeText(currentArticle.contentParts.join("\n"));

  articles.push({
    article_number: currentArticle.article_number,

    article_order: articles.length + 1,

    division_title: null,

    book_title: currentArticle.book_title,

    part_title: currentArticle.part_title,

    chapter_title: currentArticle.chapter_title,

    section_title: null,

    subsection_title: null,

    title_ar: null,

    // Raw stage:
    // classification happens later.
    status: "active",

    content_ar: content || null,
  });

  currentArticle = null;
}

// =========================================================
// PARSE
// =========================================================

for (let index = 0; index < uniqueBlocks.length; index++) {
  if (lawFinished) {
    break;
  }

  const text = normalizeText(uniqueBlocks[index]);

  if (!text) {
    continue;
  }

  const normalized = normalizeForDetection(text);

  // =======================================================
  // BEFORE LAW BODY: ISSUANCE ARTICLES
  // =======================================================

  if (!lawBodyStarted) {
    const issuance = extractIssuanceArticle(text);

    if (issuance) {
      flushIssuanceArticle();

      currentIssuanceArticle = {
        ...issuance,

        contentParts: [],
      };

      continue;
    }

    // Main attached law begins after heading:
    // "في مسائل الأحوال الشخصية"
    //
    // We don't rely only on that heading;
    // article 1 following "الباب الأول" can also trigger start.
    if (
      normalized === "في مسائل الأحوال الشخصية" ||
      normalized.includes(
        "تنظيم بعض أوضاع وإجراءات التقاضي في مسائل الأحوال الشخصية",
      )
    ) {
      flushIssuanceArticle();

      continue;
    }

    if (isPartHeading(text) && normalized.includes("الباب الأول")) {
      flushIssuanceArticle();

      lawBodyStarted = true;

      currentPart = cleanHierarchyTitle(text);

      console.log(`✅ Found law body: ${currentPart}`);

      continue;
    }

    if (currentIssuanceArticle) {
      currentIssuanceArticle.contentParts.push(text);
    }

    continue;
  }

  // =======================================================
  // STOP
  // =======================================================

  if (
    currentArticle?.article_number === "79" &&
    (/^_{3,}$/u.test(text) ||
      /^ـ{3,}$/u.test(text) ||
      /^الهوامش/u.test(normalized) ||
      /^\(\s*\d+\s*\)/u.test(normalizeArabicDigits(text)))
  ) {
    flushArticle();

    lawFinished = true;

    console.log("✅ Reached source notes after article 79.");

    break;
  }

  // =======================================================
  // HIERARCHY
  // =======================================================

  if (isBookHeading(text)) {
    flushArticle();

    currentBook = cleanHierarchyTitle(text);

    currentPart = null;

    currentChapter = null;

    continue;
  }

  if (isPartHeading(text)) {
    flushArticle();

    currentPart = cleanHierarchyTitle(text);

    currentChapter = null;

    continue;
  }

  if (isChapterHeading(text)) {
    flushArticle();

    currentChapter = cleanHierarchyTitle(text);

    continue;
  }

  // =======================================================
  // ARTICLE
  // =======================================================

  const articleNumber = extractArticleNumber(text);

  if (articleNumber) {
    flushArticle();

    currentArticle = {
      article_number: articleNumber,

      book_title: currentBook,

      part_title: currentPart,

      chapter_title: currentChapter,

      contentParts: [],
    };

    continue;
  }

  // =======================================================
  // CONTENT
  // =======================================================

  if (currentArticle) {
    currentArticle.contentParts.push(text);
  }
}

flushIssuanceArticle();
flushArticle();

// =========================================================
// REMOVE SECOND DUPLICATE COPY IF PAGE CONTAINS ONE
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

const articleNumbers = dedupedArticles.map((article) => article.article_number);

// ---------------------------------------------------------
// DUPLICATES AFTER DEDUPE
// ---------------------------------------------------------

const duplicates = [
  ...new Set(
    articleNumbers.filter(
      (number, index) => articleNumbers.indexOf(number) !== index,
    ),
  ),
];

// ---------------------------------------------------------
// NUMERIC ARTICLES
// ---------------------------------------------------------

const numericArticles = dedupedArticles.filter((article) =>
  /^\d+$/u.test(article.article_number),
);

const numericSet = new Set(
  numericArticles.map((article) => Number(article.article_number)),
);

const missingNumeric = [];

for (let number = 1; number <= 79; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// ---------------------------------------------------------
// SPECIAL
// ---------------------------------------------------------

const specialArticles = dedupedArticles.filter(
  (article) => !/^\d+$/u.test(article.article_number),
);

const specialArticleNumbers = specialArticles.map(
  (article) => article.article_number,
);

const missingSpecial = EXPECTED.specialArticles.filter(
  (number) => !specialArticleNumbers.includes(number),
);

const unexpectedSpecial = specialArticleNumbers.filter(
  (number) => !EXPECTED.specialArticles.includes(number),
);

// ---------------------------------------------------------
// EMPTY
// ---------------------------------------------------------

const emptyArticles = dedupedArticles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// ORDER
// ---------------------------------------------------------

const invalidOrders = dedupedArticles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// FOOTNOTE MARKERS
// ---------------------------------------------------------

const articlesWithFootnotes = dedupedArticles
  .filter((article) => /\(\s*\d{1,2}\s*\)/u.test(article.content_ar || ""))
  .map((article) => article.article_number);

// ---------------------------------------------------------
// HIERARCHY
// ---------------------------------------------------------

const detectedBooks = [
  ...new Set(
    dedupedArticles.map((article) => article.book_title).filter(Boolean),
  ),
];

const detectedParts = [
  ...new Set(
    dedupedArticles.map((article) => article.part_title).filter(Boolean),
  ),
];

const detectedChapters = [
  ...new Set(
    dedupedArticles.map((article) => article.chapter_title).filter(Boolean),
  ),
];

// ---------------------------------------------------------
// ARTICLE 21
// ---------------------------------------------------------

const article21 = dedupedArticles.find(
  (article) => article.article_number === "21",
);

// Raw stage remains active.
// We only make sure it exists.
const specificProblems = [];

if (!article21) {
  specificProblems.push("Article 21 missing");
}

const article76Repeat = dedupedArticles.find(
  (article) => article.article_number === "76 مكررا",
);

if (!article76Repeat) {
  specificProblems.push("76 مكررا missing");
}

// ---------------------------------------------------------
// COUNTS
// ---------------------------------------------------------

const countProblems = [];

if (issuanceArticles.length !== EXPECTED.issuanceArticles) {
  countProblems.push(
    `Expected ${EXPECTED.issuanceArticles} issuance articles, got ${issuanceArticles.length}`,
  );
}

if (dedupedArticles.length !== EXPECTED.lawArticles) {
  countProblems.push(
    `Expected ${EXPECTED.lawArticles} law article records, got ${dedupedArticles.length}`,
  );
}

if (numericArticles.length !== EXPECTED.baseNumericArticles) {
  countProblems.push(
    `Expected ${EXPECTED.baseNumericArticles} base numeric articles, got ${numericArticles.length}`,
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
    title_ar:
      "قانون رقم 1 لسنة 2000 بإصدار قانون تنظيم بعض أوضاع وإجراءات التقاضي في مسائل الأحوال الشخصية",

    short_title_ar:
      "قانون تنظيم إجراءات التقاضي في مسائل الأحوال الشخصية رقم 1 لسنة 2000",

    law_number: "1",

    law_year: 2000,

    source_name: "المستشار ألبير أنسي",

    source_url: SOURCE_URL,

    source_reference: "الصفحة تعرض النص وفقاً لآخر تعديل صادر في 5 سبتمبر 2020",
  },

  source_snapshot: HTML_FILE,

  extracted_at: new Date().toISOString(),

  issuance_articles: issuanceArticles,

  total_issuance_articles: issuanceArticles.length,

  total_articles: dedupedArticles.length,

  validation: {
    first_article: dedupedArticles[0]?.article_number ?? null,

    last_article:
      dedupedArticles[dedupedArticles.length - 1]?.article_number ?? null,

    total_articles: dedupedArticles.length,

    base_numeric_articles: numericArticles.length,

    special_articles: specialArticles.length,

    special_article_numbers: specialArticleNumbers,

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    missing_numeric_articles: missingNumeric,

    missing_numeric_articles_count: missingNumeric.length,

    empty_articles: emptyArticles,

    empty_articles_count: emptyArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    issuance_articles_count: issuanceArticles.length,

    detected_books: detectedBooks,

    detected_books_count: detectedBooks.length,

    detected_parts: detectedParts,

    detected_parts_count: detectedParts.length,

    detected_chapters: detectedChapters,

    detected_chapters_count: detectedChapters.length,

    articles_with_footnote_markers: articlesWithFootnotes,

    articles_with_footnote_markers_count: articlesWithFootnotes.length,

    missing_expected_special_articles: missingSpecial,

    missing_expected_special_articles_count: missingSpecial.length,

    unexpected_special_articles: unexpectedSpecial,

    unexpected_special_articles_count: unexpectedSpecial.length,

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

console.log(`Issuance articles: ${issuanceArticles.length}`);

console.log(`Law articles: ${dedupedArticles.length}`);

console.log(`Base numeric articles: ${numericArticles.length}`);

console.log(`Special articles: ${specialArticles.length}`);

console.log(
  `Special article numbers: ${
    specialArticleNumbers.length ? specialArticleNumbers.join(", ") : "None"
  }`,
);

console.log("");

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log("");

console.log(`Books: ${detectedBooks.length}`);

for (const item of detectedBooks) {
  console.log(`- ${item}`);
}

console.log("");

console.log(`Parts: ${detectedParts.length}`);

for (const item of detectedParts) {
  console.log(`- ${item}`);
}

console.log("");

console.log(`Chapters: ${detectedChapters.length}`);

for (const item of detectedChapters) {
  console.log(`- ${item}`);
}

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
  `Missing expected special articles: ${
    missingSpecial.length ? missingSpecial.join(", ") : "None"
  }`,
);

console.log(
  `Unexpected special articles: ${
    unexpectedSpecial.length ? unexpectedSpecial.join(", ") : "None"
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
