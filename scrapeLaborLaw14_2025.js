import fs from "fs";
import * as cheerio from "cheerio";

const HTML_FILE = "labor-law-14-2025.html";

const OUTPUT_FILE = "labor-law-14-2025.json";

const SOURCE_URL = "https://manshurat.org/content/qnwn-lml-ljdyd-2025";

const EXPECTED = {
  issuanceArticles: 13,
  lawArticles: 298,
  first: "1",
  last: "298",
  books: 5,
};

// =========================================================
// BASIC HELPERS
// =========================================================

function normalizeText(text = "") {
  return String(text)
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeArabicDiacritics(text = "") {
  return String(text).replace(/[\u064B-\u065F\u0670]/g, "");
}

function removeInvisibleChars(text = "") {
  return String(text).replace(
    /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g,
    "",
  );
}

function normalizeArabicDigits(text = "") {
  return String(text).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩";

    const persian = "۰۱۲۳۴۵۶۷۸۹";

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

function normalizeAlef(text = "") {
  return String(text).replace(/[أإآ]/g, "ا");
}

function normalizeYa(text = "") {
  return String(text).replace(/ى/g, "ي");
}

function normalizeForDetection(text = "") {
  return normalizeYa(
    normalizeAlef(
      removeArabicDiacritics(
        normalizeArabicDigits(removeInvisibleChars(normalizeText(text))),
      ),
    ),
  )
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// =========================================================
// ORDINAL NAMES
// =========================================================

const ordinalMap = new Map([
  ["الاولي", "1"],
  ["الثانيه", "2"],
  ["الثالثه", "3"],
  ["الرابعه", "4"],
  ["الخامسه", "5"],
  ["السادسه", "6"],
  ["السابعه", "7"],
  ["الثامنه", "8"],
  ["التاسعه", "9"],
  ["العاشره", "10"],
  ["الحاديه عشره", "11"],
  ["الثانيه عشره", "12"],
  ["الثالثه عشره", "13"],
]);

function normalizeOrdinal(text = "") {
  return normalizeForDetection(text).replace(/ة/g, "ه").trim();
}

// =========================================================
// ISSUANCE ARTICLE DETECTION
// =========================================================

function extractIssuanceNumber(text = "") {
  let normalized = normalizeOrdinal(text);

  normalized = normalized
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .trim();

  const match = normalized.match(/^الماده\s+(.+?)\s*:?\s*$/u);

  if (!match) {
    return null;
  }

  const name = match[1].trim();

  return ordinalMap.get(name) ?? null;
}

// =========================================================
// LAW ARTICLE DETECTION
// =========================================================

function extractLawArticleNumber(text = "") {
  const normalized = normalizeForDetection(text);

  // Examples:
  // مادة (1)
  // مادة (١)
  // مادة (۱)
  // المادة (298)
  let match = normalized.match(/^(?:مادة|المادة)\s*\(\s*(\d+)\s*\)\s*:?\s*$/u);

  if (match) {
    return match[1];
  }

  // Examples:
  // مادة 1
  // المادة 298
  match = normalized.match(/^(?:مادة|المادة)\s+(\d+)\s*:?\s*$/u);

  if (match) {
    return match[1];
  }

  return null;
}

// =========================================================
// HIERARCHY DETECTION
// =========================================================

function isBookHeading(text = "") {
  return /^الكتاب\s+/u.test(normalizeForDetection(text));
}

function isPartHeading(text = "") {
  return /^الباب\s+/u.test(normalizeForDetection(text));
}

function isChapterHeading(text = "") {
  let value = normalizeForDetection(text);

  value = value
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .trim();

  return /^الفصل\s+/u.test(value);
}

function cleanHierarchyMarker(text = "") {
  return normalizeText(text)
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .trim();
}

// =========================================================
// POSSIBLE SOURCE FOOTNOTE DETECTION
// =========================================================

function hasPossibleTrailingFootnote(text = "") {
  if (!text) {
    return false;
  }

  const normalized = normalizeArabicDigits(text);

  return /\(\s*\d{1,2}\s*\)\s*$/u.test(normalized);
}

// =========================================================
// LOAD HTML
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING LABOR LAW 14/2025");

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
// BUILD DOM BLOCKS
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

// =========================================================
// DEBUG HEADINGS
// =========================================================

const issuanceLikeBlocks = uniqueBlocks.filter((block) =>
  extractIssuanceNumber(block),
);

console.log("");
console.log("ISSUANCE HEADING TEST");

for (const block of issuanceLikeBlocks) {
  console.log(block, "=>", extractIssuanceNumber(block));
}

const lawArticleLikeBlocks = uniqueBlocks.filter((block) =>
  extractLawArticleNumber(block),
);

console.log("");
console.log(`Detected numbered law headings: ${lawArticleLikeBlocks.length}`);

console.log("First detected headings:", lawArticleLikeBlocks.slice(0, 10));

console.log("Last detected headings:", lawArticleLikeBlocks.slice(-10));

// =========================================================
// STATE
// =========================================================

const issuanceArticles = [];

const articles = [];

let currentIssuanceArticle = null;

let currentArticle = null;

let lawBodyStarted = false;

let lawFinished = false;

let currentBook = null;

let currentPart = null;

let currentChapter = null;

let pendingHierarchy = null;

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

    status: "active",

    content_ar: normalizeText(currentArticle.contentParts.join("\n")) || null,
  });

  currentArticle = null;
}

// =========================================================
// APPLY HIERARCHY TITLE
// =========================================================

function setHierarchy(type, marker, title = null) {
  const finalValue = title ? `${marker} – ${title}` : marker;

  if (type === "book") {
    currentBook = finalValue;

    currentPart = null;

    currentChapter = null;
  }

  if (type === "part") {
    currentPart = finalValue;

    currentChapter = null;
  }

  if (type === "chapter") {
    currentChapter = finalValue;
  }
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
  // BEFORE ATTACHED LAW
  // =======================================================

  if (!lawBodyStarted) {
    const issuanceNumber = extractIssuanceNumber(text);

    if (issuanceNumber) {
      flushIssuanceArticle();

      currentIssuanceArticle = {
        article_number: issuanceNumber,

        article_order: Number(issuanceNumber),

        title_ar: `المادة ${text
          .replace(/[()]/g, "")
          .replace(/المادة/u, "")
          .trim()}`,

        contentParts: [],
      };

      continue;
    }

    if (normalizeForDetection(text) === "قانون العمل") {
      flushIssuanceArticle();

      console.log("");
      console.log("✅ Found attached law title: قانون العمل");

      continue;
    }

    if (isBookHeading(text)) {
      flushIssuanceArticle();

      lawBodyStarted = true;

      pendingHierarchy = {
        type: "book",

        marker: cleanHierarchyMarker(text),
      };

      console.log(`✅ Found law body: ${text}`);

      continue;
    }

    if (currentIssuanceArticle) {
      currentIssuanceArticle.contentParts.push(text);
    }

    continue;
  }

  // =======================================================
  // STOP AFTER ARTICLE 298
  //
  // Manshurat contains a duplicated copy of the whole law
  // later in the DOM.
  //
  // We must stop as soon as the repeated page begins,
  // otherwise the repeated law gets appended to Article 298.
  // =======================================================

  if (currentArticle?.article_number === "298") {
    const nextArticle = extractLawArticleNumber(text);

    const repeatedPageStart =
      normalized === "قانون العمل الجديد 2025" ||
      normalized === "قانون العمل رقم 14 لسنه 2025" ||
      normalized === "قانون العمل رقم 14 لسنة 2025" ||
      normalized === "باسم الشعب" ||
      normalized === "رئيس الجمهوريه" ||
      normalized === "رئيس الجمهورية";

    const looksLikeSiteFooter =
      normalized === "عن الموقع" ||
      normalized === "اتصل بنا" ||
      normalized.includes("شارك في تطوير") ||
      normalized.includes("فريق العمل");

    if (
      repeatedPageStart ||
      looksLikeSiteFooter ||
      (nextArticle && Number(nextArticle) > 298)
    ) {
      flushArticle();

      lawFinished = true;

      console.log(
        "✅ Reached end of article 298 before duplicated page content.",
      );

      break;
    }
  }

  if (currentArticle?.article_number === "298") {
    const nextArticle = extractLawArticleNumber(text);

    const looksLikeSiteFooter =
      normalized === "عن الموقع" ||
      normalized === "اتصل بنا" ||
      normalized.includes("شارك في تطوير") ||
      normalized.includes("فريق العمل");

    if (looksLikeSiteFooter || (nextArticle && Number(nextArticle) > 298)) {
      flushArticle();

      lawFinished = true;

      console.log("✅ Reached content after article 298.");

      break;
    }
  }

  // =======================================================
  // HIERARCHY MARKERS
  // =======================================================

  if (isBookHeading(text)) {
    flushArticle();

    if (pendingHierarchy) {
      setHierarchy(pendingHierarchy.type, pendingHierarchy.marker);
    }

    pendingHierarchy = {
      type: "book",

      marker: cleanHierarchyMarker(text),
    };

    continue;
  }

  if (isPartHeading(text)) {
    flushArticle();

    if (pendingHierarchy) {
      setHierarchy(pendingHierarchy.type, pendingHierarchy.marker);
    }

    pendingHierarchy = {
      type: "part",

      marker: cleanHierarchyMarker(text),
    };

    continue;
  }

  if (isChapterHeading(text)) {
    flushArticle();

    if (pendingHierarchy) {
      setHierarchy(pendingHierarchy.type, pendingHierarchy.marker);
    }

    pendingHierarchy = {
      type: "chapter",

      marker: cleanHierarchyMarker(text),
    };

    continue;
  }

  // =======================================================
  // ARTICLE HEADING
  // =======================================================

  const articleNumber = extractLawArticleNumber(text);

  if (articleNumber) {
    flushArticle();

    if (pendingHierarchy) {
      setHierarchy(pendingHierarchy.type, pendingHierarchy.marker);

      pendingHierarchy = null;
    }

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
  // DESCRIPTIVE HIERARCHY TITLE
  // =======================================================

  if (pendingHierarchy) {
    setHierarchy(pendingHierarchy.type, pendingHierarchy.marker, text);

    pendingHierarchy = null;

    continue;
  }

  // =======================================================
  // ARTICLE CONTENT
  // =======================================================

  if (currentArticle) {
    currentArticle.contentParts.push(text);
  }
}

// =========================================================
// FINAL FLUSH
// =========================================================

flushIssuanceArticle();
flushArticle();

// =========================================================
// RAW DUPLICATES
// =========================================================

const rawArticleNumbers = articles.map((article) => article.article_number);

const duplicates = [
  ...new Set(
    rawArticleNumbers.filter(
      (number, index) => rawArticleNumbers.indexOf(number) !== index,
    ),
  ),
];

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
// MISSING NUMERIC ARTICLES
// =========================================================

const numericSet = new Set(
  dedupedArticles
    .filter((article) => /^\d+$/u.test(article.article_number))
    .map((article) => Number(article.article_number)),
);

const missingNumeric = [];

for (let number = 1; number <= EXPECTED.lawArticles; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// =========================================================
// ORDERS
// =========================================================

const invalidOrders = dedupedArticles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// EMPTY ARTICLES
// =========================================================

const emptyArticles = dedupedArticles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// =========================================================
// POSSIBLE FOOTNOTES
// =========================================================

const articlesWithPossibleFootnotes = dedupedArticles
  .filter((article) => hasPossibleTrailingFootnote(article.content_ar))
  .map((article) => article.article_number);

// =========================================================
// DETECTED HIERARCHY
// =========================================================

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

// =========================================================
// ISSUANCE VALIDATION
// =========================================================

const issuanceNumbers = issuanceArticles.map((article) =>
  Number(article.article_number),
);

const missingIssuance = [];

for (let number = 1; number <= EXPECTED.issuanceArticles; number++) {
  if (!issuanceNumbers.includes(number)) {
    missingIssuance.push(number);
  }
}

// =========================================================
// FIND ARTICLE
// =========================================================

function findArticle(number) {
  return dedupedArticles.find(
    (article) => article.article_number === String(number),
  );
}

// =========================================================
// HIERARCHY CHECKS
// =========================================================

const hierarchyProblems = [];

const article1 = findArticle(1);

const article16 = findArticle(16);

const article86 = findArticle(86);

const article242 = findArticle(242);

const article275 = findArticle(275);

if (!article1?.book_title?.startsWith("الكتاب الأول")) {
  hierarchyProblems.push("Article 1 should be in الكتاب الأول");
}

if (
  !article16?.book_title?.includes("الكتاب الثانى") &&
  !article16?.book_title?.includes("الكتاب الثاني")
) {
  hierarchyProblems.push("Article 16 should be in الكتاب الثاني");
}

if (!article86?.book_title?.startsWith("الكتاب الثالث")) {
  hierarchyProblems.push("Article 86 should be in الكتاب الثالث");
}

if (!article242?.book_title?.startsWith("الكتاب الرابع")) {
  hierarchyProblems.push("Article 242 should be in الكتاب الرابع");
}

if (!article275?.book_title?.startsWith("الكتاب الخامس")) {
  hierarchyProblems.push("Article 275 should be in الكتاب الخامس");
}

// =========================================================
// COUNT PROBLEMS
// =========================================================

const countProblems = [];

if (issuanceArticles.length !== EXPECTED.issuanceArticles) {
  countProblems.push(
    `Expected ${EXPECTED.issuanceArticles} issuance articles, got ${issuanceArticles.length}`,
  );
}

if (dedupedArticles.length !== EXPECTED.lawArticles) {
  countProblems.push(
    `Expected ${EXPECTED.lawArticles} law articles, got ${dedupedArticles.length}`,
  );
}

if (detectedBooks.length !== EXPECTED.books) {
  countProblems.push(
    `Expected ${EXPECTED.books} books, got ${detectedBooks.length}`,
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
    title_ar: "العمل",
  },

  law: {
    title_ar: "قانون رقم 14 لسنة 2025 بإصدار قانون العمل",

    short_title_ar: "قانون العمل رقم 14 لسنة 2025",

    law_number: "14",

    law_year: 2025,

    source_name: "منشورات قانونية",

    source_url: SOURCE_URL,

    source_reference: "النص المنشور لقانون العمل رقم 14 لسنة 2025",
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

    issuance_articles_count: issuanceArticles.length,

    missing_issuance_articles: missingIssuance,

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    missing_numeric_articles: missingNumeric,

    missing_numeric_articles_count: missingNumeric.length,

    empty_articles: emptyArticles,

    empty_articles_count: emptyArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    detected_books: detectedBooks,

    detected_books_count: detectedBooks.length,

    detected_parts: detectedParts,

    detected_parts_count: detectedParts.length,

    detected_chapters: detectedChapters,

    detected_chapters_count: detectedChapters.length,

    articles_with_possible_trailing_footnotes: articlesWithPossibleFootnotes,

    articles_with_possible_trailing_footnotes_count:
      articlesWithPossibleFootnotes.length,

    hierarchy_problems: hierarchyProblems,

    hierarchy_problems_count: hierarchyProblems.length,

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

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log("");

console.log(`Books: ${detectedBooks.length}`);

for (const book of detectedBooks) {
  console.log(`- ${book}`);
}

console.log("");

console.log(`Parts: ${detectedParts.length}`);

console.log(`Chapters: ${detectedChapters.length}`);

console.log("");

console.log(
  `Missing issuance articles: ${
    missingIssuance.length ? missingIssuance.join(", ") : "None"
  }`,
);

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
  `Possible trailing footnotes: ${
    articlesWithPossibleFootnotes.length
      ? articlesWithPossibleFootnotes.join(", ")
      : "None"
  }`,
);

console.log(
  `Hierarchy problems: ${
    hierarchyProblems.length ? hierarchyProblems.join(" | ") : "None"
  }`,
);

console.log(
  `Count problems: ${
    countProblems.length ? countProblems.join(" | ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
