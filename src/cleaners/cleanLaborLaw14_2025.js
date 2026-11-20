import fs from "fs";

const INPUT_FILE = "data/raw/labor-law-14-2025.json";

const OUTPUT_FILE = "data/final/labor-law-14-2025-final.json";

const EXPECTED = {
  issuanceArticles: 13,
  articles: 298,
  active: 298,
  repealed: 0,
  unconstitutional: 0,
  books: 5,
  parts: 15,
  chapters: 17,
  first: "1",
  last: "298",
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

function nullable(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = normalizeText(value);

  return cleaned || null;
}

function unique(values) {
  return [...new Set(values)];
}

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === String(number));
}

// =========================================================
// LOAD
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (
  !data?.law ||
  !Array.isArray(data.articles) ||
  !Array.isArray(data.issuance_articles)
) {
  throw new Error("Invalid JSON structure.");
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("CLEANING LABOR LAW 14/2025");

console.log("==============================");

console.log("");

// =========================================================
// CLEAN ISSUANCE ARTICLES
// =========================================================

const issuanceArticles = data.issuance_articles.map((article, index) => ({
  article_number: String(article.article_number).trim(),

  article_order: index + 1,

  title_ar: nullable(article.title_ar),

  content_ar: nullable(article.content_ar),
}));

// =========================================================
// CLEAN LAW ARTICLES
// =========================================================

const articles = data.articles.map((article, index) => ({
  article_number: String(article.article_number).trim(),

  article_order: index + 1,

  division_title: nullable(article.division_title),

  book_title: nullable(article.book_title),

  part_title: nullable(article.part_title),

  chapter_title: nullable(article.chapter_title),

  section_title: nullable(article.section_title),

  subsection_title: nullable(article.subsection_title),

  title_ar: nullable(article.title_ar),

  status: article.status,

  content_ar: nullable(article.content_ar),
}));

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

const emptyIssuance = issuanceArticles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

const invalidIssuanceOrders = issuanceArticles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// ARTICLE DUPLICATES
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

const duplicates = unique(
  articleNumbers.filter(
    (number, index) => articleNumbers.indexOf(number) !== index,
  ),
);

// =========================================================
// MISSING ARTICLES
// =========================================================

const numericSet = new Set(
  articles.map((article) => Number(article.article_number)),
);

const missingNumeric = [];

for (let number = 1; number <= EXPECTED.articles; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// =========================================================
// EMPTY ARTICLES
// =========================================================

const emptyArticles = articles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// =========================================================
// ORDER VALIDATION
// =========================================================

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// STATUS VALIDATION
// =========================================================

const validStatuses = ["active", "repealed", "unconstitutional"];

const invalidStatuses = articles
  .filter((article) => !validStatuses.includes(article.status))
  .map((article) => article.article_number);

const active = articles.filter((article) => article.status === "active");

const repealed = articles.filter((article) => article.status === "repealed");

const unconstitutional = articles.filter(
  (article) => article.status === "unconstitutional",
);

// =========================================================
// HIERARCHY COUNTS
// =========================================================

const books = unique(
  articles.map((article) => article.book_title).filter(Boolean),
);

const parts = unique(
  articles.map((article) => article.part_title).filter(Boolean),
);

const chapters = unique(
  articles.map((article) => article.chapter_title).filter(Boolean),
);

// =========================================================
// SPECIFIC HIERARCHY CHECKS
// =========================================================

const hierarchyProblems = [];

const article1 = findArticle(articles, 1);

const article16 = findArticle(articles, 16);

const article32 = findArticle(articles, 32);

const article86 = findArticle(articles, 86);

const article242 = findArticle(articles, 242);

const article275 = findArticle(articles, 275);

const article298 = findArticle(articles, 298);

if (!article1?.book_title?.startsWith("الكتاب الأول")) {
  hierarchyProblems.push("Article 1 should be in الكتاب الأول");
}

if (
  !article16?.book_title?.includes("الكتاب الثانى") &&
  !article16?.book_title?.includes("الكتاب الثاني")
) {
  hierarchyProblems.push("Article 16 should be in الكتاب الثاني");
}

if (!article32?.chapter_title?.startsWith("الفصل الأول")) {
  hierarchyProblems.push("Article 32 should begin الفصل الأول");
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

if (!article298?.part_title?.includes("العقوبات")) {
  hierarchyProblems.push("Article 298 should be in باب العقوبات");
}

// =========================================================
// DUPLICATED PAGE CONTAMINATION CHECK
// =========================================================

const contaminationProblems = [];

const contaminationMarkers = [
  "قانون العمل الجديد 2025",
  "قانون العمل رقم 14 لسنة 2025\nباسم الشعب",
  "باسم الشعب\nرئيس الجمهورية",
  "قرر مجلس النواب القانون الآتى نصه",
];

for (const article of articles) {
  for (const marker of contaminationMarkers) {
    if (article.content_ar?.includes(marker)) {
      contaminationProblems.push(
        `Article ${article.article_number} contains duplicated page content: ${marker}`,
      );
    }
  }
}

// =========================================================
// ARTICLE 298 CHECK
// =========================================================

const article298Problems = [];

if (!article298) {
  article298Problems.push("Article 298 missing");
} else {
  if (!article298.content_ar?.includes("الشخص الاعتبارى")) {
    article298Problems.push("Article 298 expected content missing");
  }

  if (article298.content_ar?.includes("قانون العمل الجديد 2025")) {
    article298Problems.push(
      "Article 298 still contains duplicated page content",
    );
  }

  if (article298.content_ar?.includes("باسم الشعب")) {
    article298Problems.push(
      "Article 298 still contains repeated issuance text",
    );
  }
}

// =========================================================
// POSSIBLE SOURCE FOOTNOTES
// =========================================================
//
// Do not remove anything automatically.
// This is detection only.
//
// =========================================================

const possibleFootnotes = articles
  .filter((article) =>
    /\(\s*[٠-٩۰-۹0-9]{1,2}\s*\)\s*$/u.test(article.content_ar || ""),
  )
  .map((article) => article.article_number);

// =========================================================
// COUNT PROBLEMS
// =========================================================

const countProblems = [];

if (issuanceArticles.length !== EXPECTED.issuanceArticles) {
  countProblems.push(
    `Expected ${EXPECTED.issuanceArticles} issuance articles, got ${issuanceArticles.length}`,
  );
}

if (articles.length !== EXPECTED.articles) {
  countProblems.push(
    `Expected ${EXPECTED.articles} articles, got ${articles.length}`,
  );
}

if (active.length !== EXPECTED.active) {
  countProblems.push(
    `Expected ${EXPECTED.active} active articles, got ${active.length}`,
  );
}

if (repealed.length !== EXPECTED.repealed) {
  countProblems.push(
    `Expected ${EXPECTED.repealed} repealed articles, got ${repealed.length}`,
  );
}

if (unconstitutional.length !== EXPECTED.unconstitutional) {
  countProblems.push(
    `Expected ${EXPECTED.unconstitutional} unconstitutional articles, got ${unconstitutional.length}`,
  );
}

if (books.length !== EXPECTED.books) {
  countProblems.push(`Expected ${EXPECTED.books} books, got ${books.length}`);
}

if (parts.length !== EXPECTED.parts) {
  countProblems.push(`Expected ${EXPECTED.parts} parts, got ${parts.length}`);
}

if (chapters.length !== EXPECTED.chapters) {
  countProblems.push(
    `Expected ${EXPECTED.chapters} chapters, got ${chapters.length}`,
  );
}

if (articles[0]?.article_number !== EXPECTED.first) {
  countProblems.push(
    `Unexpected first article: ${articles[0]?.article_number}`,
  );
}

if (articles[articles.length - 1]?.article_number !== EXPECTED.last) {
  countProblems.push(
    `Unexpected last article: ${articles[articles.length - 1]?.article_number}`,
  );
}

// =========================================================
// OUTPUT
// =========================================================

const output = {
  ...data,

  cleaned_at: new Date().toISOString(),

  cleanup_applied: true,

  total_issuance_articles: issuanceArticles.length,

  total_articles: articles.length,

  issuance_articles: issuanceArticles,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    issuance_articles_count: issuanceArticles.length,

    active_articles: active.length,

    repealed_articles: repealed.length,

    unconstitutional_articles: unconstitutional.length,

    missing_issuance_articles: missingIssuance,

    empty_issuance_articles: emptyIssuance,

    invalid_issuance_orders: invalidIssuanceOrders,

    duplicate_article_numbers: duplicates,

    missing_numeric_articles: missingNumeric,

    empty_articles: emptyArticles,

    invalid_article_orders: invalidOrders,

    invalid_statuses: invalidStatuses,

    detected_books: books,

    detected_books_count: books.length,

    detected_parts: parts,

    detected_parts_count: parts.length,

    detected_chapters: chapters,

    detected_chapters_count: chapters.length,

    possible_trailing_footnotes: possibleFootnotes,

    hierarchy_problems: hierarchyProblems,

    contamination_problems: contaminationProblems,

    article_298_problems: article298Problems,

    count_problems: countProblems,
  },

  cleanup_stats: {
    text_normalized: true,

    legal_text_changed: false,

    source_footnotes_removed: 0,
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

console.log("CLEANUP COMPLETE");

console.log("==============================");

console.log("");

console.log(`Issuance articles: ${issuanceArticles.length}`);

console.log(`Total articles: ${articles.length}`);

console.log(`Active articles: ${active.length}`);

console.log(`Repealed articles: ${repealed.length}`);

console.log(`Unconstitutional articles: ${unconstitutional.length}`);

console.log("");

console.log(`Books: ${books.length}`);

console.log(`Parts: ${parts.length}`);

console.log(`Chapters: ${chapters.length}`);

console.log("");

console.log("==============================");

console.log("VALIDATION");

console.log("==============================");

console.log("");

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log(
  `Missing issuance articles: ${
    missingIssuance.length ? missingIssuance.join(", ") : "None"
  }`,
);

console.log(
  `Empty issuance articles: ${
    emptyIssuance.length ? emptyIssuance.join(", ") : "None"
  }`,
);

console.log(
  `Invalid issuance orders: ${
    invalidIssuanceOrders.length ? invalidIssuanceOrders.join(", ") : "None"
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
  `Invalid statuses: ${
    invalidStatuses.length ? invalidStatuses.join(", ") : "None"
  }`,
);

console.log(
  `Possible trailing footnotes: ${
    possibleFootnotes.length ? possibleFootnotes.join(", ") : "None"
  }`,
);

console.log(
  `Hierarchy problems: ${
    hierarchyProblems.length ? hierarchyProblems.join(" | ") : "None"
  }`,
);

console.log(
  `Contamination problems: ${
    contaminationProblems.length ? contaminationProblems.join(" | ") : "None"
  }`,
);

console.log(
  `Article 298 problems: ${
    article298Problems.length ? article298Problems.join(" | ") : "None"
  }`,
);

console.log(
  `Count problems: ${
    countProblems.length ? countProblems.join(" | ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
