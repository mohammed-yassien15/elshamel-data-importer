import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "personal-status-law-25-1929-final.json";

const EXPECTED = {
  lawNumber: "25",
  lawYear: 1929,

  total: 34,
  active: 33,
  repealed: 0,
  unconstitutional: 1,

  first: "1",
  last: "25",

  unconstitutionalArticle: "18 مكررا ثالثا",

  specialArticles: [
    "5 مكررا",
    "6 مكررا",
    "6 مكررا ثانيا",
    "11 مكررا",
    "11 مكررا ثانيا",
    "18 مكررا",
    "18 مكررا ثانيا",
    "18 مكررا ثالثا",
    "23 مكررا",
  ],
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

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === number);
}

function unique(values) {
  return [...new Set(values)];
}

// =========================================================
// START
// =========================================================

console.log("");

console.log("==============================");

console.log("PERSONAL STATUS LAW 25/1929 IMPORT");

console.log("==============================");

console.log("");

console.log(`Input articles: ${data.articles.length}`);

// =========================================================
// METADATA
// =========================================================

if (String(data.law.law_number) !== EXPECTED.lawNumber) {
  throw new Error(`Unexpected law number: ${data.law.law_number}`);
}

if (Number(data.law.law_year) !== EXPECTED.lawYear) {
  throw new Error(`Unexpected law year: ${data.law.law_year}`);
}

// =========================================================
// PRE-IMPORT VALIDATION
// =========================================================

if (data.articles.length !== EXPECTED.total) {
  throw new Error(
    `Expected ${EXPECTED.total} articles, got ${data.articles.length}`,
  );
}

// ---------------------------------------------------------
// DUPLICATES
// ---------------------------------------------------------

const articleNumbers = data.articles.map((article) => article.article_number);

const duplicates = unique(
  articleNumbers.filter(
    (number, index) => articleNumbers.indexOf(number) !== index,
  ),
);

if (duplicates.length) {
  throw new Error(`Duplicate articles: ${duplicates.join(", ")}`);
}

// ---------------------------------------------------------
// ORDER
// ---------------------------------------------------------

const invalidOrders = data.articles.filter(
  (article, index) => article.article_order !== index + 1,
);

if (invalidOrders.length) {
  throw new Error(
    `Invalid article orders: ${invalidOrders
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// FIRST / LAST
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// STATUS COUNTS
// ---------------------------------------------------------

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

// ---------------------------------------------------------
// INVALID STATUS
// ---------------------------------------------------------

const invalidStatuses = data.articles.filter(
  (article) =>
    !["active", "repealed", "unconstitutional"].includes(article.status),
);

if (invalidStatuses.length) {
  throw new Error(
    `Invalid statuses: ${invalidStatuses
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// EMPTY CONTENT
// ---------------------------------------------------------

const emptyNonRepealed = data.articles.filter(
  (article) =>
    article.status !== "repealed" && !String(article.content_ar || "").trim(),
);

if (emptyNonRepealed.length) {
  throw new Error(
    `Empty articles: ${emptyNonRepealed
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// SPECIAL ARTICLES
// ---------------------------------------------------------

for (const number of EXPECTED.specialArticles) {
  if (!articleNumbers.includes(number)) {
    throw new Error(`Missing special article: ${number}`);
  }
}

// ---------------------------------------------------------
// IMPORTANT STATUS
// ---------------------------------------------------------

const article18Third = findArticle(
  data.articles,
  EXPECTED.unconstitutionalArticle,
);

if (!article18Third) {
  throw new Error("18 مكررا ثالثا missing");
}

if (article18Third.status !== "unconstitutional") {
  throw new Error("18 مكررا ثالثا should be unconstitutional");
}

if (!article18Third.content_ar) {
  throw new Error("18 مكررا ثالثا content missing");
}

// ---------------------------------------------------------
// HIERARCHY ANCHORS
// ---------------------------------------------------------

const hierarchyChecks = [
  ["1", "1 – الطلاق"],

  ["6", "2 – الشقاق بين الزوجين والتطليق للضرر"],

  ["12", "3 – التطليق لغيبة الزوج أو لحبسه"],

  ["15", "4 – دعوى النسب"],

  ["16", "5 – النفقة والعدة"],

  ["19", "6 – المهر"],

  ["20", "7 – سن الحضانة"],

  ["21", "8 – المفقود"],

  ["23", "9 – أحكام عامة"],
];

for (const [articleNumber, expectedPart] of hierarchyChecks) {
  const article = findArticle(data.articles, articleNumber);

  if (!article) {
    throw new Error(`Hierarchy anchor missing: ${articleNumber}`);
  }

  if (article.part_title !== expectedPart) {
    throw new Error(`Hierarchy mismatch at article ${articleNumber}`);
  }
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

  sort_order: 7,
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
// PREPARE ARTICLES
// =========================================================

const articleRows = data.articles.map((article) => ({
  law_id: lawId,

  article_number: article.article_number,

  title_ar: article.title_ar ?? null,

  content_ar: article.status === "repealed" ? null : article.content_ar,

  division_title: article.division_title ?? null,

  book_title: article.book_title ?? null,

  part_title: article.part_title ?? null,

  chapter_title: article.chapter_title ?? null,

  section_title: article.section_title ?? null,

  subsection_title: article.subsection_title ?? null,

  article_order: article.article_order,

  status: article.status,

  is_published: true,
}));

console.log("");
console.log(`Prepared ${articleRows.length} article rows.`);

// =========================================================
// UPSERT
// =========================================================

const { error: articleError } = await supabase
  .from("articles")
  .upsert(articleRows, {
    onConflict: "law_id,article_number",
  });

if (articleError) {
  throw articleError;
}

console.log(`✅ Imported ${articleRows.length}/${articleRows.length}`);

// =========================================================
// VERIFY DATABASE
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
        content_ar,
        part_title
      `,
  )
  .eq("law_id", lawId)
  .order("article_order", {
    ascending: true,
  });

if (verifyError) {
  throw verifyError;
}

const dbActive = dbArticles.filter((article) => article.status === "active");

const dbRepealed = dbArticles.filter(
  (article) => article.status === "repealed",
);

const dbUnconstitutional = dbArticles.filter(
  (article) => article.status === "unconstitutional",
);

const dbFirst = dbArticles[0];

const dbLast = dbArticles[dbArticles.length - 1];

const db18Third = findArticle(dbArticles, "18 مكررا ثالثا");

// =========================================================
// FINAL ASSERTIONS
// =========================================================

const problems = [];

if (dbArticles.length !== EXPECTED.total) {
  problems.push(`Total expected ${EXPECTED.total}, got ${dbArticles.length}`);
}

if (dbActive.length !== EXPECTED.active) {
  problems.push(`Active expected ${EXPECTED.active}, got ${dbActive.length}`);
}

if (dbRepealed.length !== EXPECTED.repealed) {
  problems.push(
    `Repealed expected ${EXPECTED.repealed}, got ${dbRepealed.length}`,
  );
}

if (dbUnconstitutional.length !== EXPECTED.unconstitutional) {
  problems.push(
    `Unconstitutional expected ${EXPECTED.unconstitutional}, got ${dbUnconstitutional.length}`,
  );
}

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

if (db18Third?.status !== "unconstitutional") {
  problems.push("18 مكررا ثالثا status incorrect");
}

if (!db18Third?.content_ar) {
  problems.push("18 مكررا ثالثا content missing");
}

for (const [articleNumber, expectedPart] of hierarchyChecks) {
  const article = findArticle(dbArticles, articleNumber);

  if (article?.part_title !== expectedPart) {
    problems.push(`Hierarchy incorrect at ${articleNumber}`);
  }
}

// =========================================================
// OUTPUT
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

console.log(
  `Unconstitutional article numbers: ${
    dbUnconstitutional.length
      ? dbUnconstitutional.map((article) => article.article_number).join(", ")
      : "None"
  }`,
);

console.log("");

console.log(
  `First: ${dbFirst?.article_number} (order ${dbFirst?.article_order})`,
);

console.log(`Last: ${dbLast?.article_number} (order ${dbLast?.article_order})`);

console.log("");

console.log(`18 مكررا ثالثا: ${db18Third?.status}`);

console.log(
  `18 مكررا ثالثا content preserved: ${db18Third?.content_ar ? "Yes" : "No"}`,
);

console.log("");

for (const [articleNumber] of hierarchyChecks) {
  const article = findArticle(dbArticles, articleNumber);

  console.log(`Article ${articleNumber}: ${article?.part_title}`);
}

console.log("");

if (problems.length) {
  console.log("❌ VERIFICATION FAILED");

  for (const problem of problems) {
    console.log(`- ${problem}`);
  }

  process.exit(1);
}

console.log("✅ Import looks correct.");
