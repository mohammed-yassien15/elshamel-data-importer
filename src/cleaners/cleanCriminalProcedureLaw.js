import fs from "fs";

const INPUT_FILE = "egyptian-criminal-procedure-law.json";

const OUTPUT_FILE = "egyptian-criminal-procedure-law-final.json";

// =========================================================
// EXPECTED FINAL VALUES
// =========================================================

const EXPECTED = {
  total: 585,
  active: 486,
  repealed: 99,
  first: "1",
  last: "560",
  specialCount: 25,
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

// =========================================================
// LOAD FILE
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
// CLEANUP STATS
// =========================================================

const stats = {
  constitutionalStatusFixed: [],
  repealedNormalized: [],
  whitespaceNormalized: [],
};

// =========================================================
// CLEAN ARTICLES
// =========================================================

const articles = data.articles.map((article) => {
  const cleaned = {
    ...article,
  };

  // ---------------------------------------------------
  // NORMALIZE FIELDS
  // ---------------------------------------------------

  cleaned.article_number = normalizeText(cleaned.article_number);

  cleaned.article_order = Number(cleaned.article_order);

  cleaned.division_title = normalizeNullableText(cleaned.division_title);

  cleaned.book_title = normalizeNullableText(cleaned.book_title);

  cleaned.part_title = normalizeNullableText(cleaned.part_title);

  cleaned.chapter_title = normalizeNullableText(cleaned.chapter_title);

  cleaned.section_title = normalizeNullableText(cleaned.section_title);

  cleaned.subsection_title = normalizeNullableText(cleaned.subsection_title);

  cleaned.title_ar = normalizeNullableText(cleaned.title_ar);

  const originalContent = cleaned.content_ar;

  cleaned.content_ar = normalizeNullableText(cleaned.content_ar);

  if (originalContent !== cleaned.content_ar) {
    stats.whitespaceNormalized.push(cleaned.article_number);
  }

  // ---------------------------------------------------
  // STATUS
  // ---------------------------------------------------

  cleaned.status = cleaned.status || "active";

  // ===================================================
  // ARTICLE 47
  //
  // Source contains only:
  // "مقضي بعدم دستوريتها"
  //
  // This is an editorial/source status note,
  // not statutory article text.
  //
  // Current DB schema supports:
  // active | repealed
  //
  // So we represent it as repealed/null.
  // ===================================================

  if (
    cleaned.article_number === "47" &&
    cleaned.content_ar &&
    /^مقضي بعدم دستوريتها[.،؛:]?$/u.test(cleaned.content_ar)
  ) {
    cleaned.status = "repealed";

    cleaned.content_ar = null;

    stats.constitutionalStatusFixed.push(cleaned.article_number);
  }

  // ===================================================
  // NORMALIZE REPEALED ARTICLES
  // ===================================================

  if (cleaned.status === "repealed") {
    if (cleaned.content_ar !== null) {
      cleaned.content_ar = null;

      stats.repealedNormalized.push(cleaned.article_number);
    }
  }

  return cleaned;
});

// =========================================================
// RECALCULATE ARTICLE ORDER
// =========================================================

articles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// VALIDATION
// =========================================================

// ---------------------------------------------------------
// DUPLICATES
// ---------------------------------------------------------

const seen = new Set();

const duplicates = [];

for (const article of articles) {
  if (seen.has(article.article_number)) {
    duplicates.push(article.article_number);
  }

  seen.add(article.article_number);
}

const uniqueDuplicates = [...new Set(duplicates)];

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
// INVALID STATUS
// ---------------------------------------------------------

const invalidStatuses = articles
  .filter((article) => !["active", "repealed"].includes(article.status))
  .map((article) => article.article_number);

// ---------------------------------------------------------
// EMPTY ACTIVE
// ---------------------------------------------------------

const emptyActive = articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID ARTICLE ORDER
// ---------------------------------------------------------

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// SPECIAL ARTICLES
// ---------------------------------------------------------

const specialArticles = articles
  .map((article) => article.article_number)
  .filter((number) => !/^\d+$/u.test(number));

// ---------------------------------------------------------
// NUMERIC GAP CHECK
// ---------------------------------------------------------

const numericArticles = articles
  .map((article) => article.article_number)
  .filter((number) => /^\d+$/u.test(number))
  .map(Number);

const maxNumeric = numericArticles.length ? Math.max(...numericArticles) : 0;

const numericSet = new Set(numericArticles);

const missingNumeric = [];

for (let number = 1; number <= maxNumeric; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// ---------------------------------------------------------
// REPEALED CONTENT SHOULD BE NULL
// ---------------------------------------------------------

const repealedWithContent = articles
  .filter(
    (article) => article.status === "repealed" && article.content_ar !== null,
  )
  .map((article) => article.article_number);

// ---------------------------------------------------------
// SUSPICIOUS REPEALED TEXT
// ---------------------------------------------------------

const suspiciousRepealedText = articles
  .filter(
    (article) =>
      article.status !== "repealed" &&
      /ملغاة|ملغى/u.test(article.content_ar || ""),
  )
  .map((article) => article.article_number);

// ---------------------------------------------------------
// EDITORIAL NOTES
// ---------------------------------------------------------

const suspiciousEditorialNotes = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /^مقضي بعدم دستور/u.test(content) ||
      /^قضي بعدم دستور/u.test(content) ||
      /^التعديل الأخير بموجب القانون/u.test(content) ||
      /^\(مضافة بالقانون/u.test(content)
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// LEAKED ARTICLE HEADINGS
// ---------------------------------------------------------

const leakedArticleHeadings = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return /(?:^|\n)المادة\s+\d+/u.test(content);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// LEAKED HIERARCHY
// ---------------------------------------------------------

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
// SPECIFIC ARTICLE CHECKS
// =========================================================

function findArticle(number) {
  return articles.find((article) => article.article_number === number);
}

const article47 = findArticle("47");

const article113Repeat = findArticle("113 مكررا");

const article208B = findArticle("208 مكررا (ب)");

const specificProblems = [];

if (!article47) {
  specificProblems.push("Article 47 missing");
} else {
  if (article47.status !== "repealed") {
    specificProblems.push("Article 47 status is not repealed");
  }

  if (article47.content_ar !== null) {
    specificProblems.push("Article 47 content should be null");
  }
}

if (!article113Repeat) {
  specificProblems.push("113 مكررا missing");
}

if (!article208B) {
  specificProblems.push("208 مكررا (ب) missing");
}

// =========================================================
// EXPECTED COUNTS
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

if (specialArticles.length !== EXPECTED.specialCount) {
  countProblems.push(
    `Expected ${EXPECTED.specialCount} special articles, got ${specialArticles.length}`,
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

    active_articles: activeArticles.length,

    repealed_articles: repealedArticles.length,

    repealed_article_numbers: repealedArticles.map(
      (article) => article.article_number,
    ),

    duplicate_article_numbers: uniqueDuplicates,

    duplicate_article_numbers_count: uniqueDuplicates.length,

    empty_active_articles: emptyActive,

    empty_active_articles_count: emptyActive.length,

    special_article_numbers: specialArticles,

    special_article_numbers_count: specialArticles.length,

    max_numeric_article: maxNumeric,

    missing_numeric_articles: missingNumeric,

    missing_numeric_articles_count: missingNumeric.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    invalid_statuses: invalidStatuses,

    invalid_statuses_count: invalidStatuses.length,

    repealed_with_content: repealedWithContent,

    repealed_with_content_count: repealedWithContent.length,

    suspicious_repealed_text: suspiciousRepealedText,

    suspicious_repealed_text_count: suspiciousRepealedText.length,

    suspicious_editorial_notes: suspiciousEditorialNotes,

    suspicious_editorial_notes_count: suspiciousEditorialNotes.length,

    leaked_article_headings: leakedArticleHeadings,

    leaked_article_headings_count: leakedArticleHeadings.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    specific_article_problems: specificProblems,

    specific_article_problems_count: specificProblems.length,

    count_problems: countProblems,

    count_problems_count: countProblems.length,
  },

  cleanup_stats: {
    constitutional_status_fixed: stats.constitutionalStatusFixed,

    constitutional_status_fixed_count: stats.constitutionalStatusFixed.length,

    repealed_normalized: stats.repealedNormalized,

    repealed_normalized_count: stats.repealedNormalized.length,
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

console.log(`Special article numbers: ${specialArticles.length}`);

console.log("");

console.log(
  `Constitutional status fixed: ${
    stats.constitutionalStatusFixed.length
      ? stats.constitutionalStatusFixed.join(", ")
      : "None"
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
  `Duplicates: ${
    uniqueDuplicates.length ? uniqueDuplicates.join(", ") : "None"
  }`,
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
  `Suspicious hierarchy: ${
    suspiciousHierarchy.length ? suspiciousHierarchy.join(", ") : "None"
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
