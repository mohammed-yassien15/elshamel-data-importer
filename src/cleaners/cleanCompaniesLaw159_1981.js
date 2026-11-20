import fs from "fs";

const INPUT_FILE = "data/raw/companies-law-159-1981.json";

const OUTPUT_FILE = "data/final/companies-law-159-1981-final.json";

const EXPECTED = {
  total: 212,

  active: 202,
  repealed: 10,
  unconstitutional: 0,

  special: 28,

  parts: 7,
  chapters: 6,

  first: "1",
  last: "184",
};

// =========================================================
// LOAD
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!Array.isArray(data.articles)) {
  throw new Error("Invalid JSON structure.");
}

console.log("");
console.log("==============================");

console.log("CLEANING COMPANIES LAW 159/1981");

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

function baseNumber(number) {
  const match = String(number).match(/^(\d+)/u);

  return match ? Number(match[1]) : null;
}

function isSpecial(number) {
  return !/^\d+$/u.test(String(number));
}

function compareArticleKey(articleNumber) {
  const text = String(articleNumber);

  const base = baseNumber(text);

  if (/^\d+$/u.test(text)) {
    return [base, 0, ""];
  }

  if (/^(\d+)\s+مكرر$/u.test(text)) {
    return [base, 1, ""];
  }

  const slashMatch = text.match(/^(\d+)\s+مكرر\/(.+)$/u);

  if (slashMatch) {
    const suffix = slashMatch[2];

    const numeric = Number(suffix);

    if (!Number.isNaN(numeric)) {
      return [base, 2, numeric];
    }

    return [base, 3, suffix];
  }

  return [base, 9, text];
}

// =========================================================
// CLEAN ISSUANCE ARTICLE 6
// =========================================================

const issuance6 = data.issuance_articles?.find(
  (article) => article.article_number === "6",
);

if (!issuance6) {
  throw new Error("Issuance article 6 missing.");
}

const lawTitleMarker = "\nقانون شركات المساهمة";

const lawTitleIndex = issuance6.content_ar?.indexOf(lawTitleMarker);

if (lawTitleIndex !== undefined && lawTitleIndex !== -1) {
  issuance6.content_ar = issuance6.content_ar.slice(0, lawTitleIndex).trim();
}

// =========================================================
// LEGAL STATUS
// =========================================================

const repealedMap = new Map([
  [
    "21 مكرر",
    "أضيفت المادة بالقانون رقم 212 لسنة 1994 ثم ألغيت بالقانون رقم 3 لسنة 1998.",
  ],

  ["22", "ملغاة بالقانون رقم 3 لسنة 1998."],

  ["23", "ملغاة بالقانون رقم 3 لسنة 1998."],

  ["36", "ملغاة بالقانون رقم 3 لسنة 1998."],

  ["83", "ملغاة بالقانون رقم 94 لسنة 2005."],

  ["91", "ملغاة بالقانون رقم 94 لسنة 2005."],

  [
    "92",
    "ملغاة وفقًا لملاحظة المصدر المرتبطة بالتعديل بالقانون رقم 3 لسنة 1998.",
  ],

  ["93", "ملغاة بالقانون رقم 94 لسنة 2005."],

  [
    "94",
    "ملغاة بالقانون رقم 194 لسنة 2020 بإصدار قانون البنك المركزي والجهاز المصرفي.",
  ],

  ["183", "ملغاة وفقًا لملاحظة المصدر."],
]);

// Reset legal notes first

for (const article of data.articles) {
  article.legal_note = null;

  if (repealedMap.has(article.article_number)) {
    article.status = "repealed";

    article.legal_note = repealedMap.get(article.article_number);
  } else {
    article.status = "active";
  }
}

// =========================================================
// ARTICLE 17 CONSTITUTIONAL NOTE
// =========================================================

const article17 = getArticle(17);

if (!article17) {
  throw new Error("Article 17 missing.");
}

article17.status = "active";

article17.legal_note =
  "قضت المحكمة الدستورية العليا بجلسة 5/5/2001 في القضية رقم 25 لسنة 22 قضائية دستورية بعدم دستورية البند (ب) من المادة 17 فيما تضمنه من اشتراط موافقة مجلس الوزراء على تأسيس الشركة التي يكون غرضها أو من بين أغراضها إصدار الصحف.";

// =========================================================
// FIX HIERARCHY
// =========================================================
//
// PART 1
//
// الباب الأول – أحكام عامة
//
// Chapter 1: Articles 1 → 6
// Chapter 2: Articles 7 → 30
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 1 && n <= 30) {
    article.part_title = "الباب الأول – أحكام عامة";

    if (n <= 6) {
      article.chapter_title =
        "الفصل الأول – الشركات الخاضعة لأحكام هذا القانون";
    } else {
      article.chapter_title = "الفصل الثاني – التأسيس";
    }
  }
}

// =========================================================
// PART 2
// =========================================================
//
// الباب الثاني – الأحكام الخاصة بأنواع الشركات
//
// Chapter 1: 31 → 109
// Chapter 2: 110 → 115
// Chapter 3: 116 → 129
// Chapter 4: 129 مكرر → 129 مكرر/9
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 31 && n <= 129) {
    article.part_title = "الباب الثاني – الأحكام الخاصة بأنواع الشركات";
  }

  if (n >= 31 && n <= 109) {
    article.chapter_title = "الفصل الأول – شركات المساهمة";
  }

  if (n >= 110 && n <= 115) {
    article.chapter_title = "الفصل الثاني – شركات التوصية بالأسهم";
  }

  if (
    n >= 116 &&
    n <= 129 &&
    !String(article.article_number).startsWith("129 مكرر")
  ) {
    article.chapter_title = "الفصل الثالث – الشركات ذات المسئولية المحدودة";
  }

  if (
    String(article.article_number) === "129 مكرر" ||
    String(article.article_number).startsWith("129 مكرر/")
  ) {
    article.chapter_title = "الفصل الرابع – شركات الشخص الواحد";
  }
}

// =========================================================
// PART 3
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 130 && n <= 136) {
    article.part_title = "الباب الثالث – الاندماج وتغيير شكل الشركة";

    article.chapter_title = null;
  }
}

// =========================================================
// PART 4
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 137 && n <= 154) {
    article.part_title = "الباب الرابع – تصفية الشركة";

    article.chapter_title = null;
  }
}

// =========================================================
// PART 5
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 155 && n <= 164) {
    article.part_title = "الباب الخامس – الرقابة والتفتيش والجزاءات";

    article.chapter_title = null;
  }
}

// =========================================================
// PART 6
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 165 && n <= 173) {
    article.part_title =
      "الباب السادس – فروع ومكاتب تمثيل الشركات الأجنبية في مصر";

    article.chapter_title = null;
  }
}

// =========================================================
// PART 7
// =========================================================

for (const article of data.articles) {
  const n = baseNumber(article.article_number);

  if (n >= 174 && n <= 184) {
    article.part_title = "الباب السابع – أحكام ختامية";

    article.chapter_title = null;
  }
}

// =========================================================
// REMOVE ACCIDENTAL INLINE SUBHEADINGS
// =========================================================
//
// Some lines such as:
//
// (ثانيًا) إجراءات التأسيس
// (ثالثًا) أحكام خاصة...
//
// were appended to the previous article.
// Remove only these known heading lines.
// =========================================================

const headingPatterns = [
  /^\(ثانيًا\)\s*اجراءات التأسيس\s*$/u,

  /^\(ثالثًا\)\s*أحكام خاصة بتأسيس أنواع الشركات\s*$/u,

  /^\(1\)\s*شركات المساهمة والتوصية بالأسهم\s*$/u,

  /^\(2\)\s*الشركات ذات المسئولية المحدودة\s*$/u,
];

for (const article of data.articles) {
  if (!article.content_ar) {
    continue;
  }

  const lines = article.content_ar
    .split("\n")
    .filter(
      (line) => !headingPatterns.some((pattern) => pattern.test(line.trim())),
    );

  article.content_ar = cleanText(lines.join("\n"));
}

// =========================================================
// CLEAN ARTICLE 184 SOURCE NOTE
// =========================================================

const article184 = getArticle(184);

if (!article184) {
  throw new Error("Article 184 missing.");
}

let sourceFootnotes = article184.source_note ?? "";

const footerMarkers = [
  "\nشارك المقالة",
  "\nShare this content",
  "\nYou Might Also Like",
  "\nThis Post Has One Comment",
  "\nاترك تعليقاً",
  "\nقانون رقم 159 لسنة 1981 بإصدار",
];

let cutIndex = -1;

for (const marker of footerMarkers) {
  const index = sourceFootnotes.indexOf(marker);

  if (index !== -1 && (cutIndex === -1 || index < cutIndex)) {
    cutIndex = index;
  }
}

if (cutIndex !== -1) {
  sourceFootnotes = sourceFootnotes.slice(0, cutIndex);
}

sourceFootnotes = cleanText(sourceFootnotes);

article184.source_note = null;

// =========================================================
// STORE SOURCE NOTES AT LAW LEVEL
// =========================================================

data.source_notes = {
  title: "ملاحظات التعديلات الواردة بالمصدر",

  content: sourceFootnotes,
};

// =========================================================
// REMOVE source_note FROM ARTICLES
// =========================================================

for (const article of data.articles) {
  delete article.source_note;
}

// =========================================================
// ORDER VALIDATION
// =========================================================

const sorted = [...data.articles];

for (let index = 0; index < sorted.length; index++) {
  sorted[index].article_order = index + 1;
}

// =========================================================
// COUNTS
// =========================================================

const active = data.articles.filter((article) => article.status === "active");

const repealed = data.articles.filter(
  (article) => article.status === "repealed",
);

const unconstitutional = data.articles.filter(
  (article) => article.status === "unconstitutional",
);

const special = data.articles.filter((article) =>
  isSpecial(article.article_number),
);

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

const duplicates = data.articles
  .map((article) => article.article_number)
  .filter((number, index, array) => array.indexOf(number) !== index);

const emptyActive = active
  .filter((article) => !article.content_ar)
  .map((article) => article.article_number);

// =========================================================
// REPEALED CHECK
// =========================================================

const expectedRepealed = [
  "21 مكرر",
  "22",
  "23",
  "36",
  "83",
  "91",
  "92",
  "93",
  "94",
  "183",
];

const missingRepealed = expectedRepealed.filter((number) => {
  const article = getArticle(number);

  return !article || article.status !== "repealed";
});

// =========================================================
// FOOTER CONTAMINATION CHECK
// =========================================================

const contamination = [];

const contaminationMarkers = [
  "شارك المقالة",
  "Share this content",
  "You Might Also Like",
  "This Post Has One Comment",
  "Enter your email address",
];

for (const article of data.articles) {
  for (const marker of contaminationMarkers) {
    if (article.content_ar?.includes(marker)) {
      contamination.push(article.article_number);
    }
  }
}

// =========================================================
// PROBLEMS
// =========================================================

const problems = [];

if (data.articles.length !== EXPECTED.total) {
  problems.push(`Expected ${EXPECTED.total} rows, got ${data.articles.length}`);
}

if (active.length !== EXPECTED.active) {
  problems.push(`Expected ${EXPECTED.active} active, got ${active.length}`);
}

if (repealed.length !== EXPECTED.repealed) {
  problems.push(
    `Expected ${EXPECTED.repealed} repealed, got ${repealed.length}`,
  );
}

if (unconstitutional.length !== EXPECTED.unconstitutional) {
  problems.push(
    `Expected ${EXPECTED.unconstitutional} unconstitutional, got ${unconstitutional.length}`,
  );
}

if (special.length !== EXPECTED.special) {
  problems.push(
    `Expected ${EXPECTED.special} special articles, got ${special.length}`,
  );
}

if (parts.length !== EXPECTED.parts) {
  problems.push(`Expected ${EXPECTED.parts} parts, got ${parts.length}`);
}

if (chapters.length !== EXPECTED.chapters) {
  problems.push(
    `Expected ${EXPECTED.chapters} chapters, got ${chapters.length}`,
  );
}

if (duplicates.length) {
  problems.push(`Duplicates: ${[...new Set(duplicates)].join(", ")}`);
}

if (emptyActive.length) {
  problems.push(`Empty active articles: ${emptyActive.join(", ")}`);
}

if (missingRepealed.length) {
  problems.push(`Missing repealed status: ${missingRepealed.join(", ")}`);
}

if (contamination.length) {
  problems.push(`Contamination: ${[...new Set(contamination)].join(", ")}`);
}

// =========================================================
// FINAL VALIDATION
// =========================================================

data.cleaned_at = new Date().toISOString();

data.cleanup_applied = true;

data.validation = {
  first_article: data.articles[0]?.article_number ?? null,

  last_article: data.articles[data.articles.length - 1]?.article_number ?? null,

  total_articles: data.articles.length,

  active_articles: active.length,

  repealed_articles: repealed.length,

  unconstitutional_articles: unconstitutional.length,

  special_articles_count: special.length,

  special_articles: special.map((article) => article.article_number),

  repealed_article_numbers: repealed.map((article) => article.article_number),

  parts: parts,

  parts_count: parts.length,

  chapters: chapters,

  chapters_count: chapters.length,

  empty_active_articles: emptyActive,

  duplicate_article_numbers: [...new Set(duplicates)],

  missing_repealed_status: missingRepealed,

  contamination_articles: [...new Set(contamination)],

  article_17_partial_constitutional_ruling: Boolean(article17.legal_note),

  source_notes_preserved: Boolean(sourceFootnotes),

  problems,
};

// =========================================================
// SAVE
// =========================================================

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");

// =========================================================
// SUMMARY
// =========================================================

console.log(`Total articles: ${data.articles.length}`);

console.log(`Active articles: ${active.length}`);

console.log(`Repealed articles: ${repealed.length}`);

console.log(`Unconstitutional articles: ${unconstitutional.length}`);

console.log("");

console.log(`Special/mكرر articles: ${special.length}`);

console.log("");

console.log(`Parts: ${parts.length}`);

for (const part of parts) {
  console.log(`- ${part}`);
}

console.log("");

console.log(`Chapters: ${chapters.length}`);

for (const chapter of chapters) {
  console.log(`- ${chapter}`);
}

console.log("");

console.log(`Article 17 legal note: ${article17.legal_note ? "✅" : "❌"}`);

console.log(`Source notes preserved: ${sourceFootnotes ? "✅" : "❌"}`);

console.log("");

console.log(
  `Missing repealed statuses: ${
    missingRepealed.length ? missingRepealed.join(", ") : "None"
  }`,
);

console.log(
  `Empty active articles: ${
    emptyActive.length ? emptyActive.join(", ") : "None"
  }`,
);

console.log(
  `Duplicates: ${
    duplicates.length ? [...new Set(duplicates)].join(", ") : "None"
  }`,
);

console.log(
  `Contamination: ${
    contamination.length ? [...new Set(contamination)].join(", ") : "None"
  }`,
);

console.log(`Problems: ${problems.length ? problems.join(" | ") : "None"}`);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
