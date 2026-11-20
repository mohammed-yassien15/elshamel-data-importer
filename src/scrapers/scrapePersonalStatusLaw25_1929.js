import fs from "fs";
import * as cheerio from "cheerio";

const HTML_FILE = "data/source/law-25-1929.html";

const SOURCE_URL =
  "https://alberonsy.com/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-25-%D9%84%D8%B3%D9%86%D8%A9-1929-%D9%81%D9%89-%D8%B4%D8%A3%D9%86-%D8%A8%D8%B9%D8%B6-%D8%A3%D8%AD%D9%83%D8%A7%D9%85-%D8%A7%D9%84%D8%A3%D8%AD%D9%88/";

const OUTPUT_FILE = "personal-status-law-25-1929.json";

const EXPECTED = {
  total: 34,
  baseArticles: 25,
  specialArticles: 9,
  sections: 9,
  first: "1",
  last: "25",
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

function normalizeArabicDigits(text = "") {
  return String(text).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabic = "٠١٢٣٤٥٦٧٨٩";

    const persian = "۰۱۲۳۴۵۶۷۸۹";

    const arabicIndex = arabic.indexOf(digit);

    if (arabicIndex !== -1) {
      return String(arabicIndex);
    }

    const persianIndex = persian.indexOf(digit);

    return persianIndex !== -1 ? String(persianIndex) : digit;
  });
}

function removeArabicDiacritics(text = "") {
  return String(text).replace(/[\u064B-\u065F\u0670]/g, "");
}

function normalizeForDetection(text = "") {
  return removeArabicDiacritics(normalizeArabicDigits(normalizeText(text)))
    .replace(/ـ/g, "")
    .trim();
}

// =========================================================
// ARTICLE NUMBER NORMALIZATION
//
// Supports:
//
// مادة (1)
// مادة (١)
// مادة (5 مكررًا)
// مادة (6 مكررًا ثانيًا)
// مادة (18 مكررًا ثالثًا)
//
// Output:
//
// 1
// 5 مكررا
// 6 مكررا ثانيا
// 18 مكررا ثالثا
// =========================================================

function extractArticleNumber(text = "") {
  const normalized = normalizeForDetection(text);

  const match =
    normalized.match(
      /^(?:المادة|مادة)\s*\(\s*(\d+(?:\s+مكررا(?:\s+(?:ثانيا|ثالثا))?)?)\s*\)\s*:?\s*$/u,
    ) ||
    normalized.match(
      /^(?:المادة|مادة)\s+(\d+(?:\s+مكررا(?:\s+(?:ثانيا|ثالثا))?)?)\s*:?\s*$/u,
    );

  if (!match) {
    return null;
  }

  return normalizeText(match[1]);
}

// =========================================================
// SECTION HEADING
//
// Examples:
//
// 1 – الطلاق
// 2 – الشقاق بين الزوجين والتطليق للضرر
// =========================================================

const EXPECTED_SECTION_TITLES = new Map([
  ["1", "1 – الطلاق"],

  ["2", "2 – الشقاق بين الزوجين والتطليق للضرر"],

  ["3", "3 – التطليق لغيبة الزوج أو لحبسه"],

  ["4", "4 – دعوى النسب"],

  ["5", "5 – النفقة والعدة"],

  ["6", "6 – المهر"],

  ["7", "7 – سن الحضانة"],

  ["8", "8 – المفقود"],

  ["9", "9 – أحكام عامة"],
]);

function extractSectionHeading(text = "") {
  const normalized = normalizeForDetection(text);

  const match = normalized.match(/^(\d+)\s*[–—-]\s*(.+)$/u);

  if (!match) {
    return null;
  }

  const number = match[1];

  const expected = EXPECTED_SECTION_TITLES.get(number);

  if (!expected) {
    return null;
  }

  const actualTitle = normalizeForDetection(`${number} – ${match[2]}`);

  const expectedTitle = normalizeForDetection(expected);

  if (actualTitle !== expectedTitle) {
    return null;
  }

  return {
    number: Number(number),

    title: expected,
  };
}

function isSpecialArticleNumber(number = "") {
  return !/^\d+$/u.test(number);
}

// =========================================================
// START
// =========================================================

console.log("");

console.log("==============================");

console.log("SCRAPING PERSONAL STATUS LAW 25/1929");

console.log("==============================");

console.log("");

// =========================================================
// LOAD LOCAL HTML
// =========================================================

if (!fs.existsSync(HTML_FILE)) {
  throw new Error(`HTML file not found: ${HTML_FILE}`);
}

const html = fs.readFileSync(HTML_FILE, "utf8");

if (!html || html.length < 1000) {
  throw new Error("HTML file looks empty or incomplete.");
}

console.log(`Loaded HTML: ${HTML_FILE}`);

console.log(`HTML size: ${html.length} characters`);

const $ = cheerio.load(html);

// =========================================================
// EXTRACT DOM BLOCKS
// =========================================================

const blocks = [];

$("body")
  .find("h1, h2, h3, h4, h5, h6, p, li, div")
  .each((_, element) => {
    const $element = $(element);

    // Ignore containers that have nested
    // block elements to reduce duplication.
    if (
      $element.children("p, h1, h2, h3, h4, h5, h6, li, div").length > 0 &&
      element.tagName === "div"
    ) {
      return;
    }

    $element.find("br").replaceWith("\n");

    const raw = $element.text();

    const lines = raw
      .split(/\n+/u)
      .map((line) => normalizeText(line))
      .filter(Boolean);

    for (const line of lines) {
      blocks.push(line);
    }
  });

// Remove consecutive duplicates.
const uniqueBlocks = blocks.filter(
  (block, index) => index === 0 || block !== blocks[index - 1],
);

console.log(`DOM blocks found: ${uniqueBlocks.length}`);

// =========================================================
// DEBUG
// =========================================================

const articleLikeBlocks = uniqueBlocks
  .filter((block) => /^(?:المادة|مادة)/u.test(normalizeText(block)))
  .slice(0, 60);

console.log("Article-like blocks:", articleLikeBlocks);

const sectionLikeBlocks = uniqueBlocks
  .map(extractSectionHeading)
  .filter(Boolean)
  .map((section) => section.title)
  .slice(0, 20);

console.log("Section-like blocks:", sectionLikeBlocks);

// =========================================================
// PARSER STATE
// =========================================================

let started = false;

let finished = false;

let currentSection = null;

let currentArticle = null;

const articles = [];

const detectedSections = [];

// =========================================================
// FLUSH ARTICLE
// =========================================================

function flushArticle() {
  if (!currentArticle) {
    return;
  }

  const content = normalizeText(currentArticle.contentParts.join("\n"));

  articles.push({
    article_number: currentArticle.article_number,

    article_order: articles.length + 1,

    division_title: null,

    book_title: null,

    part_title: currentArticle.section_title,

    chapter_title: null,

    section_title: null,

    subsection_title: null,

    title_ar: null,

    // IMPORTANT:
    // Raw scraping stage only.
    // Do not classify constitutional/repealed
    // status yet.
    status: "active",

    content_ar: content || null,
  });

  currentArticle = null;
}

// =========================================================
// PARSE
// =========================================================

for (let index = 0; index < uniqueBlocks.length; index++) {
  if (finished) {
    break;
  }

  const text = normalizeText(uniqueBlocks[index]);

  if (!text) {
    continue;
  }

  const section = extractSectionHeading(text);

  // =======================================================
  // START
  //
  // First law-body section:
  // 1 – الطلاق
  // =======================================================

  if (!started) {
    if (section?.number === 1 && /طلاق/u.test(section.title)) {
      started = true;

      currentSection = section.title;

      detectedSections.push(currentSection);

      console.log(`✅ Found start of law body: ${currentSection}`);
    }

    continue;
  }

  // =======================================================
  // STOP AFTER ARTICLE 25
  //
  // Stop when source footnotes begin.
  // =======================================================

  if (
    currentArticle?.article_number === "25" &&
    (/^_{3,}$/u.test(text) ||
      /^ـ{3,}$/u.test(text) ||
      /^\(\s*[١-٩1-9]\s*\)/u.test(text) ||
      /^الهوامش/u.test(text) ||
      /^المراجع/u.test(text))
  ) {
    flushArticle();

    finished = true;

    console.log("✅ Reached source footnotes after article 25.");

    break;
  }

  // =======================================================
  // SECTION
  // =======================================================

  if (section) {
    flushArticle();

    currentSection = section.title;

    if (!detectedSections.includes(currentSection)) {
      detectedSections.push(currentSection);
    }

    continue;
  }

  // =======================================================
  // ARTICLE
  // =======================================================

  const articleNumber = extractArticleNumber(text);

  if (articleNumber) {
    flushArticle();

    currentArticle = {
      article_number: articleNumber,

      section_title: currentSection,

      contentParts: [],
    };

    continue;
  }

  // =======================================================
  // CONTENT
  // =======================================================

  if (currentArticle) {
    currentArticle.contentParts.push(text);
  }
}

flushArticle();

// =========================================================
// VALIDATION
// =========================================================

const articleNumbers = articles.map((article) => article.article_number);

// =========================================================
// DUPLICATES
// =========================================================

const duplicates = [
  ...new Set(
    articleNumbers.filter(
      (number, index) => articleNumbers.indexOf(number) !== index,
    ),
  ),
];

// =========================================================
// BASE NUMERIC ARTICLES
// =========================================================

const baseNumericArticles = articles.filter((article) =>
  /^\d+$/u.test(article.article_number),
);

const numericNumbers = baseNumericArticles.map((article) =>
  Number(article.article_number),
);

const numericSet = new Set(numericNumbers);

const missingNumericArticles = [];

for (let number = 1; number <= 25; number++) {
  if (!numericSet.has(number)) {
    missingNumericArticles.push(number);
  }
}

// =========================================================
// SPECIAL ARTICLES
// =========================================================

const specialArticles = articles.filter((article) =>
  isSpecialArticleNumber(article.article_number),
);

const specialArticleNumbers = specialArticles.map(
  (article) => article.article_number,
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

const missingExpectedSpecialArticles = expectedSpecialArticles.filter(
  (number) => !specialArticleNumbers.includes(number),
);

const unexpectedSpecialArticles = specialArticleNumbers.filter(
  (number) => !expectedSpecialArticles.includes(number),
);

// =========================================================
// EMPTY ARTICLES
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
// SECTIONS
// =========================================================

const uniqueSections = [
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

const missingExpectedSections = expectedSections.filter(
  (section) => !uniqueSections.includes(section),
);

// =========================================================
// FOOTNOTE MARKERS
// =========================================================

const articlesWithFootnoteMarkers = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return /\(\s*[١-٩۰-۹1-9][٠-٩۰-۹0-9]*\s*\)/u.test(content);
  })
  .map((article) => article.article_number);

// =========================================================
// HIERARCHY LEAK
// =========================================================

const suspiciousHierarchy = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return /(?:^|\n)\d+\s*[–—-]\s+/u.test(content);
  })
  .map((article) => article.article_number);

// =========================================================
// EDITORIAL / SOURCE TEXT
// =========================================================

const suspiciousEditorialText = articles
  .filter((article) => {
    const content = article.content_ar || "";

    const normalized = normalizeForDetection(content);

    return (
      /الجريدة الرسمية العدد/u.test(content) ||
      /يستبدل بنص/u.test(content) ||
      /وفقا لما جاء في القانون رقم/u.test(normalized) ||
      /عدم دستوري/u.test(normalized) ||
      /المحكمة الدستورية/u.test(content)
    );
  })
  .map((article) => article.article_number);

// =========================================================
// IMPORTANT ARTICLE CHECKS
// =========================================================

const article18Third = articles.find(
  (article) => article.article_number === "18 مكررا ثالثا",
);

const specificProblems = [];

if (!article18Third) {
  specificProblems.push("18 مكررا ثالثا missing");
}

// =========================================================
// COUNTS
// =========================================================

const countProblems = [];

if (articles.length !== EXPECTED.total) {
  countProblems.push(
    `Expected ${EXPECTED.total} total records, got ${articles.length}`,
  );
}

if (baseNumericArticles.length !== EXPECTED.baseArticles) {
  countProblems.push(
    `Expected ${EXPECTED.baseArticles} base numeric articles, got ${baseNumericArticles.length}`,
  );
}

if (specialArticles.length !== EXPECTED.specialArticles) {
  countProblems.push(
    `Expected ${EXPECTED.specialArticles} special articles, got ${specialArticles.length}`,
  );
}

if (uniqueSections.length !== EXPECTED.sections) {
  countProblems.push(
    `Expected ${EXPECTED.sections} sections, got ${uniqueSections.length}`,
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
  collection: {
    title_ar: "الأحوال الشخصية",
  },

  law: {
    title_ar: "قانون رقم 25 لسنة 1929 بشأن بعض أحكام الأحوال الشخصية",

    short_title_ar: "قانون الأحوال الشخصية رقم 25 لسنة 1929",

    law_number: "25",

    law_year: 1929,

    source_name: "المستشار ألبير أنسي",

    source_url: SOURCE_URL,

    source_reference: "الصفحة تعرض النص وفقاً لآخر تعديل صادر في 22 يوليو 2017",
  },

  source_snapshot: HTML_FILE,

  extracted_at: new Date().toISOString(),

  total_articles: articles.length,

  validation: {
    first_article: articles[0]?.article_number ?? null,

    last_article: articles[articles.length - 1]?.article_number ?? null,

    total_articles: articles.length,

    base_numeric_articles: baseNumericArticles.length,

    special_articles: specialArticles.length,

    special_article_numbers: specialArticleNumbers,

    duplicate_article_numbers: duplicates,

    duplicate_article_numbers_count: duplicates.length,

    empty_articles: emptyArticles,

    empty_articles_count: emptyArticles.length,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    detected_sections: uniqueSections,

    detected_sections_count: uniqueSections.length,

    missing_expected_sections: missingExpectedSections,

    missing_expected_sections_count: missingExpectedSections.length,

    missing_expected_special_articles: missingExpectedSpecialArticles,

    missing_expected_special_articles_count:
      missingExpectedSpecialArticles.length,

    unexpected_special_articles: unexpectedSpecialArticles,

    unexpected_special_articles_count: unexpectedSpecialArticles.length,

    articles_with_footnote_markers: articlesWithFootnoteMarkers,

    articles_with_footnote_markers_count: articlesWithFootnoteMarkers.length,

    suspicious_hierarchy_in_content: suspiciousHierarchy,

    suspicious_hierarchy_in_content_count: suspiciousHierarchy.length,

    suspicious_editorial_text: suspiciousEditorialText,

    suspicious_editorial_text_count: suspiciousEditorialText.length,

    specific_article_problems: specificProblems,

    specific_article_problems_count: specificProblems.length,

    count_problems: countProblems,

    count_problems_count: countProblems.length,
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

console.log("SCRAPING COMPLETE");

console.log("==============================");

console.log("");

console.log(`Articles: ${articles.length}`);

console.log(`Base numeric articles: ${baseNumericArticles.length}`);

console.log(`Special articles: ${specialArticles.length}`);

console.log(`First article: ${output.validation.first_article}`);

console.log(`Last article: ${output.validation.last_article}`);

console.log("");

console.log(
  `Special article numbers: ${
    specialArticleNumbers.length ? specialArticleNumbers.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Detected sections: ${uniqueSections.length}`);

for (const section of uniqueSections) {
  console.log(`- ${section}`);
}

console.log("");

console.log(
  `Duplicates: ${duplicates.length ? duplicates.join(", ") : "None"}`,
);

console.log(
  `Missing numeric articles: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
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
  `Missing expected sections: ${
    missingExpectedSections.length
      ? missingExpectedSections.join(" | ")
      : "None"
  }`,
);

console.log(
  `Missing expected special articles: ${
    missingExpectedSpecialArticles.length
      ? missingExpectedSpecialArticles.join(", ")
      : "None"
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
  `Articles with footnote markers: ${
    articlesWithFootnoteMarkers.length
      ? articlesWithFootnoteMarkers.join(", ")
      : "None"
  }`,
);

console.log(
  `Suspicious hierarchy: ${
    suspiciousHierarchy.length ? suspiciousHierarchy.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious editorial text: ${
    suspiciousEditorialText.length ? suspiciousEditorialText.join(", ") : "None"
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
