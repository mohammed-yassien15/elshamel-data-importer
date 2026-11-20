import fs from "fs";

const INPUT_FILE = "data/raw/egyptian-penal-code.json";
const OUTPUT_FILE = "data/final/egyptian-penal-code-final.json";

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

function escapeRegExp(text = "") {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function startsWithRepealedText(content = "") {
  return /^ملغا[ةى][.،؛:]?(?:\n|$)/u.test(normalizeText(content));
}

// =========================================================
// LOAD INPUT
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ File not found: ${INPUT_FILE}`);

  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!Array.isArray(data?.articles)) {
  console.error("❌ Invalid JSON: articles array not found.");

  process.exit(1);
}

// =========================================================
// STATS
// =========================================================

const stats = {
  hierarchyFixed: [],
  leakedHeadingsRemoved: [],
  repealedFixed: [],
  editorialNotesRemoved: [],
  artifactsRemoved: [],
};

// =========================================================
// BOOK 4 STRUCTURE
// =========================================================

const BOOK_4_SECTIONS = [
  {
    heading: "المخالفات المتعلقة بالطرق العمومية",

    from: 376,

    to: 376,
  },

  {
    heading: "المخالفات المتعلقة بالأمن العام أو الراحة العمومية",

    from: 377,

    to: 380,
  },

  {
    heading: "المخالفات المتعلقة بالصحة العمومية",

    from: 381,

    to: 384,
  },

  {
    heading: "المخالفات المتعلقة بالآداب",

    from: 385,

    to: 385,
  },

  {
    heading: "المخالفات المتعلقة بالسلطة العمومية",

    from: 386,

    to: 386,
  },

  {
    heading: "المخالفات المتعلقة بالأملاك",

    from: 387,

    to: 389,
  },

  {
    heading: "المخالفات المتعلقة بالموازين والمقاييس",

    from: 390,

    to: 390,
  },

  {
    heading: "المخالفات المتعلقة بالأشخاص",

    from: 391,

    to: 394,
  },

  {
    heading: "المخالفات المنصوص عنها في اللوائح الخصوصية",

    from: 395,

    to: 395,
  },
];

// =========================================================
// HEADINGS LEAKED INTO PREVIOUS ARTICLE
// =========================================================

const LEAKED_HEADINGS = [
  {
    article: "376",

    heading: "المخالفات المتعلقة بالأمن العام أو الراحة العمومية",
  },

  {
    article: "380",

    heading: "المخالفات المتعلقة بالصحة العمومية",
  },

  {
    article: "384",

    heading: "المخالفات المتعلقة بالآداب",
  },

  {
    article: "385",

    heading: "المخالفات المتعلقة بالسلطة العمومية",
  },

  {
    article: "386",

    heading: "المخالفات المتعلقة بالأملاك",
  },

  {
    article: "389",

    heading: "المخالفات المتعلقة بالموازين والمقاييس",
  },

  {
    article: "390",

    heading: "المخالفات المتعلقة بالأشخاص",
  },

  {
    article: "394",

    heading: "المخالفات المنصوص عنها في اللوائح الخصوصية",
  },
];

// =========================================================
// CLEAN ARTICLES
// =========================================================

const articles = data.articles.map((article) => {
  const cleaned = {
    ...article,
  };

  // -----------------------------------------------------
  // NORMALIZE BASIC VALUES
  // -----------------------------------------------------

  cleaned.article_number = String(cleaned.article_number).trim();

  cleaned.article_order = Number(cleaned.article_order);

  cleaned.content_ar = normalizeNullableText(cleaned.content_ar);

  cleaned.division_title = normalizeNullableText(cleaned.division_title);

  cleaned.book_title = normalizeNullableText(cleaned.book_title);

  cleaned.part_title = normalizeNullableText(cleaned.part_title);

  cleaned.chapter_title = normalizeNullableText(cleaned.chapter_title);

  cleaned.section_title = normalizeNullableText(cleaned.section_title);

  cleaned.subsection_title = normalizeNullableText(cleaned.subsection_title);

  cleaned.title_ar = normalizeNullableText(cleaned.title_ar);

  cleaned.status = cleaned.status || "active";

  // =====================================================
  // BOOK 1
  // =====================================================

  if (cleaned.book_title === "الكتاب الأول أحكام ابتدائية") {
    cleaned.book_title = "الكتاب الأول: أحكام ابتدائية";

    stats.hierarchyFixed.push(cleaned.article_number);
  }

  // Some scraped records contained:
  //
  // الكتاب الأول: أحكام ابتدائية: الباب الثالث: العقوبات
  //
  // Split it without overwriting an existing valid part.
  if (
    cleaned.book_title ===
    "الكتاب الأول: أحكام ابتدائية: الباب الثالث: العقوبات"
  ) {
    cleaned.book_title = "الكتاب الأول: أحكام ابتدائية";

    if (!cleaned.part_title) {
      cleaned.part_title = "الباب الثالث: العقوبات";
    }

    stats.hierarchyFixed.push(cleaned.article_number);
  }

  // =====================================================
  // BOOK 2
  // =====================================================

  if (cleaned.book_title === "الكتاب الثاني") {
    cleaned.book_title =
      "الكتاب الثاني: الجنايات والجنح المضرة بالمصلحة العمومية وبيان عقوباته";

    stats.hierarchyFixed.push(cleaned.article_number);
  }

  // Important:
  // Do NOT identify articles manually.
  // Any article that already belongs to "الباب الأول"
  // gets the complete title.
  if (
    cleaned.book_title ===
      "الكتاب الثاني: الجنايات والجنح المضرة بالمصلحة العمومية وبيان عقوباته" &&
    cleaned.part_title === "الباب الأول"
  ) {
    cleaned.part_title =
      "الباب الأول: الجنايات المضرة بأمن الحكومة من جهة الخارج";

    stats.hierarchyFixed.push(cleaned.article_number);
  }

  // =====================================================
  // BOOK 3
  // =====================================================

  if (cleaned.book_title === "الكتاب الثالث") {
    cleaned.book_title = "الكتاب الثالث: الجنايات والجنح التي تحصل لآحاد الناس";

    stats.hierarchyFixed.push(cleaned.article_number);
  }

  // =====================================================
  // BOOK 4
  // =====================================================

  if (cleaned.book_title === "الكتاب الرابع") {
    cleaned.book_title = "الكتاب الرابع: المخالفات";

    stats.hierarchyFixed.push(cleaned.article_number);
  }

  // =====================================================
  // REMOVE LEAKED HEADINGS
  // =====================================================

  for (const item of LEAKED_HEADINGS) {
    if (cleaned.article_number === item.article && cleaned.content_ar) {
      const before = cleaned.content_ar;

      cleaned.content_ar = cleaned.content_ar
        .replace(new RegExp(`\\n?${escapeRegExp(item.heading)}\\s*$`, "u"), "")
        .trim();

      if (before !== cleaned.content_ar) {
        stats.leakedHeadingsRemoved.push(cleaned.article_number);
      }
    }
  }

  // =====================================================
  // REMOVE EDITORIAL NOTES
  // =====================================================

  const editorialPatterns = [
    // Article 48
    /\n?\(مقضي بعدم دستوريتها بمقتضى حكم المحكمة الدستورية العليا[^)]*\)\s*$/u,

    // Example: Article 186 مكرر
    /\n?\(مضافة بالقانون\s+\d+\s+لسنة\s+\d+\)\s*$/u,

    // Example: Article 293
    /\n?التعديل الأخير بموجب القانون\s+\d+\s+لسنة\s+\d+\s*$/u,
  ];

  if (cleaned.content_ar) {
    for (const pattern of editorialPatterns) {
      const before = cleaned.content_ar;

      cleaned.content_ar = cleaned.content_ar.replace(pattern, "").trim();

      if (before !== cleaned.content_ar) {
        stats.editorialNotesRemoved.push(cleaned.article_number);
      }
    }
  }

  // =====================================================
  // ARTICLE 60 STRAY ]
  // =====================================================

  if (cleaned.article_number === "60" && cleaned.content_ar) {
    const before = cleaned.content_ar;

    cleaned.content_ar = cleaned.content_ar.replace(/\]\s*$/u, "").trim();

    if (before !== cleaned.content_ar) {
      stats.artifactsRemoved.push(cleaned.article_number);
    }
  }

  // =====================================================
  // REPEALED DETECTION
  // =====================================================

  if (cleaned.content_ar && startsWithRepealedText(cleaned.content_ar)) {
    cleaned.status = "repealed";

    cleaned.content_ar = null;

    stats.repealedFixed.push(cleaned.article_number);
  }

  return cleaned;
});

// =========================================================
// APPLY EXACT BOOK 4 SECTIONS
// =========================================================

for (const article of articles) {
  const number = Number(article.article_number);

  if (!Number.isInteger(number)) {
    continue;
  }

  for (const section of BOOK_4_SECTIONS) {
    if (number >= section.from && number <= section.to) {
      article.section_title = section.heading;
    }
  }
}

// =========================================================
// RECALCULATE ORDER
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
// EMPTY ACTIVE
// ---------------------------------------------------------

const emptyActiveArticles = articles
  .filter((article) => article.status === "active" && !article.content_ar)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID STATUSES
// ---------------------------------------------------------

const invalidStatuses = articles
  .filter((article) => !["active", "repealed"].includes(article.status))
  .map((article) => article.article_number);

// ---------------------------------------------------------
// INVALID ARTICLE ORDER
// ---------------------------------------------------------

const invalidOrders = articles
  .filter((article, index) => article.article_order !== index + 1)
  .map((article) => article.article_number);

// ---------------------------------------------------------
// BASE NUMERIC ARTICLES 1 → 395
// ---------------------------------------------------------

const numericBaseNumbers = new Set(
  articles
    .map((article) => article.article_number)
    .filter((number) => /^\d+$/u.test(number))
    .map(Number),
);

const missingNumericArticles = [];

for (let number = 1; number <= 395; number++) {
  if (!numericBaseNumbers.has(number)) {
    missingNumericArticles.push(number);
  }
}

// ---------------------------------------------------------
// SPECIAL ARTICLE NUMBERS
// ---------------------------------------------------------

const specialArticleNumbers = articles
  .map((article) => article.article_number)
  .filter((number) => !/^\d+$/u.test(number));

// ---------------------------------------------------------
// SUSPICIOUS REPEALED CONTENT
// ---------------------------------------------------------

const suspiciousRepealed = articles
  .filter(
    (article) =>
      article.status !== "repealed" &&
      /ملغا[ةى]/u.test(article.content_ar || ""),
  )
  .map((article) => article.article_number);

// ---------------------------------------------------------
// EDITORIAL NOTES STILL PRESENT
// ---------------------------------------------------------

const suspiciousEditorialNotes = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return (
      /مقضي بعدم دستور/u.test(content) ||
      /مضافة بالقانون/u.test(content) ||
      /التعديل الأخير بموجب القانون/u.test(content)
    );
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// ARTIFACTS
// ---------------------------------------------------------

const suspiciousArtifacts = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return /\$1/u.test(content) || /\]\s*$/u.test(content);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// LEAKED BOOK 4 HEADINGS
// ---------------------------------------------------------

const leakedHeadings = articles
  .filter((article) => {
    const content = article.content_ar || "";

    return LEAKED_HEADINGS.some((item) => content.includes(item.heading));
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// COMPOSITE BOOK/BAB ERROR
// ---------------------------------------------------------

const suspiciousCompositeHierarchy = articles
  .filter((article) => {
    return article.book_title && /الكتاب.+الباب/u.test(article.book_title);
  })
  .map((article) => article.article_number);

// ---------------------------------------------------------
// BOOK 4 SECTION VALIDATION
// ---------------------------------------------------------

const book4SectionProblems = [];

for (const section of BOOK_4_SECTIONS) {
  for (const article of articles) {
    const number = Number(article.article_number);

    if (
      Number.isInteger(number) &&
      number >= section.from &&
      number <= section.to &&
      article.section_title !== section.heading
    ) {
      book4SectionProblems.push(article.article_number);
    }
  }
}

// =========================================================
// EXTRA HIERARCHY VALIDATION
// =========================================================

// Articles after 39 must NOT stay in باب الثالث
// once their original raw part title changes.
const suspiciousBook1Hierarchy = articles
  .filter((article) => {
    const number = Number(article.article_number);

    if (!Number.isInteger(number)) {
      return false;
    }

    return (
      number >= 39 &&
      article.book_title === "الكتاب الأول: أحكام ابتدائية" &&
      article.part_title === "الباب الثالث: العقوبات"
    );
  })
  .map((article) => article.article_number);

// Book 2 should not contain plain "الباب الأول"
const incompleteBook2BabOne = articles
  .filter((article) => {
    return (
      article.book_title ===
        "الكتاب الثاني: الجنايات والجنح المضرة بالمصلحة العمومية وبيان عقوباته" &&
      article.part_title === "الباب الأول"
    );
  })
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

    duplicate_article_numbers_count: [...new Set(duplicates)].length,

    empty_active_articles: emptyActiveArticles,

    empty_active_articles_count: emptyActiveArticles.length,

    special_article_numbers: specialArticleNumbers,

    special_article_numbers_count: specialArticleNumbers.length,

    missing_numeric_articles: missingNumericArticles,

    missing_numeric_articles_count: missingNumericArticles.length,

    invalid_article_orders: invalidOrders,

    invalid_article_orders_count: invalidOrders.length,

    invalid_statuses: invalidStatuses,

    invalid_statuses_count: invalidStatuses.length,

    suspicious_repealed_text: suspiciousRepealed,

    suspicious_repealed_text_count: suspiciousRepealed.length,

    suspicious_editorial_notes: suspiciousEditorialNotes,

    suspicious_editorial_notes_count: suspiciousEditorialNotes.length,

    suspicious_artifacts: suspiciousArtifacts,

    suspicious_artifacts_count: suspiciousArtifacts.length,

    leaked_headings: leakedHeadings,

    leaked_headings_count: leakedHeadings.length,

    suspicious_composite_hierarchy: suspiciousCompositeHierarchy,

    suspicious_composite_hierarchy_count: suspiciousCompositeHierarchy.length,

    book4_section_problems: book4SectionProblems,

    book4_section_problems_count: book4SectionProblems.length,

    suspicious_book1_hierarchy: suspiciousBook1Hierarchy,

    suspicious_book1_hierarchy_count: suspiciousBook1Hierarchy.length,

    incomplete_book2_bab_one: incompleteBook2BabOne,

    incomplete_book2_bab_one_count: incompleteBook2BabOne.length,
  },

  cleanup_stats: {
    hierarchy_fixed: [...new Set(stats.hierarchyFixed)],

    hierarchy_fixed_count: [...new Set(stats.hierarchyFixed)].length,

    leaked_headings_removed: [...new Set(stats.leakedHeadingsRemoved)],

    leaked_headings_removed_count: [...new Set(stats.leakedHeadingsRemoved)]
      .length,

    repealed_fixed: [...new Set(stats.repealedFixed)],

    repealed_fixed_count: [...new Set(stats.repealedFixed)].length,

    editorial_notes_removed: [...new Set(stats.editorialNotesRemoved)],

    editorial_notes_removed_count: [...new Set(stats.editorialNotesRemoved)]
      .length,

    artifacts_removed: [...new Set(stats.artifactsRemoved)],

    artifacts_removed_count: [...new Set(stats.artifactsRemoved)].length,
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

console.log(`Total articles: ${articles.length}`);

console.log(`Active articles: ${activeArticles.length}`);

console.log(`Repealed articles: ${repealedArticles.length}`);

console.log(`Hierarchy fixed: ${[...new Set(stats.hierarchyFixed)].length}`);

console.log(
  `Leaked headings removed from: ${
    stats.leakedHeadingsRemoved.length
      ? [...new Set(stats.leakedHeadingsRemoved)].join(", ")
      : "None"
  }`,
);

console.log(
  `Repealed statuses fixed: ${
    stats.repealedFixed.length
      ? [...new Set(stats.repealedFixed)].join(", ")
      : "None"
  }`,
);

console.log(
  `Editorial notes removed from: ${
    stats.editorialNotesRemoved.length
      ? [...new Set(stats.editorialNotesRemoved)].join(", ")
      : "None"
  }`,
);

console.log(
  `Artifacts removed from: ${
    stats.artifactsRemoved.length
      ? [...new Set(stats.artifactsRemoved)].join(", ")
      : "None"
  }`,
);

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
  `Missing numeric articles: ${
    missingNumericArticles.length ? missingNumericArticles.join(", ") : "None"
  }`,
);

console.log(`Special article numbers: ${specialArticleNumbers.length}`);

console.log(
  `Empty active articles: ${
    emptyActiveArticles.length ? emptyActiveArticles.join(", ") : "None"
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
  `Suspicious repealed text: ${
    suspiciousRepealed.length ? suspiciousRepealed.join(", ") : "None"
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
  `Suspicious artifacts: ${
    suspiciousArtifacts.length ? suspiciousArtifacts.join(", ") : "None"
  }`,
);

console.log(
  `Leaked headings: ${
    leakedHeadings.length ? leakedHeadings.join(", ") : "None"
  }`,
);

console.log(
  `Composite hierarchy problems: ${
    suspiciousCompositeHierarchy.length
      ? suspiciousCompositeHierarchy.join(", ")
      : "None"
  }`,
);

console.log(
  `Book 4 section problems: ${
    book4SectionProblems.length ? book4SectionProblems.join(", ") : "None"
  }`,
);

console.log(
  `Suspicious Book 1 hierarchy: ${
    suspiciousBook1Hierarchy.length
      ? suspiciousBook1Hierarchy.join(", ")
      : "None"
  }`,
);

console.log(
  `Incomplete Book 2 Bab 1: ${
    incompleteBook2BabOne.length ? incompleteBook2BabOne.join(", ") : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
