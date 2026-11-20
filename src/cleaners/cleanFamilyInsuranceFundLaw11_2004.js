import fs from "fs";

const INPUT_FILE = "data/raw/family-insurance-fund-law-11-2004.json";

const OUTPUT_FILE = "data/final/family-insurance-fund-law-11-2004-final.json";

const EXPECTED = {
  total: 6,
  active: 6,
  repealed: 0,
  unconstitutional: 0,
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

function nullable(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = normalizeText(value);

  return cleaned || null;
}

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === number);
}

// =========================================================
// LOAD
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!data?.law || !Array.isArray(data.articles)) {
  throw new Error("Invalid JSON structure.");
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("CLEANING FAMILY INSURANCE FUND LAW 11/2004");

console.log("==============================");

console.log("");

// =========================================================
// NORMALIZE ARTICLES
// =========================================================

const articles = data.articles.map((article) => ({
  ...article,

  article_number: normalizeText(article.article_number),

  article_order: Number(article.article_order),

  division_title: nullable(article.division_title),

  book_title: nullable(article.book_title),

  part_title: nullable(article.part_title),

  chapter_title: nullable(article.chapter_title),

  section_title: nullable(article.section_title),

  subsection_title: nullable(article.subsection_title),

  title_ar: nullable(article.title_ar),

  content_ar: nullable(article.content_ar),
}));

// =========================================================
// REMOVE VERIFIED SOURCE FOOTNOTES
// =========================================================

const footnoteArticlesChanged = [];

for (const number of ["2", "3"]) {
  const article = findArticle(articles, number);

  if (!article) {
    throw new Error(`Article ${number} missing.`);
  }

  const before = article.content_ar;

  article.content_ar =
    article.content_ar?.replace(/\s*\([١1]\)\s*$/u, "").trim() ?? null;

  if (before !== article.content_ar) {
    footnoteArticlesChanged.push(number);
  }
}

// =========================================================
// REBUILD ORDER
// =========================================================

articles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// DUPLICATES
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

const duplicates = [
  ...new Set(
    articleNumbers.filter(
      (number, index) => articleNumbers.indexOf(number) !== index,
    ),
  ),
];

// =========================================================
// MISSING NUMERIC
// =========================================================

const numericSet = new Set(
  articles.map((article) => Number(article.article_number)),
);

const missingNumeric = [];

for (let number = 1; number <= 6; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// =========================================================
// STATUS
// =========================================================

const active = articles.filter((article) => article.status === "active");

const repealed = articles.filter((article) => article.status === "repealed");

const unconstitutional = articles.filter(
  (article) => article.status === "unconstitutional",
);

const invalidStatuses = articles
  .filter(
    (article) =>
      !["active", "repealed", "unconstitutional"].includes(article.status),
  )
  .map((article) => article.article_number);

// =========================================================
// EMPTY
// =========================================================

const emptyArticles = articles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// =========================================================
// ORDER
// =========================================================

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// REMAINING SOURCE FOOTNOTES
// =========================================================

const remainingSourceFootnotes = articles
  .filter((article) => /\(\s*[١1]\s*\)\s*$/u.test(article.content_ar || ""))
  .map((article) => article.article_number);

// =========================================================
// VERIFY IMPORTANT LEGAL REFERENCES
// =========================================================

const referenceProblems = [];

const requiredReferences = [
  ["2", "المادة (٧١)"],

  ["3", "المادة (٧٢)"],

  ["3", "المواد (٧٣، ٧٤، ٧٥)"],

  ["3", "المادة (٢٩٣)"],

  ["5", "المادتين (١١، ١٢)"],
];

for (const [number, reference] of requiredReferences) {
  const article = findArticle(articles, number);

  if (!article?.content_ar?.includes(reference)) {
    referenceProblems.push(
      `Article ${number} missing statutory reference ${reference}`,
    );
  }
}

// =========================================================
// SPECIFIC CHECKS
// =========================================================

const specificProblems = [];

const article2 = findArticle(articles, "2");

const article3 = findArticle(articles, "3");

const article6 = findArticle(articles, "6");

if (article2?.status !== "active") {
  specificProblems.push("Article 2 should remain active");
}

if (article3?.status !== "active") {
  specificProblems.push("Article 3 should remain active");
}

if (!article6?.content_ar?.includes("حسني مبارك")) {
  specificProblems.push("Article 6 presidential signature missing");
}

// =========================================================
// COUNTS
// =========================================================

const countProblems = [];

if (articles.length !== EXPECTED.total) {
  countProblems.push(
    `Expected ${EXPECTED.total} articles, got ${articles.length}`,
  );
}

if (active.length !== EXPECTED.active) {
  countProblems.push(
    `Expected ${EXPECTED.active} active, got ${active.length}`,
  );
}

if (repealed.length !== EXPECTED.repealed) {
  countProblems.push(
    `Expected ${EXPECTED.repealed} repealed, got ${repealed.length}`,
  );
}

if (unconstitutional.length !== EXPECTED.unconstitutional) {
  countProblems.push(
    `Expected ${EXPECTED.unconstitutional} unconstitutional, got ${unconstitutional.length}`,
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

  total_articles: articles.length,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    active_articles: active.length,

    repealed_articles: repealed.length,

    unconstitutional_articles: unconstitutional.length,

    duplicate_article_numbers: duplicates,

    missing_numeric_articles: missingNumeric,

    empty_articles: emptyArticles,

    invalid_article_orders: invalidOrders,

    invalid_statuses: invalidStatuses,

    remaining_source_footnotes: remainingSourceFootnotes,

    statutory_reference_problems: referenceProblems,

    specific_article_problems: specificProblems,

    count_problems: countProblems,
  },

  cleanup_stats: {
    footnote_articles_changed: footnoteArticlesChanged,
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

console.log(`Total articles: ${articles.length}`);

console.log(`Active articles: ${active.length}`);

console.log(`Repealed articles: ${repealed.length}`);

console.log(`Unconstitutional articles: ${unconstitutional.length}`);

console.log(
  `Footnote articles changed: ${
    footnoteArticlesChanged.length ? footnoteArticlesChanged.join(", ") : "None"
  }`,
);

console.log("");

console.log("==============================");

console.log("VALIDATION");

console.log("==============================");

console.log("");

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

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
  `Remaining source footnotes: ${
    remainingSourceFootnotes.length
      ? remainingSourceFootnotes.join(", ")
      : "None"
  }`,
);

console.log(
  `Statutory reference problems: ${
    referenceProblems.length ? referenceProblems.join(" | ") : "None"
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
