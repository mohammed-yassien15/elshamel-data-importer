import fs from "fs";

const INPUT_FILE = "data/raw/personal-status-law-25-1920.json";

const OUTPUT_FILE = "data/final/personal-status-law-25-1920-final.json";

const EXPECTED = {
  total: 13,
  active: 10,
  repealed: 3,
  first: "1",
  last: "13",
  repealedArticles: ["3", "7", "12"],
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

function normalizeNullableText(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const cleaned = normalizeText(value);

  return cleaned || null;
}

function removeKnownArticle1Footnotes(text) {
  if (!text) {
    return text;
  }

  return (
    text
      // Known source footnote marker in:
      // "... مشوب (٢) بإساءة ..."
      .replace(/\s*\(٢\)\s*/gu, " ")

      // Known source footnote marker at end:
      // "... النفقة الأخرى. (١)"
      .replace(/\s*\(١\)\s*$/gu, "")

      .replace(/[ \t]+/g, " ")
      .trim()
  );
}

// =========================================================
// LOAD
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!data?.law) {
  throw new Error("Invalid JSON: law metadata missing.");
}

if (!Array.isArray(data.articles)) {
  throw new Error("Invalid JSON: articles array missing.");
}

// =========================================================
// CLEAN
// =========================================================

const cleanupStats = {
  article1FootnotesRemoved: false,
  changedArticles: [],
};

const articles = data.articles.map((article) => {
  const cleaned = {
    ...article,
  };

  cleaned.article_number = String(cleaned.article_number).trim();

  cleaned.article_order = Number(cleaned.article_order);

  cleaned.division_title = normalizeNullableText(cleaned.division_title);

  cleaned.book_title = normalizeNullableText(cleaned.book_title);

  cleaned.part_title = normalizeNullableText(cleaned.part_title);

  cleaned.chapter_title = normalizeNullableText(cleaned.chapter_title);

  cleaned.section_title = normalizeNullableText(cleaned.section_title);

  cleaned.subsection_title = normalizeNullableText(cleaned.subsection_title);

  cleaned.title_ar = normalizeNullableText(cleaned.title_ar);

  cleaned.content_ar = normalizeNullableText(cleaned.content_ar);

  // ===================================================
  // ARTICLE 1
  //
  // Remove only verified source footnote markers.
  // ===================================================

  if (cleaned.article_number === "1" && cleaned.content_ar) {
    const before = cleaned.content_ar;

    cleaned.content_ar = removeKnownArticle1Footnotes(cleaned.content_ar);

    if (before !== cleaned.content_ar) {
      cleanupStats.article1FootnotesRemoved = true;

      cleanupStats.changedArticles.push("1");
    }
  }

  // ===================================================
  // REPEALED ARTICLES
  // ===================================================

  if (cleaned.status === "repealed") {
    cleaned.content_ar = null;
  }

  return cleaned;
});

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
// STATUS COUNTS
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

const emptyActive = articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID STATUS
// ---------------------------------------------------------

const invalidStatuses = articles
  .filter((article) => !["active", "repealed"].includes(article.status))
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID ORDER
// ---------------------------------------------------------

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// NUMERIC GAPS
// ---------------------------------------------------------

const numericNumbers = articles
  .map((article) => article.article_number)
  .filter((number) => /^\d+$/u.test(number))
  .map(Number);

const maxNumeric = numericNumbers.length ? Math.max(...numericNumbers) : 0;

const numericSet = new Set(numericNumbers);

const missingNumeric = [];

for (let number = 1; number <= maxNumeric; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// ---------------------------------------------------------
// REPEALED CONTENT
// ---------------------------------------------------------

const repealedWithContent = articles
  .filter(
    (article) => article.status === "repealed" && article.content_ar !== null,
  )
  .map((article) => article.article_number);

// ---------------------------------------------------------
// FOOTNOTE MARKERS STILL PRESENT
// ---------------------------------------------------------

const remainingFootnoteMarkers = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return /\(١\)/u.test(content) || /\(٢\)/u.test(content);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// HIERARCHY LEAK
// ---------------------------------------------------------

const suspiciousHierarchy = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /(?:^|\n)الباب\s+/u.test(content) || /(?:^|\n)القسم\s+/u.test(content)
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// REPEALED TEXT LEAK
// ---------------------------------------------------------

const suspiciousRepealedText = articles
  .filter(
    (article) =>
      article.status !== "repealed" &&
      /ملغاة|ملغى/u.test(article.content_ar || ""),
  )
  .map((article) => article.article_number);

// =========================================================
// EXPECTED REPEALED
// =========================================================

const actualRepealed = repealedArticles.map(
  (article) => article.article_number,
);

const missingExpectedRepealed = EXPECTED.repealedArticles.filter(
  (number) => !actualRepealed.includes(number),
);

const unexpectedRepealed = actualRepealed.filter(
  (number) => !EXPECTED.repealedArticles.includes(number),
);

// =========================================================
// COUNT PROBLEMS
// =========================================================

const countProblems = [];

if (articles.length !== EXPECTED.total) {
  countProblems.push(
    `Expected ${EXPECTED.total} total, got ${articles.length}`,
  );
}

if (activeArticles.length !== EXPECTED.active) {
  countProblems.push(
    `Expected ${EXPECTED.active} active, got ${activeArticles.length}`,
  );
}

if (repealedArticles.length !== EXPECTED.repealed) {
  countProblems.push(
    `Expected ${EXPECTED.repealed} repealed, got ${repealedArticles.length}`,
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
// SPECIFIC ARTICLE CHECKS
// =========================================================

const article1 = articles.find((article) => article.article_number === "1");

const article4 = articles.find((article) => article.article_number === "4");

const article7 = articles.find((article) => article.article_number === "7");

const article12 = articles.find((article) => article.article_number === "12");

const specificProblems = [];

if (!article1) {
  specificProblems.push("Article 1 missing");
} else {
  if (/\(١\)|\(٢\)/u.test(article1.content_ar || "")) {
    specificProblems.push("Article 1 still contains footnote markers");
  }

  if (article1.part_title !== "الباب الأول: في النفقة") {
    specificProblems.push("Article 1 part hierarchy incorrect");
  }

  if (article1.section_title !== "القسم الأول: في النفقة والعدة") {
    specificProblems.push("Article 1 section hierarchy incorrect");
  }
}

if (article4?.section_title !== "القسم الثاني: في العجز عن النفقة") {
  specificProblems.push("Article 4 section hierarchy incorrect");
}

if (article7?.status !== "repealed") {
  specificProblems.push("Article 7 should be repealed");
}

if (article12?.status !== "repealed") {
  specificProblems.push("Article 12 should be repealed");
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

    active_articles: activeArticles.length,

    repealed_articles: repealedArticles.length,

    repealed_article_numbers: actualRepealed,

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    empty_active_articles: emptyActive,

    empty_active_articles_count: emptyActive.length,

    max_numeric_article: maxNumeric,

    missing_numeric_articles: missingNumeric,

    missing_numeric_articles_count: missingNumeric.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    invalid_statuses: invalidStatuses,

    invalid_statuses_count: invalidStatuses.length,

    repealed_with_content: repealedWithContent,

    repealed_with_content_count: repealedWithContent.length,

    remaining_footnote_markers: remainingFootnoteMarkers,

    remaining_footnote_markers_count: remainingFootnoteMarkers.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    suspicious_repealed_text: suspiciousRepealedText,

    suspicious_repealed_text_count: suspiciousRepealedText.length,

    missing_expected_repealed_articles: missingExpectedRepealed,

    missing_expected_repealed_articles_count: missingExpectedRepealed.length,

    unexpected_repealed_articles: unexpectedRepealed,

    unexpected_repealed_articles_count: unexpectedRepealed.length,

    specific_article_problems: specificProblems,

    specific_article_problems_count: specificProblems.length,

    count_problems: countProblems,

    count_problems_count: countProblems.length,
  },

  cleanup_stats: {
    article_1_footnotes_removed: cleanupStats.article1FootnotesRemoved,

    changed_articles: cleanupStats.changedArticles,
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

console.log(`Active articles: ${activeArticles.length}`);

console.log(`Repealed articles: ${repealedArticles.length}`);

console.log("");

console.log(
  `Article 1 footnotes removed: ${
    cleanupStats.article1FootnotesRemoved ? "Yes" : "No"
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
  `Repealed articles: ${
    actualRepealed.length ? actualRepealed.join(", ") : "None"
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
  `Empty active articles: ${
    emptyActive.length ? emptyActive.join(", ") : "None"
  }`,
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
  `Repealed articles with content: ${
    repealedWithContent.length ? repealedWithContent.join(", ") : "None"
  }`,
);

console.log(
  `Remaining footnote markers: ${
    remainingFootnoteMarkers.length
      ? remainingFootnoteMarkers.join(", ")
      : "None"
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
  `Missing expected repealed articles: ${
    missingExpectedRepealed.length ? missingExpectedRepealed.join(", ") : "None"
  }`,
);

console.log(
  `Unexpected repealed articles: ${
    unexpectedRepealed.length ? unexpectedRepealed.join(", ") : "None"
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
