import fs from "fs";

const INPUT_FILE = "data/raw/personal-status-law-1-2000.json";

const OUTPUT_FILE = "data/final/personal-status-law-1-2000-final.json";

const EXPECTED = {
  issuance: 6,
  total: 80,
  active: 79,
  unconstitutional: 1,
  repealed: 0,

  first: "1",
  last: "79",

  special: ["76 مكررا"],
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

  const result = normalizeText(value);

  return result || null;
}

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === number);
}

// =========================================================
// REMOVE SOURCE FOOTNOTE MARKERS
//
// Removes:
// (1)
// (2)(3)
// (10)(11)
//
// Preserves statutory references such as:
// المادة (52)
// المادة (293)
// المواد (27، 28، 29)
// =========================================================

function removeFootnoteMarkers(text) {
  if (!text) {
    return text;
  }

  let cleaned = String(text);

  // End-of-line / end-of-text marker groups.
  cleaned = cleaned.replace(/(?:\s*\(\d{1,2}\))+\s*(?=$|\n)/gu, "");

  // Standalone markers inside a sentence.
  cleaned = cleaned.replace(
    /(^|[\s،؛:])\((\d{1,2})\)(?=\s+[^\d(])/gu,
    (match, prefix, number, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 40), offset);

      if (/(?:المادة|المواد|الفقرة|البند)\s*$/u.test(before)) {
        return match;
      }

      return prefix;
    },
  );

  return normalizeText(cleaned);
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

console.log("CLEANING PERSONAL STATUS PROCEDURE LAW 1/2000");

console.log("==============================");

console.log("");

// =========================================================
// CLEAN ISSUANCE ARTICLES
// =========================================================

const issuanceArticles = data.issuance_articles.map((article) => ({
  ...article,
  content_ar: nullable(article.content_ar),
}));

const sixthIssuance = issuanceArticles.find(
  (article) => article.article_number === "السادسة",
);

if (!sixthIssuance) {
  throw new Error("Issuance article السادسة missing.");
}

// Remove editorial note captured after the actual article.
if (sixthIssuance.content_ar) {
  sixthIssuance.content_ar = sixthIssuance.content_ar
    .split(/\n\s*\(1\)\s*ملحوظة:/u)[0]
    .trim();

  // Safety fallback if page title leaked.
  sixthIssuance.content_ar = sixthIssuance.content_ar
    .split(/\nقانون تنظيم بعض أوضاع وإجراءات التقاضي/u)[0]
    .trim();
}

// =========================================================
// CLEAN LAW ARTICLES
// =========================================================

const footnoteArticlesChanged = [];

const articles = data.articles.map((article) => {
  const cleaned = {
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
  };

  if (cleaned.content_ar) {
    const before = cleaned.content_ar;

    cleaned.content_ar = removeFootnoteMarkers(cleaned.content_ar);

    if (before !== cleaned.content_ar) {
      footnoteArticlesChanged.push(cleaned.article_number);
    }
  }

  return cleaned;
});

// =========================================================
// ARTICLE 21
//
// Source provides only:
// "قُضى بعدم دستوريتها.(2)"
//
// That's an editorial status note,
// not the statutory article text.
// =========================================================

const article21 = findArticle(articles, "21");

if (!article21) {
  throw new Error("Article 21 missing.");
}

article21.status = "unconstitutional";

article21.content_ar = null;

// =========================================================
// ARTICLE 55 / SECTION HEADING
// =========================================================

const APPEAL_SECTION = "ثانياً – الطعن على الأحكام والقرارات";

const article55 = findArticle(articles, "55");

if (!article55) {
  throw new Error("Article 55 missing.");
}

article55.content_ar = normalizeText(
  article55.content_ar.replace(
    /\n?ثانياً\s*[–—-]\s*الطعن على الأحكام والقرارات\s*$/u,
    "",
  ),
);

// Articles 56–64 belong under this heading.
for (const article of articles) {
  const numeric = /^\d+$/u.test(article.article_number)
    ? Number(article.article_number)
    : null;

  if (numeric !== null && numeric >= 56 && numeric <= 64) {
    article.section_title = APPEAL_SECTION;
  }
}

// =========================================================
// REBUILD ORDER
// =========================================================

articles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// VALIDATION
// =========================================================

const numbers = articles.map((article) => article.article_number);

const duplicates = [
  ...new Set(
    numbers.filter((number, index) => numbers.indexOf(number) !== index),
  ),
];

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
// NUMERIC ARTICLES
// =========================================================

const numericSet = new Set(
  articles
    .filter((article) => /^\d+$/u.test(article.article_number))
    .map((article) => Number(article.article_number)),
);

const missingNumeric = [];

for (let i = 1; i <= 79; i++) {
  if (!numericSet.has(i)) {
    missingNumeric.push(i);
  }
}

// =========================================================
// SPECIAL
// =========================================================

const specialArticles = articles
  .filter((article) => !/^\d+$/u.test(article.article_number))
  .map((article) => article.article_number);

const missingSpecial = EXPECTED.special.filter(
  (number) => !specialArticles.includes(number),
);

const unexpectedSpecial = specialArticles.filter(
  (number) => !EXPECTED.special.includes(number),
);

// =========================================================
// ORDERS
// =========================================================

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// =========================================================
// EMPTY ARTICLES
//
// Article 21 is intentionally allowed to be empty.
// =========================================================

const unexpectedEmpty = articles
  .filter((article) => !article.content_ar && article.article_number !== "21")
  .map((article) => article.article_number);

// =========================================================
// REMAINING FOOTNOTE MARKERS
// =========================================================

const remainingFootnotes = articles
  .filter((article) => {
    const content = article.content_ar || "";

    const withoutLegalRefs = content
      .replace(/(?:المادة|الفقرة|البند)\s*\(\d{1,3}(?:\s+مكررا)?\)/gu, "")
      .replace(/المواد\s*\([^)]*\)/gu, "");

    return /\(\d{1,2}\)/u.test(withoutLegalRefs);
  })
  .map((article) => article.article_number);

// =========================================================
// HIERARCHY ANCHORS
// =========================================================

const hierarchyProblems = [];

const hierarchyAnchors = [
  ["1", "الباب الأول", null],

  ["9", "الباب الثاني", "الفصل الأول"],

  ["15", "الباب الثاني", "الفصل الثاني"],

  ["16", "الباب الثالث", "الفصل الأول"],

  ["26", "الباب الثالث", "الفصل الثاني"],

  ["52", "الباب الرابع", null],

  ["65", "الباب الخامس", null],
];

for (const [number, expectedPart, expectedChapter] of hierarchyAnchors) {
  const article = findArticle(articles, number);

  if (!article) {
    hierarchyProblems.push(`Missing article ${number}`);

    continue;
  }

  if (article.part_title !== expectedPart) {
    hierarchyProblems.push(`Article ${number} part incorrect`);
  }

  if (article.chapter_title !== expectedChapter) {
    hierarchyProblems.push(`Article ${number} chapter incorrect`);
  }
}

// =========================================================
// IMPORTANT ARTICLE CHECKS
// =========================================================

const specificProblems = [];

const article47 = findArticle(articles, "47");

const article56 = findArticle(articles, "56");

const article64 = findArticle(articles, "64");

const article65 = findArticle(articles, "65");

const article76Repeat = findArticle(articles, "76 مكررا");

if (article21.status !== "unconstitutional") {
  specificProblems.push("Article 21 status incorrect");
}

if (article21.content_ar !== null) {
  specificProblems.push("Article 21 content should be null");
}

if (article47?.status !== "active") {
  specificProblems.push("Article 47 should remain active");
}

if (!article76Repeat) {
  specificProblems.push("76 مكررا missing");
} else if (article76Repeat.status !== "active") {
  specificProblems.push("76 مكررا should remain active");
}

if (article55.content_ar?.includes("الطعن على الأحكام والقرارات")) {
  specificProblems.push("Article 55 still contains section heading");
}

if (article56?.section_title !== APPEAL_SECTION) {
  specificProblems.push("Article 56 section heading missing");
}

if (article64?.section_title !== APPEAL_SECTION) {
  specificProblems.push("Article 64 section heading missing");
}

if (article65?.section_title) {
  specificProblems.push("Article 65 should not inherit appeal section");
}

if (sixthIssuance.content_ar?.includes("ملحوظة:")) {
  specificProblems.push(
    "Issuance article السادسة still contains editorial note",
  );
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

if (unconstitutional.length !== EXPECTED.unconstitutional) {
  countProblems.push(
    `Expected ${EXPECTED.unconstitutional} unconstitutional, got ${unconstitutional.length}`,
  );
}

if (repealed.length !== EXPECTED.repealed) {
  countProblems.push(
    `Expected ${EXPECTED.repealed} repealed, got ${repealed.length}`,
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

    unconstitutional_article_numbers: unconstitutional.map(
      (article) => article.article_number,
    ),

    duplicate_article_numbers: duplicates,

    missing_numeric_articles: missingNumeric,

    invalid_article_orders: invalidOrders,

    invalid_statuses: invalidStatuses,

    special_article_numbers: specialArticles,

    missing_expected_special_articles: missingSpecial,

    unexpected_special_articles: unexpectedSpecial,

    unexpected_empty_articles: unexpectedEmpty,

    remaining_footnote_markers: remainingFootnotes,

    hierarchy_problems: hierarchyProblems,

    specific_article_problems: specificProblems,

    count_problems: countProblems,
  },

  cleanup_stats: {
    footnote_articles_changed: [...new Set(footnoteArticlesChanged)],

    article_21_status_changed: true,

    article_55_section_heading_removed: true,

    appeal_section_assigned: "56–64",

    issuance_article_six_cleaned: true,
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

console.log(
  `Unconstitutional: ${
    unconstitutional.length
      ? unconstitutional.map((article) => article.article_number).join(", ")
      : "None"
  }`,
);

console.log("");

console.log(
  `Footnote articles changed: ${
    footnoteArticlesChanged.length
      ? [...new Set(footnoteArticlesChanged)].join(", ")
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
  `Duplicates: ${duplicates.length ? duplicates.join(", ") : "None"}`,
);

console.log(
  `Missing numeric articles: ${
    missingNumeric.length ? missingNumeric.join(", ") : "None"
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
  `Unexpected empty articles: ${
    unexpectedEmpty.length ? unexpectedEmpty.join(", ") : "None"
  }`,
);

console.log(
  `Remaining footnote markers: ${
    remainingFootnotes.length ? remainingFootnotes.join(", ") : "None"
  }`,
);

console.log(
  `Hierarchy problems: ${
    hierarchyProblems.length ? hierarchyProblems.join(" | ") : "None"
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
