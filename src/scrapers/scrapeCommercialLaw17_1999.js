import fs from "fs";
import * as cheerio from "cheerio";

const HTML_FILE = "data/source/commercial-law-17-1999.html";

const OUTPUT_FILE = "commercial-law-17-1999.json";

const SOURCE_URL =
  "https://alberonsy.com/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D8%A9-17-%D9%84%D8%B3%D9%86%D8%A9-1999-%D9%88%D8%AA%D8%B9%D8%AF%D9%8A%D9%84%D8%A7%D8%AA%D9%87/";

const EXPECTED = {
  issuanceArticles: 3,
  extractedFirst: "1",
  extractedLast: "549",

  totalFinalArticles: 772,

  repealedStart: 550,
  repealedEnd: 772,
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
// ISSUANCE ARTICLES
// =========================================================

const issuanceMap = new Map([
  ["الماده الاولي", "1"],
  ["الماده الثانيه", "2"],
  ["الماده الثالثه", "3"],
]);

function extractIssuanceNumber(text = "") {
  let normalized = normalizeForDetection(text).replace(/ة/g, "ه").trim();

  normalized = normalized
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .replace(/[:：]\s*$/u, "")
    .trim();

  return issuanceMap.get(normalized) ?? null;
}

// =========================================================
// LAW ARTICLE DETECTION
// =========================================================

function extractLawArticleNumber(text = "") {
  const normalized = normalizeForDetection(text);

  let match = normalized.match(
    /^(?:مادة|المادة)\s*\(\s*(\d+)\s*\)\s*[:：]?\s*$/u,
  );

  if (match) {
    return match[1];
  }

  match = normalized.match(/^(?:مادة|المادة)\s+(\d+)\s*[:：]?\s*$/u);

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
  return /^الفصل\s+/u.test(
    normalizeForDetection(text)
      .replace(/^\(\s*/u, "")
      .replace(/\s*\)$/u, "")
      .trim(),
  );
}

function isSectionHeading(text = "") {
  const normalized = normalizeForDetection(text);

  return /^الفرع\s+/u.test(normalized) || /^المبحث\s+/u.test(normalized);
}

function cleanHierarchyMarker(text = "") {
  return normalizeText(text)
    .replace(/^\(\s*/u, "")
    .replace(/\s*\)$/u, "")
    .trim();
}

// =========================================================
// POSSIBLE FOOTNOTE / AMENDMENT NOTE DETECTION
// =========================================================

function hasPossibleFootnote(text = "") {
  const normalized = normalizeArabicDigits(text);

  return (
    /\(\s*\d{1,2}\s*\)\s*$/u.test(normalized) ||
    /عدل(?:ت|ت بموجب| بالقانون| بالقانون رقم)/u.test(
      normalizeForDetection(text),
    ) ||
    /استبدل/u.test(normalizeForDetection(text)) ||
    /مضاف/u.test(normalizeForDetection(text))
  );
}

// =========================================================
// LOAD HTML
// =========================================================

console.log("");
console.log("==============================");

console.log("SCRAPING COMMERCIAL LAW 17/1999");

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
// DEBUG
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

const extractedArticles = [];

let currentIssuanceArticle = null;

let currentArticle = null;

let lawBodyStarted = false;

let lawFinished = false;

let currentBook = null;

let currentPart = null;

let currentChapter = null;

let currentSection = null;

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

  extractedArticles.push({
    article_number: currentArticle.article_number,

    article_order: extractedArticles.length + 1,

    division_title: null,

    book_title: currentArticle.book_title,

    part_title: currentArticle.part_title,

    chapter_title: currentArticle.chapter_title,

    section_title: currentArticle.section_title,

    subsection_title: null,

    title_ar: null,

    status: "active",

    content_ar: normalizeText(currentArticle.contentParts.join("\n")) || null,
  });

  currentArticle = null;
}

// =========================================================
// HIERARCHY SETTER
// =========================================================

function setHierarchy(type, marker, title = null) {
  const finalValue = title ? `${marker} – ${title}` : marker;

  if (type === "book") {
    currentBook = finalValue;

    currentPart = null;

    currentChapter = null;

    currentSection = null;
  }

  if (type === "part") {
    currentPart = finalValue;

    currentChapter = null;

    currentSection = null;
  }

  if (type === "chapter") {
    currentChapter = finalValue;

    currentSection = null;
  }

  if (type === "section") {
    currentSection = finalValue;
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
  // BEFORE LAW BODY
  // =======================================================

  if (!lawBodyStarted) {
    const issuanceNumber = extractIssuanceNumber(text);

    if (issuanceNumber) {
      flushIssuanceArticle();

      currentIssuanceArticle = {
        article_number: issuanceNumber,

        article_order: Number(issuanceNumber),

        title_ar: text.replace(/[()]/g, "").trim(),

        contentParts: [],
      };

      continue;
    }

    // Start at first actual numbered article
    const firstArticle = extractLawArticleNumber(text);

    if (firstArticle === "1") {
      flushIssuanceArticle();

      lawBodyStarted = true;

      currentArticle = {
        article_number: firstArticle,

        book_title: currentBook,

        part_title: currentPart,

        chapter_title: currentChapter,

        section_title: currentSection,

        contentParts: [],
      };

      console.log("");
      console.log("✅ Found law body at Article 1");

      continue;
    }

    if (currentIssuanceArticle) {
      currentIssuanceArticle.contentParts.push(text);
    }

    continue;
  }

  // =======================================================
  // STOP AFTER 549 IF PAGE MOVES TO REPEAL NOTICE / FOOTER
  // =======================================================

  if (currentArticle?.article_number === "549") {
    const nextArticle = extractLawArticleNumber(text);

    const looksLikeRepealNotice =
      normalized.includes("550") &&
      normalized.includes("772") &&
      (normalized.includes("الغيت") ||
        normalized.includes("ملغاه") ||
        normalized.includes("ملغاة") ||
        normalized.includes("قانون رقم 11 لسنه 2018"));

    const looksLikeFooter =
      normalized === "اتصل بنا" ||
      normalized === "عن الموقع" ||
      normalized.includes("حقوق النشر");

    if (
      looksLikeRepealNotice ||
      looksLikeFooter ||
      (nextArticle && Number(nextArticle) > 549)
    ) {
      flushArticle();

      lawFinished = true;

      console.log("✅ Reached end of extracted active text after Article 549.");

      break;
    }
  }

  // =======================================================
  // HIERARCHY
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

  if (isSectionHeading(text)) {
    flushArticle();

    if (pendingHierarchy) {
      setHierarchy(pendingHierarchy.type, pendingHierarchy.marker);
    }

    pendingHierarchy = {
      type: "section",

      marker: cleanHierarchyMarker(text),
    };

    continue;
  }

  // =======================================================
  // ARTICLE
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

      section_title: currentSection,

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
  // CONTENT
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
// DEDUPE EXTRACTED ARTICLES
// =========================================================

const rawArticleNumbers = extractedArticles.map(
  (article) => article.article_number,
);

const duplicates = [
  ...new Set(
    rawArticleNumbers.filter(
      (number, index) => rawArticleNumbers.indexOf(number) !== index,
    ),
  ),
];

const seen = new Set();

const dedupedExtractedArticles = [];

for (const article of extractedArticles) {
  if (seen.has(article.article_number)) {
    continue;
  }

  seen.add(article.article_number);

  dedupedExtractedArticles.push(article);
}

// =========================================================
// NORMALIZE ORDERS 1..549
// =========================================================

dedupedExtractedArticles.forEach((article, index) => {
  article.article_order = index + 1;
});

// =========================================================
// BUILD REPEALED PLACEHOLDERS 550..772
// =========================================================

const repealedArticles = [];

for (
  let number = EXPECTED.repealedStart;
  number <= EXPECTED.repealedEnd;
  number++
) {
  repealedArticles.push({
    article_number: String(number),

    article_order: number,

    division_title: null,

    book_title: null,

    part_title: null,

    chapter_title: null,

    section_title: null,

    subsection_title: null,

    title_ar: null,

    status: "repealed",

    content_ar: null,
  });
}

// =========================================================
// FINAL ARTICLES
// =========================================================

const finalArticles = [...dedupedExtractedArticles, ...repealedArticles];

// =========================================================
// VALIDATE EXTRACTED RANGE
// =========================================================

const extractedNumericSet = new Set(
  dedupedExtractedArticles
    .filter((article) => /^\d+$/u.test(article.article_number))
    .map((article) => Number(article.article_number)),
);

const missingExtracted = [];

for (let number = 1; number <= 549; number++) {
  if (!extractedNumericSet.has(number)) {
    missingExtracted.push(number);
  }
}

// =========================================================
// FINAL RANGE VALIDATION
// =========================================================

const finalNumericSet = new Set(
  finalArticles.map((article) => Number(article.article_number)),
);

const missingFinal = [];

for (let number = 1; number <= EXPECTED.totalFinalArticles; number++) {
  if (!finalNumericSet.has(number)) {
    missingFinal.push(number);
  }
}

// =========================================================
// EMPTY ACTIVE ARTICLES
// =========================================================

const emptyActiveArticles = dedupedExtractedArticles
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// =========================================================
// STATUS COUNTS
// =========================================================

const activeArticles = finalArticles.filter(
  (article) => article.status === "active",
);

const repealedCount = finalArticles.filter(
  (article) => article.status === "repealed",
);

// =========================================================
// HIERARCHY COUNTS
// =========================================================

const books = [
  ...new Set(
    dedupedExtractedArticles
      .map((article) => article.book_title)
      .filter(Boolean),
  ),
];

const parts = [
  ...new Set(
    dedupedExtractedArticles
      .map((article) => article.part_title)
      .filter(Boolean),
  ),
];

const chapters = [
  ...new Set(
    dedupedExtractedArticles
      .map((article) => article.chapter_title)
      .filter(Boolean),
  ),
];

const sections = [
  ...new Set(
    dedupedExtractedArticles
      .map((article) => article.section_title)
      .filter(Boolean),
  ),
];

// =========================================================
// POSSIBLE FOOTNOTES / AMENDMENT NOTES
// =========================================================

const possibleFootnoteArticles = dedupedExtractedArticles
  .filter((article) => hasPossibleFootnote(article.content_ar))
  .map((article) => article.article_number);

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
// COUNT PROBLEMS
// =========================================================

const countProblems = [];

if (issuanceArticles.length !== EXPECTED.issuanceArticles) {
  countProblems.push(
    `Expected ${EXPECTED.issuanceArticles} issuance articles, got ${issuanceArticles.length}`,
  );
}

if (dedupedExtractedArticles.length !== 549) {
  countProblems.push(
    `Expected 549 extracted active articles, got ${dedupedExtractedArticles.length}`,
  );
}

if (finalArticles.length !== EXPECTED.totalFinalArticles) {
  countProblems.push(
    `Expected ${EXPECTED.totalFinalArticles} final article rows, got ${finalArticles.length}`,
  );
}

if (activeArticles.length !== 549) {
  countProblems.push(
    `Expected 549 active articles, got ${activeArticles.length}`,
  );
}

if (repealedCount.length !== 223) {
  countProblems.push(
    `Expected 223 repealed articles, got ${repealedCount.length}`,
  );
}

if (dedupedExtractedArticles[0]?.article_number !== EXPECTED.extractedFirst) {
  countProblems.push(
    `Unexpected first extracted article: ${dedupedExtractedArticles[0]?.article_number}`,
  );
}

if (
  dedupedExtractedArticles[dedupedExtractedArticles.length - 1]
    ?.article_number !== EXPECTED.extractedLast
) {
  countProblems.push(
    `Unexpected last extracted article: ${
      dedupedExtractedArticles[dedupedExtractedArticles.length - 1]
        ?.article_number
    }`,
  );
}

// =========================================================
// OUTPUT
// =========================================================

const output = {
  collection: {
    title_ar: "التجارة",
  },

  law: {
    title_ar: "قانون رقم 17 لسنة 1999 بإصدار قانون التجارة",

    short_title_ar: "قانون التجارة رقم 17 لسنة 1999",

    law_number: "17",

    law_year: 1999,

    source_name: "مكتب البارونسي للمحاماة",

    source_url: SOURCE_URL,

    source_reference: "النص المنشور لقانون التجارة رقم 17 لسنة 1999 وتعديلاته",

    source_claim:
      "الصفحة تعرض النص وفقًا للتعديلات المشار إليها بالمصدر، مع الإشارة إلى إلغاء المواد 550 حتى 772 بالقانون رقم 11 لسنة 2018",
  },

  source_snapshot: HTML_FILE,

  extracted_at: new Date().toISOString(),

  issuance_articles: issuanceArticles,

  total_issuance_articles: issuanceArticles.length,

  extracted_active_articles_count: dedupedExtractedArticles.length,

  generated_repealed_articles_count: repealedArticles.length,

  total_articles: finalArticles.length,

  validation: {
    first_extracted_article:
      dedupedExtractedArticles[0]?.article_number ?? null,

    last_extracted_article:
      dedupedExtractedArticles[dedupedExtractedArticles.length - 1]
        ?.article_number ?? null,

    total_articles: finalArticles.length,

    active_articles: activeArticles.length,

    repealed_articles: repealedCount.length,

    missing_issuance_articles: missingIssuance,

    duplicate_extracted_article_numbers: duplicates,

    missing_extracted_articles: missingExtracted,

    missing_final_articles: missingFinal,

    empty_active_articles: emptyActiveArticles,

    detected_books: books,

    detected_books_count: books.length,

    detected_parts: parts,

    detected_parts_count: parts.length,

    detected_chapters: chapters,

    detected_chapters_count: chapters.length,

    detected_sections: sections,

    detected_sections_count: sections.length,

    possible_footnote_or_amendment_articles: possibleFootnoteArticles,

    count_problems: countProblems,
  },

  articles: finalArticles,
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

console.log(`Extracted active articles: ${dedupedExtractedArticles.length}`);

console.log(`Generated repealed placeholders: ${repealedArticles.length}`);

console.log(`Final article rows: ${finalArticles.length}`);

console.log("");

console.log(
  `First extracted article: ${output.validation.first_extracted_article}`,
);

console.log(
  `Last extracted article: ${output.validation.last_extracted_article}`,
);

console.log("");

console.log(`Active articles: ${activeArticles.length}`);

console.log(`Repealed articles: ${repealedCount.length}`);

console.log("");

console.log(`Books: ${books.length}`);

for (const book of books) {
  console.log(`- ${book}`);
}

console.log("");

console.log(`Parts: ${parts.length}`);

console.log(`Chapters: ${chapters.length}`);

console.log(`Sections: ${sections.length}`);

console.log("");

console.log(
  `Missing issuance articles: ${
    missingIssuance.length ? missingIssuance.join(", ") : "None"
  }`,
);

console.log(
  `Duplicate extracted articles: ${
    duplicates.length ? duplicates.join(", ") : "None"
  }`,
);

console.log(
  `Missing extracted articles 1-549: ${
    missingExtracted.length ? missingExtracted.join(", ") : "None"
  }`,
);

console.log(
  `Missing final articles 1-772: ${
    missingFinal.length ? missingFinal.join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
  }`,
);

console.log(
  `Possible footnote/amendment articles: ${
    possibleFootnoteArticles.length
      ? possibleFootnoteArticles.join(", ")
      : "None"
  }`,
);

console.log(
  `Count problems: ${
    countProblems.length ? countProblems.join(" | ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
