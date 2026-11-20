import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "data/final/companies-law-159-1981-final.json";

const EXPECTED = {
  lawNumber: "159",
  lawYear: 1981,

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
// ENV
// =========================================================

const SUPABASE_URL = process.env.SUPABASE_URL;

const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL in .env");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// =========================================================
// LOAD
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!data?.law || !Array.isArray(data.articles)) {
  throw new Error("Invalid JSON structure.");
}

// =========================================================
// HELPERS
// =========================================================

function unique(values) {
  return [...new Set(values)];
}

function getArticle(number) {
  return data.articles.find(
    (article) => article.article_number === String(number),
  );
}

function isSpecial(number) {
  return !/^\d+$/u.test(String(number));
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("COMPANIES LAW 159/1981 IMPORT");

console.log("==============================");

console.log("");

console.log(`Input rows: ${data.articles.length}`);

// =========================================================
// LAW CHECK
// =========================================================

if (String(data.law.law_number) !== EXPECTED.lawNumber) {
  throw new Error(`Unexpected law number: ${data.law.law_number}`);
}

if (Number(data.law.law_year) !== EXPECTED.lawYear) {
  throw new Error(`Unexpected law year: ${data.law.law_year}`);
}

if (data.articles.length !== EXPECTED.total) {
  throw new Error(
    `Expected ${EXPECTED.total} rows, got ${data.articles.length}`,
  );
}

// =========================================================
// DUPLICATES
// =========================================================

const articleNumbers = data.articles.map((article) => article.article_number);

const duplicates = unique(
  articleNumbers.filter(
    (number, index) => articleNumbers.indexOf(number) !== index,
  ),
);

if (duplicates.length) {
  throw new Error(`Duplicate article numbers: ${duplicates.join(", ")}`);
}

// =========================================================
// ARTICLE ORDER
// =========================================================

const invalidOrders = data.articles.filter(
  (article, index) => article.article_order !== index + 1,
);

if (invalidOrders.length) {
  throw new Error(
    `Invalid article_order rows: ${invalidOrders
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// =========================================================
// FIRST / LAST
// =========================================================

if (data.articles[0]?.article_number !== EXPECTED.first) {
  throw new Error(
    `Unexpected first article: ${data.articles[0]?.article_number}`,
  );
}

if (data.articles[data.articles.length - 1]?.article_number !== EXPECTED.last) {
  throw new Error(
    `Unexpected last article: ${
      data.articles[data.articles.length - 1]?.article_number
    }`,
  );
}

// =========================================================
// STATUS COUNTS
// =========================================================

const active = data.articles.filter((article) => article.status === "active");

const repealed = data.articles.filter(
  (article) => article.status === "repealed",
);

const unconstitutional = data.articles.filter(
  (article) => article.status === "unconstitutional",
);

if (active.length !== EXPECTED.active) {
  throw new Error(`Expected ${EXPECTED.active} active, got ${active.length}`);
}

if (repealed.length !== EXPECTED.repealed) {
  throw new Error(
    `Expected ${EXPECTED.repealed} repealed, got ${repealed.length}`,
  );
}

if (unconstitutional.length !== EXPECTED.unconstitutional) {
  throw new Error(
    `Expected ${EXPECTED.unconstitutional} unconstitutional, got ${unconstitutional.length}`,
  );
}

// =========================================================
// SPECIAL ARTICLES
// =========================================================

const special = data.articles.filter((article) =>
  isSpecial(article.article_number),
);

if (special.length !== EXPECTED.special) {
  throw new Error(
    `Expected ${EXPECTED.special} special articles, got ${special.length}`,
  );
}

// =========================================================
// EMPTY ACTIVE ARTICLES
// =========================================================

const emptyActive = active.filter((article) => !article.content_ar);

if (emptyActive.length) {
  throw new Error(
    `Empty active articles: ${emptyActive
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// =========================================================
// HIERARCHY
// =========================================================

const parts = unique(
  data.articles.map((article) => article.part_title).filter(Boolean),
);

const chapters = unique(
  data.articles.map((article) => article.chapter_title).filter(Boolean),
);

if (parts.length !== EXPECTED.parts) {
  throw new Error(`Expected ${EXPECTED.parts} parts, got ${parts.length}`);
}

if (chapters.length !== EXPECTED.chapters) {
  throw new Error(
    `Expected ${EXPECTED.chapters} chapters, got ${chapters.length}`,
  );
}

// =========================================================
// REPEALED ARTICLES CHECK
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

for (const number of expectedRepealed) {
  const article = getArticle(number);

  if (!article) {
    throw new Error(`Missing repealed article: ${number}`);
  }

  if (article.status !== "repealed") {
    throw new Error(`Article ${number} should be repealed.`);
  }
}

// =========================================================
// ARTICLE 17 CHECK
// =========================================================

const article17 = getArticle(17);

if (!article17) {
  throw new Error("Article 17 missing.");
}

if (article17.status !== "active") {
  throw new Error("Article 17 should remain active.");
}

if (!article17.legal_note) {
  throw new Error("Article 17 legal_note missing.");
}

console.log("✅ Pre-import validation passed.");

// =========================================================
// UPSERT LAW
// =========================================================

console.log("");
console.log("Upserting law...");

const lawPayload = {
  title_ar: data.law.title_ar,

  short_title_ar: data.law.short_title_ar ?? null,

  law_number: String(data.law.law_number),

  law_year: Number(data.law.law_year),

  source_name: data.law.source_name ?? null,

  source_url: data.law.source_url ?? null,

  source_reference: data.law.source_reference ?? null,

  is_published: true,

  sort_order: 13,
};

const { data: lawRows, error: lawError } = await supabase
  .from("laws")
  .upsert(lawPayload, {
    onConflict: "law_number,law_year",
  })
  .select("id");

if (lawError) {
  throw lawError;
}

if (!lawRows || lawRows.length !== 1) {
  throw new Error("Could not retrieve law ID.");
}

const lawId = lawRows[0].id;

console.log(`✅ Law ID: ${lawId}`);

// =========================================================
// PREPARE ARTICLE ROWS
// =========================================================

const articleRows = data.articles.map((article) => ({
  law_id: lawId,

  article_number: article.article_number,

  title_ar: article.title_ar ?? null,

  content_ar: article.content_ar ?? null,

  division_title: article.division_title ?? null,

  book_title: article.book_title ?? null,

  part_title: article.part_title ?? null,

  chapter_title: article.chapter_title ?? null,

  section_title: article.section_title ?? null,

  subsection_title: article.subsection_title ?? null,

  article_order: article.article_order,

  status: article.status,

  legal_note: article.legal_note ?? null,

  is_published: true,
}));

console.log("");

console.log(`Prepared ${articleRows.length} article rows.`);

// =========================================================
// IMPORT
// =========================================================

const BATCH_SIZE = 100;

let imported = 0;

for (let start = 0; start < articleRows.length; start += BATCH_SIZE) {
  const batch = articleRows.slice(start, start + BATCH_SIZE);

  const { error } = await supabase.from("articles").upsert(batch, {
    onConflict: "law_id,article_number",
  });

  if (error) {
    throw error;
  }

  imported += batch.length;

  console.log(`✅ Imported ${imported}/${articleRows.length}`);
}

// =========================================================
// VERIFY
// =========================================================

console.log("");
console.log("Verifying import...");

const { data: dbArticles, error: verifyError } = await supabase
  .from("articles")
  .select(
    `
        article_number,
        article_order,
        status,
        legal_note,
        division_title,
        book_title,
        part_title,
        chapter_title,
        section_title,
        subsection_title,
        content_ar
      `,
  )
  .eq("law_id", lawId)
  .order("article_order", {
    ascending: true,
  });

if (verifyError) {
  throw verifyError;
}

// =========================================================
// DB COUNTS
// =========================================================

const dbActive = dbArticles.filter((article) => article.status === "active");

const dbRepealed = dbArticles.filter(
  (article) => article.status === "repealed",
);

const dbUnconstitutional = dbArticles.filter(
  (article) => article.status === "unconstitutional",
);

const dbSpecial = dbArticles.filter((article) =>
  isSpecial(article.article_number),
);

const dbParts = unique(
  dbArticles.map((article) => article.part_title).filter(Boolean),
);

const dbChapters = unique(
  dbArticles.map((article) => article.chapter_title).filter(Boolean),
);

const dbFirst = dbArticles[0];

const dbLast = dbArticles[dbArticles.length - 1];

const problems = [];

// =========================================================
// VERIFY COUNTS
// =========================================================

if (dbArticles.length !== EXPECTED.total) {
  problems.push(`Expected ${EXPECTED.total} total, got ${dbArticles.length}`);
}

if (dbActive.length !== EXPECTED.active) {
  problems.push(`Expected ${EXPECTED.active} active, got ${dbActive.length}`);
}

if (dbRepealed.length !== EXPECTED.repealed) {
  problems.push(
    `Expected ${EXPECTED.repealed} repealed, got ${dbRepealed.length}`,
  );
}

if (dbUnconstitutional.length !== EXPECTED.unconstitutional) {
  problems.push(
    `Expected ${EXPECTED.unconstitutional} unconstitutional, got ${dbUnconstitutional.length}`,
  );
}

if (dbSpecial.length !== EXPECTED.special) {
  problems.push(
    `Expected ${EXPECTED.special} special, got ${dbSpecial.length}`,
  );
}

if (dbParts.length !== EXPECTED.parts) {
  problems.push(`Expected ${EXPECTED.parts} parts, got ${dbParts.length}`);
}

if (dbChapters.length !== EXPECTED.chapters) {
  problems.push(
    `Expected ${EXPECTED.chapters} chapters, got ${dbChapters.length}`,
  );
}

// =========================================================
// VERIFY FIRST / LAST
// =========================================================

if (
  dbFirst?.article_number !== EXPECTED.first ||
  dbFirst?.article_order !== 1
) {
  problems.push("First article incorrect");
}

if (
  dbLast?.article_number !== EXPECTED.last ||
  dbLast?.article_order !== EXPECTED.total
) {
  problems.push("Last article incorrect");
}

// =========================================================
// VERIFY ARTICLE 17
// =========================================================

const db17 = dbArticles.find((article) => article.article_number === "17");

if (db17?.status !== "active") {
  problems.push("Article 17 status incorrect");
}

if (!db17?.legal_note) {
  problems.push("Article 17 legal_note missing");
}

// =========================================================
// VERIFY REPEALED ARTICLES
// =========================================================

for (const number of expectedRepealed) {
  const article = dbArticles.find((item) => item.article_number === number);

  if (!article) {
    problems.push(`Missing article ${number}`);

    continue;
  }

  if (article.status !== "repealed") {
    problems.push(`Article ${number} not repealed`);
  }
}

// =========================================================
// RESULT
// =========================================================

console.log("");

console.log("==============================");

console.log("IMPORT RESULT");

console.log("==============================");

console.log("");

console.log(`Total articles: ${dbArticles.length}`);

console.log(`Active articles: ${dbActive.length}`);

console.log(`Repealed articles: ${dbRepealed.length}`);

console.log(`Unconstitutional articles: ${dbUnconstitutional.length}`);

console.log("");

console.log(`Special/mكرر articles: ${dbSpecial.length}`);

console.log("");

console.log(`Parts: ${dbParts.length}`);

console.log(`Chapters: ${dbChapters.length}`);

console.log("");

console.log(
  `First: ${dbFirst?.article_number} (order ${dbFirst?.article_order})`,
);

console.log(`Last: ${dbLast?.article_number} (order ${dbLast?.article_order})`);

console.log("");

console.log(
  `Article 17: ${db17?.status} + legal_note ${db17?.legal_note ? "✅" : "❌"}`,
);

console.log("");

if (problems.length) {
  console.log("❌ VERIFICATION FAILED");

  for (const problem of problems) {
    console.log(`- ${problem}`);
  }

  process.exit(1);
}

console.log("✅ Import looks correct.");
