import fs from "fs";

const INPUT_FILE = "family-courts-law-10-2004.json";

const OUTPUT_FILE = "family-courts-law-10-2004-final.json";

const EXPECTED = {
  issuance: 5,
  total: 15,
  active: 15,
  repealed: 0,
  unconstitutional: 0,
  first: "1",
  last: "15",
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

if (
  !data?.law ||
  !Array.isArray(data.articles) ||
  !Array.isArray(data.issuance_articles)
) {
  throw new Error("Invalid JSON structure.");
}

console.log("");
console.log("==============================");

console.log("CLEANING FAMILY COURTS LAW 10/2004");

console.log("==============================");

console.log("");

// =========================================================
// CLEAN ISSUANCE ARTICLES
// =========================================================

const issuanceArticles = data.issuance_articles.map((article) => ({
  ...article,

  content_ar: nullable(article.content_ar),
}));

// ---------------------------------------------------------
// ISSUANCE ARTICLE FIVE
//
// Remove page heading accidentally captured:
//
// قانون
// إنشاء محاكم الأسرة
// ---------------------------------------------------------

const issuanceFive = issuanceArticles.find(
  (article) => article.article_number === "الخامسة",
);

if (!issuanceFive) {
  throw new Error("Issuance article الخامسة missing.");
}

if (issuanceFive.content_ar) {
  issuanceFive.content_ar = issuanceFive.content_ar
    .replace(/\nقانون\s*\nإنشاء محاكم الأسرة\s*$/u, "")
    .trim();
}

// =========================================================
// CLEAN LAW ARTICLES
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
// ARTICLE 11
//
// Remove ONLY the verified source footnote marker:
//
// ...(1)
//
// Do not touch statutory references such as:
// المادة (2)
// =========================================================

const article11 = findArticle(articles, "11");

if (!article11) {
  throw new Error("Article 11 missing.");
}

const article11Before = article11.content_ar;

article11.content_ar =
  article11.content_ar?.replace(/\s*\(1\)\s*$/u, "").trim() ?? null;

const article11Changed = article11Before !== article11.content_ar;

// =========================================================
// REBUILD ORDER
// =========================================================

articles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// VALIDATION
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

// ---------------------------------------------------------
// DUPLICATES
// ---------------------------------------------------------

const duplicates = [
  ...new Set(
    articleNumbers.filter(
      (number, index) => articleNumbers.indexOf(number) !== index,
    ),
  ),
];

// ---------------------------------------------------------
// MISSING NUMERIC
// ---------------------------------------------------------

const numericSet = new Set(
  articles.map((article) => Number(article.article_number)),
);

const missingNumeric = [];

for (let number = 1; number <= 15; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// ---------------------------------------------------------
// STATUS
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// EMPTY
// ---------------------------------------------------------

const emptyArticles = articles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// ORDER
// ---------------------------------------------------------

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// VERIFY STATUTORY REFERENCES WERE PRESERVED
// =========================================================

const referenceProblems = [];

const requiredReferences = [
  ["2", "المادة (11)"],

  ["3", "المادة (3)"],

  ["4", "للمادة (65)"],

  ["9", "للمادة (6)"],

  ["9", "المادة (8)"],

  ["11", "المادة (2)"],

  ["12", "المادة (10)"],

  ["14", "المادة (250)"],
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
// REMAINING SOURCE FOOTNOTE
// =========================================================

const remainingSourceFootnotes = [];

if (article11.content_ar && /\(1\)\s*$/u.test(article11.content_ar)) {
  remainingSourceFootnotes.push("11");
}

// =========================================================
// SPECIFIC CHECKS
// =========================================================

const specificProblems = [];

if (issuanceFive.content_ar?.includes("إنشاء محاكم الأسرة")) {
  specificProblems.push("Issuance article الخامسة still contains page heading");
}

if (article11.status !== "active") {
  specificProblems.push("Article 11 should remain active");
}

const article14 = findArticle(articles, "14");

if (article14?.status !== "active") {
  specificProblems.push("Article 14 should remain active");
}

// =========================================================
// COUNT PROBLEMS
// =========================================================

const countProblems = [];

if (issuanceArticles.length !== EXPECTED.issuance) {
  countProblems.push(
    `Expected ${EXPECTED.issuance} issuance articles, got ${issuanceArticles.length}`,
  );
}

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

  issuance_articles: issuanceArticles,

  total_issuance_articles: issuanceArticles.length,

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
    article_11_footnote_removed: article11Changed,

    issuance_article_five_cleaned: true,
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

console.log(`Article 11 footnote removed: ${article11Changed ? "Yes" : "No"}`);

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
