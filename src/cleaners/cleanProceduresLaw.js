import fs from "fs";

const INPUT_FILE = "data/raw/egyptian-procedures-law.json";
const OUTPUT_FILE = "data/final/egyptian-procedures-law-final.json";

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

function normalizeArticleNumber(value = "") {
  return String(value).trim();
}

function isPureRepealedText(content = "") {
  const normalized = normalizeText(content);

  return /^ملغاة\.?(?:\s*\(\d+\))?$/u.test(normalized);
}

/**
 * Removes the large source footnote blocks that appear
 * after some article groups.
 *
 * Example:
 *
 * Actual article text
 * ___________________________________________
 * (1) note...
 * (2) note...
 */
function removeFootnoteDump(content = "") {
  let text = normalizeText(content);

  const separatorRegex = /\n_{10,}\n/u;

  if (separatorRegex.test(text)) {
    text = text.split(separatorRegex)[0];
  }

  return normalizeText(text);
}

/**
 * Removes inline footnote references such as:
 *
 * القانون.(1)
 * القيمة.(15)(33)
 *
 * But keeps real numbered legal clauses such as:
 *
 * (1) اسم الطالب...
 * (2) اسم المدعى عليه...
 */
function removeInlineFootnoteMarkers(content = "") {
  if (!content) {
    return content;
  }

  return content.replace(/(?<=[^\s\n])(?:\(\d+\))+(?=\s|$|\n)/gu, "").trim();
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
console.log("PROCEDURES LAW CLEANUP");
console.log("==============================");
console.log(`Input articles: ${data.articles.length}`);
console.log("");

// =========================================================
// CLEANUP STATS
// =========================================================

const stats = {
  footnoteDumpsRemoved: [],
  inlineFootnotesRemovedFrom: [],
  repealedArticles: [],
  chapterTitlesFixed: [],
  contentNormalized: 0,
};

// =========================================================
// CLEAN ARTICLES
// =========================================================

const articles = data.articles.map((article) => {
  const cleaned = {
    ...article,
  };

  cleaned.article_number = normalizeArticleNumber(cleaned.article_number);

  // =====================================================
  // 1. REMOVE LARGE FOOTNOTE DUMPS
  // =====================================================

  const originalContent = cleaned.content_ar ?? "";

  const contentWithoutFootnotes = removeFootnoteDump(originalContent);

  if (normalizeText(originalContent) !== contentWithoutFootnotes) {
    stats.footnoteDumpsRemoved.push(cleaned.article_number);
  }

  cleaned.content_ar = contentWithoutFootnotes;

  // =====================================================
  // 2. REMOVE INLINE FOOTNOTE REFERENCES
  // =====================================================

  const beforeInlineCleanup = cleaned.content_ar;

  cleaned.content_ar = removeInlineFootnoteMarkers(cleaned.content_ar);

  if (beforeInlineCleanup !== cleaned.content_ar) {
    stats.inlineFootnotesRemovedFrom.push(cleaned.article_number);
  }

  // =====================================================
  // 3. FIX REPEALED ARTICLES
  // =====================================================

  /*
   * Examples from source:
   *
   * 160 -> ملغاة.(25)
   * 161 -> ملغاة.(26)
   * 501–513 -> ملغاة
   */

  if (isPureRepealedText(cleaned.content_ar)) {
    cleaned.status = "repealed";

    cleaned.content_ar = null;
    cleaned.title_ar = null;

    stats.repealedArticles.push(cleaned.article_number);
  } else {
    cleaned.status = cleaned.status || "active";
  }

  // =====================================================
  // 4. FIX:
  // تنفيذ الأحكام والأوامر والسندات الرسمية الأجنبية
  // =====================================================

  if (
    cleaned.chapter_title === "الفصل الرابع: تنفيذ الأحكام والأوامر والسندات" &&
    cleaned.subsection_title === "الرسمية الأجنبية"
  ) {
    cleaned.chapter_title =
      "الفصل الرابع: تنفيذ الأحكام والأوامر والسندات الرسمية الأجنبية";

    cleaned.subsection_title = null;
    cleaned.title_ar = null;

    stats.chapterTitlesFixed.push({
      article_number: cleaned.article_number,

      chapter_title: cleaned.chapter_title,
    });
  }

  // =====================================================
  // 5. FIX:
  // حجز الأسهم والسندات والإيرادات والحصص وبيعها
  // =====================================================

  if (
    cleaned.chapter_title === "الفصل الثاني: حجز الأسهم والسندات والإيرادات" &&
    cleaned.subsection_title === "والحصص وبيعها"
  ) {
    cleaned.chapter_title =
      "الفصل الثاني: حجز الأسهم والسندات والإيرادات والحصص وبيعها";

    cleaned.subsection_title = null;
    cleaned.title_ar = null;

    stats.chapterTitlesFixed.push({
      article_number: cleaned.article_number,

      chapter_title: cleaned.chapter_title,
    });
  }

  // =====================================================
  // 6. FIX:
  // التنفيذ على العقار وإنذار الحائز وتسجيلهما
  // =====================================================

  if (
    cleaned.chapter_title === "الفصل الثالث: التنفيذ على العقار" &&
    cleaned.subsection_title === "وإنذار الحائز وتسجيلهما"
  ) {
    cleaned.chapter_title =
      "الفصل الثالث: التنفيذ على العقار وإنذار الحائز وتسجيلهما";

    cleaned.subsection_title = null;
    cleaned.title_ar = null;

    stats.chapterTitlesFixed.push({
      article_number: cleaned.article_number,

      chapter_title: cleaned.chapter_title,
    });
  }

  // =====================================================
  // 7. FIX:
  // الفصل الأول: إدارة التنفيذ (1
  // =====================================================

  if (cleaned.chapter_title === "الفصل الأول: إدارة التنفيذ (1") {
    cleaned.chapter_title = "الفصل الأول: إدارة التنفيذ";

    stats.chapterTitlesFixed.push({
      article_number: cleaned.article_number,

      chapter_title: cleaned.chapter_title,
    });
  }

  // =====================================================
  // 8. GENERAL HIERARCHY CLEANUP
  // =====================================================

  const hierarchyFields = [
    "division_title",
    "book_title",
    "part_title",
    "chapter_title",
    "section_title",
    "subsection_title",
  ];

  for (const field of hierarchyFields) {
    if (!cleaned[field]) {
      continue;
    }

    cleaned[field] = normalizeText(cleaned[field])
      .replace(/\s*\(\d+\s*$/u, "")
      .trim();

    if (!cleaned[field]) {
      cleaned[field] = null;
    }
  }

  // =====================================================
  // 9. NORMALIZE STRING FIELDS
  // =====================================================

  const stringFields = [
    "article_number",
    "division_title",
    "book_title",
    "part_title",
    "chapter_title",
    "section_title",
    "subsection_title",
    "title_ar",
  ];

  for (const field of stringFields) {
    if (typeof cleaned[field] === "string") {
      cleaned[field] = normalizeText(cleaned[field]);

      if (!cleaned[field]) {
        cleaned[field] = null;
      }
    }
  }

  if (typeof cleaned.content_ar === "string") {
    cleaned.content_ar = normalizeText(cleaned.content_ar);

    stats.contentNormalized += 1;
  }

  return cleaned;
});

// =========================================================
// 10. FIX:
// الفصل الثالث: الطلبات العارضة والتدخل
// =========================================================

for (const article of articles) {
  if (
    article.part_title === "الباب الخامس: إجراءات الجلسات ونظامها" &&
    article.chapter_title === "الفصل الثالث"
  ) {
    article.chapter_title = "الفصل الثالث: الطلبات العارضة والتدخل";

    stats.chapterTitlesFixed.push({
      article_number: article.article_number,

      chapter_title: article.chapter_title,
    });
  }
}

// =========================================================
// 11. RECALCULATE ARTICLE ORDER
// =========================================================

articles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// VALIDATION
// =========================================================

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
// INLINE FOOTNOTE REFERENCES
// ---------------------------------------------------------

const suspiciousInlineFootnotes = articles
  .filter((article) => {
    if (!article.content_ar) {
      return false;
    }

    return /(?<=[^\s\n])(?:\(\d+\))+(?=\s|$|\n)/u.test(article.content_ar);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// HIERARCHY INSIDE ARTICLE CONTENT
// ---------------------------------------------------------

const suspiciousHierarchyInContent = articles
  .filter((article) => {
    if (!article.content_ar) {
      return false;
    }

    return (
      /\nالكتاب\s+/u.test(article.content_ar) ||
      /\nالباب\s+/u.test(article.content_ar) ||
      /\nالفصل\s+/u.test(article.content_ar)
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// SPLIT TITLES THAT SHOULD NO LONGER EXIST
// ---------------------------------------------------------

const suspiciousSplitTitles = articles
  .filter((article) => {
    return (
      article.subsection_title === "الرسمية الأجنبية" ||
      article.subsection_title === "والحصص وبيعها" ||
      article.subsection_title === "وإنذار الحائز وتسجيلهما"
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// ARTICLE ORDER VALIDATION
// ---------------------------------------------------------

const invalidArticleOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// STATUS VALIDATION
// ---------------------------------------------------------

const invalidStatuses = articles
  .filter((article) => !["active", "repealed"].includes(article.status))
  .map((article) => article.article_number);

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

    duplicate_article_numbers: [...new Set(duplicates)],

    empty_active_articles: emptyActiveArticles,

    empty_active_articles_count: emptyActiveArticles.length,

    suspicious_footnote_dumps: suspiciousFootnoteDumps,

    suspicious_footnote_dumps_count: suspiciousFootnoteDumps.length,

    suspicious_inline_footnotes: suspiciousInlineFootnotes,

    suspicious_inline_footnotes_count: suspiciousInlineFootnotes.length,

    suspicious_hierarchy_in_content: suspiciousHierarchyInContent,

    suspicious_hierarchy_in_content_count: suspiciousHierarchyInContent.length,

    suspicious_split_titles: suspiciousSplitTitles,

    suspicious_split_titles_count: suspiciousSplitTitles.length,

    invalid_article_orders: invalidArticleOrders,

    invalid_article_orders_count: invalidArticleOrders.length,

    invalid_statuses: invalidStatuses,

    invalid_statuses_count: invalidStatuses.length,
  },

  cleanup_stats: {
    footnote_dumps_removed_from: stats.footnoteDumpsRemoved,

    footnote_dumps_removed_count: stats.footnoteDumpsRemoved.length,

    inline_footnotes_removed_from: stats.inlineFootnotesRemovedFrom,

    inline_footnotes_removed_count: stats.inlineFootnotesRemovedFrom.length,

    repealed_articles_detected: stats.repealedArticles,

    repealed_articles_detected_count: stats.repealedArticles.length,

    chapter_titles_fixed: stats.chapterTitlesFixed,

    chapter_titles_fixed_count: stats.chapterTitlesFixed.length,
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

console.log(`Footnote dumps removed: ${stats.footnoteDumpsRemoved.length}`);

console.log(
  stats.footnoteDumpsRemoved.length
    ? `From articles: ${stats.footnoteDumpsRemoved.join(", ")}`
    : "From articles: None",
);

console.log("");

console.log(
  `Inline footnotes cleaned from: ${
    stats.inlineFootnotesRemovedFrom.length
  } article(s)`,
);

console.log("");

console.log(
  `Repealed article numbers: ${
    stats.repealedArticles.length ? stats.repealedArticles.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Chapter title fixes: ${stats.chapterTitlesFixed.length}`);

for (const fix of stats.chapterTitlesFixed) {
  console.log(`- Article ${fix.article_number}: ${fix.chapter_title}`);
}

console.log("");
console.log("==============================");

console.log("VALIDATION");

console.log("==============================");

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log(
  `Duplicates: ${
    duplicates.length ? [...new Set(duplicates)].join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious footnote dumps: ${
    suspiciousFootnoteDumps.length ? suspiciousFootnoteDumps.join(", ") : "None"
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
  `Suspicious hierarchy in content: ${
    suspiciousHierarchyInContent.length
      ? suspiciousHierarchyInContent.join(", ")
      : "None"
  }`,
);

console.log(
  `Suspicious split titles: ${
    suspiciousSplitTitles.length ? suspiciousSplitTitles.join(", ") : "None"
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
