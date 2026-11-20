import fs from "fs";

const INPUT_FILE = "data/raw/egyptian-evidence-law.json";

const OUTPUT_FILE = "data/final/egyptian-evidence-law-final.json";

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

/**
 * Removes source footnote references such as:
 *
 * ... باطلا. (1)
 * ... ألفي جنيه. (2)
 * ... مقبولا. (1) (2)
 *
 * But DOES NOT remove real numbered clauses like:
 *
 * (1) ...
 * (2) ...
 *
 * Important:
 * [ \t]* is used instead of \s*
 * so the regex never crosses a newline.
 */
function removeInlineFootnoteMarkers(content = "") {
  if (!content) {
    return content;
  }

  return content
    .replace(
      /([.؟!؛])[ \t]*(?:\(\d+\)[ \t]*)+(?=\n|$)/gu,
      (_, punctuation) => punctuation,
    )
    .trim();
}

// =========================================================
// LOAD FILE
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ File not found: ${INPUT_FILE}`);

  process.exit(1);
}

const raw = fs.readFileSync(INPUT_FILE, "utf8");

const data = JSON.parse(raw);

if (!data?.articles || !Array.isArray(data.articles)) {
  console.error("❌ Invalid JSON structure: articles array not found.");

  process.exit(1);
}

console.log("");
console.log("==============================");

console.log("EVIDENCE LAW CLEANUP");

console.log("==============================");

console.log(`Input articles: ${data.articles.length}`);

console.log("");

// =========================================================
// CLEANUP STATS
// =========================================================

const stats = {
  inlineFootnotesRemovedFrom: [],
  normalizedArticles: 0,
};

// =========================================================
// CLEAN ARTICLES
// =========================================================

const articles = data.articles.map((article) => {
  const cleaned = {
    ...article,
  };

  // ---------------------------------------------------
  // ARTICLE NUMBER
  // ---------------------------------------------------

  cleaned.article_number = String(cleaned.article_number).trim();

  // ---------------------------------------------------
  // CONTENT NORMALIZATION
  // ---------------------------------------------------

  if (typeof cleaned.content_ar === "string") {
    cleaned.content_ar = normalizeText(cleaned.content_ar);
  }

  // ---------------------------------------------------
  // REMOVE INLINE FOOTNOTE MARKERS
  // ---------------------------------------------------

  const beforeCleanup = cleaned.content_ar;

  cleaned.content_ar = removeInlineFootnoteMarkers(cleaned.content_ar);

  if (beforeCleanup !== cleaned.content_ar) {
    stats.inlineFootnotesRemovedFrom.push(cleaned.article_number);
  }

  // ---------------------------------------------------
  // NORMALIZE HIERARCHY
  // ---------------------------------------------------

  const hierarchyFields = [
    "division_title",
    "book_title",
    "part_title",
    "chapter_title",
    "section_title",
    "subsection_title",
    "title_ar",
  ];

  for (const field of hierarchyFields) {
    if (typeof cleaned[field] === "string") {
      cleaned[field] = normalizeText(cleaned[field]);

      if (!cleaned[field]) {
        cleaned[field] = null;
      }
    }
  }

  // ---------------------------------------------------
  // STATUS
  // ---------------------------------------------------

  cleaned.status = cleaned.status || "active";

  stats.normalizedArticles += 1;

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
// EMPTY ACTIVE ARTICLES
// ---------------------------------------------------------

const emptyActiveArticles = articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID STATUS
// ---------------------------------------------------------

const invalidStatuses = articles
  .filter((article) => !["active", "repealed"].includes(article.status))
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID ARTICLE ORDER
// ---------------------------------------------------------

const invalidArticleOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// SUSPICIOUS INLINE FOOTNOTES
// ---------------------------------------------------------

const suspiciousInlineFootnotes = articles
  .filter((article) => {
    if (!article.content_ar) {
      return false;
    }

    return /[.؟!؛][ \t]*(?:\(\d+\)[ \t]*)+(?=\n|$)/u.test(article.content_ar);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// REPLACEMENT ARTIFACTS SUCH AS "$1"
// ---------------------------------------------------------

const suspiciousReplacementArtifacts = articles
  .filter((article) => {
    if (!article.content_ar) {
      return false;
    }

    return /\$1/u.test(article.content_ar);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// LARGE FOOTNOTE DUMPS
// ---------------------------------------------------------

const suspiciousFootnoteDumps = articles
  .filter((article) => {
    if (!article.content_ar) {
      return false;
    }

    return /_{10,}/u.test(article.content_ar);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// HIERARCHY LEAKED INTO CONTENT
// ---------------------------------------------------------

const suspiciousHierarchyInContent = articles
  .filter((article) => {
    if (!article.content_ar) {
      return false;
    }

    return (
      /\nالباب\s+/u.test(article.content_ar) ||
      /\nالفصل\s+/u.test(article.content_ar) ||
      /\nالفرع\s+/u.test(article.content_ar)
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// REPEATED ARTICLES
// ---------------------------------------------------------

const repeatedArticles = articles
  .filter((article) => /مكرر/u.test(article.article_number))
  .map((article) => article.article_number);

// ---------------------------------------------------------
// MISSING BASE NUMERIC ARTICLES
// ---------------------------------------------------------

const numericBaseNumbers = new Set(
  articles
    .map((article) => article.article_number)
    .filter((number) => /^\d+$/u.test(number))
    .map(Number),
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

    duplicate_article_numbers: [...new Set(duplicates)],

    empty_active_articles: emptyActiveArticles,

    empty_active_articles_count: emptyActiveArticles.length,

    repeated_articles: repeatedArticles,

    repeated_articles_count: repeatedArticles.length,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    suspicious_inline_footnotes: suspiciousInlineFootnotes,

    suspicious_inline_footnotes_count: suspiciousInlineFootnotes.length,

    suspicious_replacement_artifacts: suspiciousReplacementArtifacts,

    suspicious_replacement_artifacts_count:
      suspiciousReplacementArtifacts.length,

    suspicious_footnote_dumps: suspiciousFootnoteDumps,

    suspicious_footnote_dumps_count: suspiciousFootnoteDumps.length,

    suspicious_hierarchy_in_content: suspiciousHierarchyInContent,

    suspicious_hierarchy_in_content_count: suspiciousHierarchyInContent.length,

    invalid_article_orders: invalidArticleOrders,

    invalid_article_orders_count: invalidArticleOrders.length,

    invalid_statuses: invalidStatuses,

    invalid_statuses_count: invalidStatuses.length,
  },

  cleanup_stats: {
    inline_footnotes_removed_from: stats.inlineFootnotesRemovedFrom,

    inline_footnotes_removed_count: stats.inlineFootnotesRemovedFrom.length,

    normalized_articles: stats.normalizedArticles,
  },

  articles,
};

// =========================================================
// WRITE FILE
// =========================================================

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

// =========================================================
// CONSOLE SUMMARY
// =========================================================

console.log("");
console.log("==============================");

console.log("CLEANUP COMPLETE");

console.log("==============================");

console.log(`Total articles: ${articles.length}`);

console.log(`Active articles: ${activeArticles.length}`);

console.log(`Repealed articles: ${repealedArticles.length}`);

console.log("");

console.log(
  `Inline footnotes cleaned from: ${
    stats.inlineFootnotesRemovedFrom.length
  } article(s)`,
);

console.log(
  stats.inlineFootnotesRemovedFrom.length
    ? `Articles: ${stats.inlineFootnotesRemovedFrom.join(", ")}`
    : "Articles: None",
);

console.log("");

console.log("==============================");

console.log("VALIDATION");

console.log("==============================");

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log(
  `Repeated articles: ${
    repeatedArticles.length ? repeatedArticles.join(", ") : "None"
  }`,
);

console.log(
  `Duplicates: ${
    duplicates.length ? [...new Set(duplicates)].join(", ") : "None"
  }`,
);

console.log(
  `Missing numeric articles: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious inline footnotes: ${
    suspiciousInlineFootnotes.length
      ? suspiciousInlineFootnotes.join(", ")
      : "None"
  }`,
);

console.log(
  `Suspicious replacement artifacts: ${
    suspiciousReplacementArtifacts.length
      ? suspiciousReplacementArtifacts.join(", ")
      : "None"
  }`,
);

console.log(
  `Suspicious footnote dumps: ${
    suspiciousFootnoteDumps.length ? suspiciousFootnoteDumps.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious hierarchy in content: ${
    suspiciousHierarchyInContent.length
      ? suspiciousHierarchyInContent.join(", ")
      : "None"
  }`,
);

console.log(
  `Invalid article orders: ${
    invalidArticleOrders.length ? invalidArticleOrders.join(", ") : "None"
  }`,
);

console.log(
  `Invalid statuses: ${
    invalidStatuses.length ? invalidStatuses.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
