import fs from "fs";

const INPUT_FILE = "personal-status-law-25-1929.json";

const OUTPUT_FILE = "personal-status-law-25-1929-final.json";

const EXPECTED = {
  total: 34,
  active: 33,
  unconstitutional: 1,
  repealed: 0,
  first: "1",
  last: "25",
  specialCount: 9,
  sections: 9,
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
// FOOTNOTE CLEANING
//
// Important:
// We remove only standalone numeric source markers like:
//
// (1)
// (2)(4)(5)
// (10)(11)
//
// We DO NOT remove legal references such as:
//
// المادة (21)
// المواد (7 و8 و9 و10 و11)
// المادة (5 مكررا)
// =========================================================

function removeSourceFootnoteMarkers(text) {
  if (!text) {
    return text;
  }

  let cleaned = String(text);

  // Remove groups appearing at end of sentence/paragraph:
  // .(2)(4)(5)
  // . (1)(7)(11)
  cleaned = cleaned.replace(/(?:\s*\(\d{1,2}\))+\s*(?=$|\n)/gu, "");

  // Remove source marker before a normal word:
  // "عن (1) الزوجة"
  // "للزوج (1) أن"
  //
  // But avoid legal references where the number is
  // semantically part of the statute reference.
  cleaned = cleaned.replace(
    /(^|[\s،؛:])\((\d{1,2})\)(?=\s+[^\d(])/gu,
    (match, prefix, number, offset, whole) => {
      const before = whole.slice(Math.max(0, offset - 30), offset);

      // Protect common statutory references:
      // المادة (21)
      // المواد (7...)
      // البند (1)
      // الفقرة (1)
      if (/(?:المادة|المواد|البند|الفقرة)\s*$/u.test(before)) {
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
  footnoteArticlesChanged: [],
  unconstitutionalArticlesChanged: [],
};

const articles = data.articles.map((article) => {
  const cleaned = {
    ...article,
  };

  cleaned.article_number = normalizeText(cleaned.article_number);

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
  // REMOVE SOURCE FOOTNOTE MARKERS
  // ===================================================

  if (cleaned.content_ar) {
    const before = cleaned.content_ar;

    cleaned.content_ar = removeSourceFootnoteMarkers(cleaned.content_ar);

    if (before !== cleaned.content_ar) {
      cleanupStats.footnoteArticlesChanged.push(cleaned.article_number);
    }
  }

  // ===================================================
  // ARTICLE 18 مكررا ثالثا
  //
  // Source footnote states it was held
  // unconstitutional.
  //
  // Keep statutory text, change only status.
  // ===================================================

  if (cleaned.article_number === "18 مكررا ثالثا") {
    cleaned.status = "unconstitutional";

    cleanupStats.unconstitutionalArticlesChanged.push(cleaned.article_number);
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

const unconstitutionalArticles = articles.filter(
  (article) => article.status === "unconstitutional",
);

// ---------------------------------------------------------
// INVALID STATUS
// ---------------------------------------------------------

const invalidStatuses = articles
  .filter(
    (article) =>
      !["active", "repealed", "unconstitutional"].includes(article.status),
  )
  .map((article) => article.article_number);

// ---------------------------------------------------------
// EMPTY CONTENT
//
// Active + unconstitutional should retain text.
// ---------------------------------------------------------

const emptyNonRepealed = articles
  .filter((article) => article.status !== "repealed" && !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID ORDERS
// ---------------------------------------------------------

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// BASE NUMERIC ARTICLES
// ---------------------------------------------------------

const numericArticles = articles.filter((article) =>
  /^\d+$/u.test(article.article_number),
);

const numericNumbers = numericArticles.map((article) =>
  Number(article.article_number),
);

const numericSet = new Set(numericNumbers);

const missingNumeric = [];

for (let number = 1; number <= 25; number++) {
  if (!numericSet.has(number)) {
    missingNumeric.push(number);
  }
}

// ---------------------------------------------------------
// SPECIAL ARTICLES
// ---------------------------------------------------------

const specialArticles = articles.filter(
  (article) => !/^\d+$/u.test(article.article_number),
);

const expectedSpecialArticles = [
  "5 مكررا",
  "6 مكررا",
  "6 مكررا ثانيا",
  "11 مكررا",
  "11 مكررا ثانيا",
  "18 مكررا",
  "18 مكررا ثانيا",
  "18 مكررا ثالثا",
  "23 مكررا",
];

const specialArticleNumbers = specialArticles.map(
  (article) => article.article_number,
);

const missingSpecialArticles = expectedSpecialArticles.filter(
  (number) => !specialArticleNumbers.includes(number),
);

const unexpectedSpecialArticles = specialArticleNumbers.filter(
  (number) => !expectedSpecialArticles.includes(number),
);

// ---------------------------------------------------------
// SECTIONS
// ---------------------------------------------------------

const sections = [
  ...new Set(articles.map((article) => article.part_title).filter(Boolean)),
];

const expectedSections = [
  "1 – الطلاق",
  "2 – الشقاق بين الزوجين والتطليق للضرر",
  "3 – التطليق لغيبة الزوج أو لحبسه",
  "4 – دعوى النسب",
  "5 – النفقة والعدة",
  "6 – المهر",
  "7 – سن الحضانة",
  "8 – المفقود",
  "9 – أحكام عامة",
];

const missingSections = expectedSections.filter(
  (section) => !sections.includes(section),
);

const unexpectedSections = sections.filter(
  (section) => !expectedSections.includes(section),
);

// ---------------------------------------------------------
// REMAINING SOURCE FOOTNOTE MARKERS
//
// We allow legal references like:
// المادة (21)
// المواد (7 و8 ...)
// but flag isolated numeric source markers.
// ---------------------------------------------------------

const remainingFootnoteMarkers = articles
  .filter((article) => {
    const content = article.content_ar || "";

    const suspiciousMatches = content.match(/\(\d{1,2}\)/gu) || [];

    if (!suspiciousMatches.length) {
      return false;
    }

    // Remove legitimate legal references before testing.
    const withoutLegalReferences = content
      .replace(
        /(?:المادة|المواد|البند|الفقرة)\s*\(\d{1,2}(?:\s+مكررا)?\)/gu,
        "",
      )
      .replace(/المواد\s*\([^)]*\)/gu, "");

    return /\(\d{1,2}\)/u.test(withoutLegalReferences);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// HIERARCHY CHECK
//
// Article 10 legitimately contains numbered clauses,
// so don't treat those as hierarchy.
// ---------------------------------------------------------

const suspiciousHierarchy = articles
  .filter((article) => {
    const content = article.content_ar || "";

    if (article.article_number === "10") {
      return false;
    }

    return /(?:^|\n)\d+\s*[–—-]\s+/u.test(content);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// SPECIFIC ARTICLE CHECKS
// ---------------------------------------------------------

function findArticle(number) {
  return articles.find((article) => article.article_number === number);
}

const article10 = findArticle("10");

const article11 = findArticle("11");

const article11Repeat = findArticle("11 مكررا");

const article18Third = findArticle("18 مكررا ثالثا");

const specificProblems = [];

if (article10?.part_title !== "2 – الشقاق بين الزوجين والتطليق للضرر") {
  specificProblems.push("Article 10 hierarchy incorrect");
}

if (article11?.part_title !== "2 – الشقاق بين الزوجين والتطليق للضرر") {
  specificProblems.push("Article 11 hierarchy incorrect");
}

if (article11Repeat?.part_title !== "2 – الشقاق بين الزوجين والتطليق للضرر") {
  specificProblems.push("Article 11 مكررا hierarchy incorrect");
}

if (!article18Third) {
  specificProblems.push("18 مكررا ثالثا missing");
} else {
  if (article18Third.status !== "unconstitutional") {
    specificProblems.push("18 مكررا ثالثا status should be unconstitutional");
  }

  if (!article18Third.content_ar) {
    specificProblems.push("18 مكررا ثالثا content should be preserved");
  }

  if (article18Third.part_title !== "5 – النفقة والعدة") {
    specificProblems.push("18 مكررا ثالثا hierarchy incorrect");
  }
}

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

if (unconstitutionalArticles.length !== EXPECTED.unconstitutional) {
  countProblems.push(
    `Expected ${EXPECTED.unconstitutional} unconstitutional, got ${unconstitutionalArticles.length}`,
  );
}

if (specialArticles.length !== EXPECTED.specialCount) {
  countProblems.push(
    `Expected ${EXPECTED.specialCount} special articles, got ${specialArticles.length}`,
  );
}

if (sections.length !== EXPECTED.sections) {
  countProblems.push(
    `Expected ${EXPECTED.sections} sections, got ${sections.length}`,
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

    active_articles: activeArticles.length,

    repealed_articles: repealedArticles.length,

    unconstitutional_articles: unconstitutionalArticles.length,

    unconstitutional_article_numbers: unconstitutionalArticles.map(
      (article) => article.article_number,
    ),

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    empty_non_repealed_articles: emptyNonRepealed,

    empty_non_repealed_articles_count: emptyNonRepealed.length,

    missing_numeric_articles: missingNumeric,

    missing_numeric_articles_count: missingNumeric.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    invalid_statuses: invalidStatuses,

    invalid_statuses_count: invalidStatuses.length,

    special_article_numbers: specialArticleNumbers,

    special_article_numbers_count: specialArticleNumbers.length,

    missing_expected_special_articles: missingSpecialArticles,

    missing_expected_special_articles_count: missingSpecialArticles.length,

    unexpected_special_articles: unexpectedSpecialArticles,

    unexpected_special_articles_count: unexpectedSpecialArticles.length,

    detected_sections: sections,

    detected_sections_count: sections.length,

    missing_expected_sections: missingSections,

    missing_expected_sections_count: missingSections.length,

    unexpected_sections: unexpectedSections,

    unexpected_sections_count: unexpectedSections.length,

    remaining_footnote_markers: remainingFootnoteMarkers,

    remaining_footnote_markers_count: remainingFootnoteMarkers.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    specific_article_problems: specificProblems,

    specific_article_problems_count: specificProblems.length,

    count_problems: countProblems,

    count_problems_count: countProblems.length,
  },

  cleanup_stats: {
    footnote_articles_changed: cleanupStats.footnoteArticlesChanged,

    footnote_articles_changed_count:
      cleanupStats.footnoteArticlesChanged.length,

    unconstitutional_articles_changed:
      cleanupStats.unconstitutionalArticlesChanged,

    unconstitutional_articles_changed_count:
      cleanupStats.unconstitutionalArticlesChanged.length,
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

console.log(`Unconstitutional articles: ${unconstitutionalArticles.length}`);

console.log(
  `Unconstitutional article numbers: ${
    unconstitutionalArticles.length
      ? unconstitutionalArticles
          .map((article) => article.article_number)
          .join(", ")
      : "None"
  }`,
);

console.log("");

console.log(
  `Footnote articles changed: ${
    cleanupStats.footnoteArticlesChanged.length
      ? cleanupStats.footnoteArticlesChanged.join(", ")
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

console.log(`Special articles: ${specialArticles.length}`);

console.log(`Sections: ${sections.length}`);

console.log(
  `Duplicates: ${duplicates.length ? duplicates.join(", ") : "None"}`,
);

console.log(
  `Missing numeric articles: ${
    missingNumeric.length ? missingNumeric.join(", ") : "None"
  }`,
);

console.log(
  `Empty non-repealed articles: ${
    emptyNonRepealed.length ? emptyNonRepealed.join(", ") : "None"
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
  `Missing expected special articles: ${
    missingSpecialArticles.length ? missingSpecialArticles.join(", ") : "None"
  }`,
);

console.log(
  `Unexpected special articles: ${
    unexpectedSpecialArticles.length
      ? unexpectedSpecialArticles.join(", ")
      : "None"
  }`,
);

console.log(
  `Missing expected sections: ${
    missingSections.length ? missingSections.join(" | ") : "None"
  }`,
);

console.log(
  `Unexpected sections: ${
    unexpectedSections.length ? unexpectedSections.join(" | ") : "None"
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
