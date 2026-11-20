import fs from "fs";

const INPUT_FILE = "commercial-law-17-1999.json";

const OUTPUT_FILE = "commercial-law-17-1999-final.json";

const SEPARATOR = "___________________________________________";

// =========================================================
// LOAD
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!Array.isArray(data.articles) || !Array.isArray(data.issuance_articles)) {
  throw new Error("Invalid JSON structure.");
}

console.log("");
console.log("==============================");

console.log("CLEANING COMMERCIAL LAW 17/1999");

console.log("==============================");

console.log("");

// =========================================================
// HELPERS
// =========================================================

function cleanText(text = "") {
  return String(text)
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getArticle(number) {
  return data.articles.find(
    (article) => article.article_number === String(number),
  );
}

function stripAppendix(article) {
  if (!article?.content_ar) {
    return null;
  }

  const index = article.content_ar.indexOf(SEPARATOR);

  if (index === -1) {
    return null;
  }

  const original = article.content_ar;

  const legalText = original.slice(0, index).trim();

  const appendix = original.slice(index + SEPARATOR.length).trim();

  article.content_ar = legalText;

  return appendix;
}

// =========================================================
// CLEAN ISSUANCE ARTICLE 3
// =========================================================

const issuance3 = data.issuance_articles.find(
  (article) => article.article_number === "3",
);

if (!issuance3) {
  throw new Error("Issuance article 3 missing.");
}

// The law hierarchy was appended after the issuance text.
// Remove everything beginning with "قانون التجارة".

const lawStartMarker = "\nقانون التجارة";

const lawStartIndex = issuance3.content_ar.indexOf(lawStartMarker);

if (lawStartIndex !== -1) {
  issuance3.content_ar = issuance3.content_ar.slice(0, lawStartIndex).trim();
}

// Also separate issuance footnotes if they remain
let issuanceFootnotes = null;

const issuanceSeparatorIndex = issuance3.content_ar.indexOf(SEPARATOR);

if (issuanceSeparatorIndex !== -1) {
  issuanceFootnotes = issuance3.content_ar
    .slice(issuanceSeparatorIndex + SEPARATOR.length)
    .trim();

  issuance3.content_ar = issuance3.content_ar
    .slice(0, issuanceSeparatorIndex)
    .trim();
}

// =========================================================
// FIX FIRST HIERARCHY
// =========================================================
//
// Articles 1–46 belong to:
// الباب الأول – التجارة بوجه عام
//
// Articles 1–3 are under "أحكام عامة"
// before الفصل الأول.
// =========================================================

for (const article of data.articles) {
  const number = Number(article.article_number);

  if (number >= 1 && number <= 46) {
    article.part_title = "الباب الأول – التجارة بوجه عام";
  }

  if (number >= 1 && number <= 3) {
    article.division_title = "أحكام عامة";

    article.chapter_title = null;

    article.section_title = null;
  }
}

// =========================================================
// EXTRACT SOURCE NOTES
// =========================================================

const sourceNotes = [];

// ---------------------------------------------------------
// Notes after Article 191
// Article 189 unconstitutional
// Article 190(1) fallen
// ---------------------------------------------------------

const article191 = getArticle(191);

const note191 = stripAppendix(article191);

if (note191) {
  sourceNotes.push({
    source_location: "after_article_191",

    applies_to: ["189", "190/1"],

    type: "constitutional_ruling",

    note: cleanText(note191),
  });
}

// ---------------------------------------------------------
// Notes after Article 254
// ---------------------------------------------------------

const article254 = getArticle(254);

const note254 = stripAppendix(article254);

if (note254) {
  sourceNotes.push({
    source_location: "after_article_254",

    applies_to: ["252"],

    type: "official_correction",

    note: cleanText(note254),
  });
}

// ---------------------------------------------------------
// Notes after Article 467
// ---------------------------------------------------------

const article467 = getArticle(467);

const note467 = stripAppendix(article467);

if (note467) {
  sourceNotes.push({
    source_location: "after_article_467",

    applies_to: ["416", "449"],

    type: "amendment_notes",

    note: cleanText(note467),
  });
}

// ---------------------------------------------------------
// Notes after Article 549
// ---------------------------------------------------------

const article549 = getArticle(549);

const note549 = stripAppendix(article549);

if (note549) {
  sourceNotes.push({
    source_location: "after_article_549",

    applies_to: ["482", "503", "504", "531", "537", "544"],

    type: "amendment_notes",

    note: cleanText(note549),
  });
}

// =========================================================
// APPLY ARTICLE-LEVEL LEGAL STATUS / NOTES
// =========================================================

for (const article of data.articles) {
  article.legal_note = null;
}

// ---------------------------------------------------------
// Article 189
// ---------------------------------------------------------

const article189 = getArticle(189);

if (!article189) {
  throw new Error("Article 189 missing.");
}

article189.status = "unconstitutional";

article189.legal_note =
  "قضت المحكمة الدستورية العليا في القضية رقم 193 لسنة 29 قضائية دستورية بجلسة 14/6/2012 بعدم دستورية نص المادة 189.";

// ---------------------------------------------------------
// Article 190
// ---------------------------------------------------------

const article190 = getArticle(190);

if (!article190) {
  throw new Error("Article 190 missing.");
}

article190.status = "active";

article190.legal_note =
  "سقط نص البند (1) من المادة 190 تبعًا للحكم الصادر بعدم دستورية المادة 189 في القضية رقم 193 لسنة 29 قضائية دستورية بجلسة 14/6/2012.";

// ---------------------------------------------------------
// Article 252
// ---------------------------------------------------------

const article252 = getArticle(252);

if (article252) {
  article252.legal_note =
    "ورد بالمصدر أن النص مصحح بالاستدراك المنشور بالجريدة الرسمية العدد 38 مكرر في 27/9/1999.";
}

// ---------------------------------------------------------
// Article 416
// ---------------------------------------------------------

const article416 = getArticle(416);

if (article416) {
  article416.legal_note =
    "ورد بالمصدر أن النص مصحح بالاستدراك المنشور بالجريدة الرسمية العدد 38 مكرر في 27/9/1999.";
}

// ---------------------------------------------------------
// Article 449
// ---------------------------------------------------------

const article449 = getArticle(449);

if (article449) {
  article449.legal_note =
    "الفقرة الثانية من المادة 449 مضافة بالقانون رقم 156 لسنة 2004، وفقًا لملاحظة المصدر.";
}

// ---------------------------------------------------------
// Article 482
// ---------------------------------------------------------

const article482 = getArticle(482);

if (article482) {
  article482.legal_note =
    "البند الخامس مضاف بالقانون رقم 156 لسنة 2004، ويعمل به وفقًا لأحكام الشيك المشار إليها بالقانون رقم 158 لسنة 2003.";
}

// ---------------------------------------------------------
// Article 503
// ---------------------------------------------------------

const article503 = getArticle(503);

if (article503) {
  article503.legal_note =
    "البند الثاني مستبدل بالقانون رقم 156 لسنة 2004، وفقًا لملاحظة المصدر.";
}

// ---------------------------------------------------------
// Article 504
// ---------------------------------------------------------

const article504 = getArticle(504);

if (article504) {
  article504.legal_note =
    "عبارتا مدة التقديم المشار إليهما بالبندين (1) و(2) تم استبدالهما بالقانون رقم 156 لسنة 2004، وفقًا لملاحظة المصدر.";
}

// ---------------------------------------------------------
// Article 531
// ---------------------------------------------------------

const article531 = getArticle(531);

if (article531) {
  article531.legal_note =
    "عبارة مدة التقادم في البندين (1) و(3) تم استبدالها بالقانون رقم 156 لسنة 2004، وفقًا لملاحظة المصدر.";
}

// ---------------------------------------------------------
// Article 537
// ---------------------------------------------------------

const article537 = getArticle(537);

if (article537) {
  article537.legal_note =
    "البند (1) مستبدل بالقانون رقم 156 لسنة 2004، وفقًا لملاحظة المصدر.";
}

// ---------------------------------------------------------
// Article 544
// ---------------------------------------------------------

const article544 = getArticle(544);

if (article544) {
  article544.legal_note =
    "البند (3) مستبدل بالقانون رقم 156 لسنة 2004، وفقًا لملاحظة المصدر.";
}

// =========================================================
// VALIDATION
// =========================================================

const activeArticles = data.articles.filter(
  (article) => article.status === "active",
);

const repealedArticles = data.articles.filter(
  (article) => article.status === "repealed",
);

const unconstitutionalArticles = data.articles.filter(
  (article) => article.status === "unconstitutional",
);

const books = [
  ...new Set(
    data.articles.map((article) => article.book_title).filter(Boolean),
  ),
];

const parts = [
  ...new Set(
    data.articles.map((article) => article.part_title).filter(Boolean),
  ),
];

const chapters = [
  ...new Set(
    data.articles.map((article) => article.chapter_title).filter(Boolean),
  ),
];

const sections = [
  ...new Set(
    data.articles.map((article) => article.section_title).filter(Boolean),
  ),
];

const duplicates = data.articles
  .map((article) => article.article_number)
  .filter((number, index, array) => array.indexOf(number) !== index);

const emptyActive = data.articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

const contamination = [];

for (const article of data.articles) {
  if (article.content_ar?.includes(SEPARATOR)) {
    contamination.push(article.article_number);
  }
}

// =========================================================
// EXPECTATIONS
// =========================================================
//
// 549 originally extracted rows.
//
// Article 189 becomes unconstitutional:
//
// Active = 548
// Unconstitutional = 1
// Repealed = 223
//
// Total = 772
// =========================================================

const problems = [];

if (data.articles.length !== 772) {
  problems.push(`Expected 772 rows, got ${data.articles.length}`);
}

if (activeArticles.length !== 548) {
  problems.push(`Expected 548 active articles, got ${activeArticles.length}`);
}

if (unconstitutionalArticles.length !== 1) {
  problems.push(
    `Expected 1 unconstitutional article, got ${unconstitutionalArticles.length}`,
  );
}

if (repealedArticles.length !== 223) {
  problems.push(
    `Expected 223 repealed articles, got ${repealedArticles.length}`,
  );
}

if (parts.length !== 4) {
  problems.push(`Expected 4 active hierarchy parts, got ${parts.length}`);
}

if (books.length !== 0) {
  problems.push(`Expected 0 books, got ${books.length}`);
}

if (duplicates.length) {
  problems.push(`Duplicate final rows: ${[...new Set(duplicates)].join(", ")}`);
}

if (emptyActive.length) {
  problems.push(`Empty active articles: ${emptyActive.join(", ")}`);
}

if (contamination.length) {
  problems.push(
    `Footnote appendix still inside articles: ${contamination.join(", ")}`,
  );
}

// =========================================================
// FINAL OUTPUT
// =========================================================

data.cleaned_at = new Date().toISOString();

data.cleanup_applied = true;

data.source_notes = sourceNotes;

data.validation = {
  total_articles: data.articles.length,

  active_articles: activeArticles.length,

  repealed_articles: repealedArticles.length,

  unconstitutional_articles: unconstitutionalArticles.length,

  books: books,

  books_count: books.length,

  parts: parts,

  parts_count: parts.length,

  chapters: chapters,

  chapters_count: chapters.length,

  sections: sections,

  sections_count: sections.length,

  empty_active_articles: emptyActive,

  contamination_articles: contamination,

  duplicate_article_numbers: [...new Set(duplicates)],

  source_notes_count: sourceNotes.length,

  problems: problems,
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");

// =========================================================
// SUMMARY
// =========================================================

console.log(`Total articles: ${data.articles.length}`);

console.log(`Active articles: ${activeArticles.length}`);

console.log(`Repealed articles: ${repealedArticles.length}`);

console.log(`Unconstitutional articles: ${unconstitutionalArticles.length}`);

console.log("");

console.log(`Books: ${books.length}`);

console.log(`Parts: ${parts.length}`);

console.log(`Chapters: ${chapters.length}`);

console.log(`Sections: ${sections.length}`);

console.log("");

console.log(`Source note groups: ${sourceNotes.length}`);

console.log(
  `Empty active articles: ${
    emptyActive.length ? emptyActive.join(", ") : "None"
  }`,
);

console.log(
  `Contamination articles: ${
    contamination.length ? contamination.join(", ") : "None"
  }`,
);

console.log(
  `Duplicates: ${
    duplicates.length ? [...new Set(duplicates)].join(", ") : "None"
  }`,
);

console.log(`Problems: ${problems.length ? problems.join(" | ") : "None"}`);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
