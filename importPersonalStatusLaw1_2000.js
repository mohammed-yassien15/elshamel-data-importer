import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "personal-status-law-1-2000-final.json";

const EXPECTED = {
  lawNumber: "1",
  lawYear: 2000,

  total: 80,
  active: 79,
  repealed: 0,
  unconstitutional: 1,

  first: "1",
  last: "79",

  unconstitutionalArticle: "21",

  specialArticles: ["76 مكررا"],
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

console.log("PERSONAL STATUS PROCEDURE LAW 1/2000 IMPORT");

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
  throw new Error(`Duplicate article numbers: ${duplicates.join(", ")}`);
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
//
// Only article 21 is intentionally null.
// ---------------------------------------------------------

const unexpectedEmpty = data.articles.filter(
  (article) => !article.content_ar && article.article_number !== "21",
);

if (unexpectedEmpty.length) {
  throw new Error(
    `Unexpected empty articles: ${unexpectedEmpty
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// ARTICLE 21
// ---------------------------------------------------------

const article21 = findArticle(data.articles, "21");

if (!article21) {
  throw new Error("Article 21 missing.");
}

if (article21.status !== "unconstitutional") {
  throw new Error("Article 21 must be unconstitutional.");
}

if (article21.content_ar !== null) {
  throw new Error("Article 21 content should be null.");
}

// ---------------------------------------------------------
// 76 مكررا
// ---------------------------------------------------------

const article76Repeat = findArticle(data.articles, "76 مكررا");

if (!article76Repeat) {
  throw new Error("76 مكررا missing.");
}

if (article76Repeat.status !== "active") {
  throw new Error("76 مكررا should be active.");
}

// ---------------------------------------------------------
// HIERARCHY
// ---------------------------------------------------------

const hierarchyChecks = [
  ["1", "الباب الأول", null, null],

  ["9", "الباب الثاني", "الفصل الأول", null],

  ["15", "الباب الثاني", "الفصل الثاني", null],

  ["16", "الباب الثالث", "الفصل الأول", null],

  ["26", "الباب الثالث", "الفصل الثاني", null],

  ["52", "الباب الرابع", null, null],

  ["56", "الباب الرابع", null, "ثانياً – الطعن على الأحكام والقرارات"],

  ["64", "الباب الرابع", null, "ثانياً – الطعن على الأحكام والقرارات"],

  ["65", "الباب الخامس", null, null],
];

for (const [number, part, chapter, section] of hierarchyChecks) {
  const article = findArticle(data.articles, number);

  if (!article) {
    throw new Error(`Hierarchy anchor missing: ${number}`);
  }

  if (article.part_title !== part) {
    throw new Error(`Part mismatch at article ${number}`);
  }

  if (article.chapter_title !== chapter) {
    throw new Error(`Chapter mismatch at article ${number}`);
  }

  if (article.section_title !== section) {
    throw new Error(`Section mismatch at article ${number}`);
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

  sort_order: 8,
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

  content_ar: article.content_ar,

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

  console.log(`Imported ${imported}/${articleRows.length}`);
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
        content_ar,
        part_title,
        chapter_title,
        section_title
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
// POST IMPORT CHECKS
// =========================================================

const dbActive = dbArticles.filter((article) => article.status === "active");

const dbRepealed = dbArticles.filter(
  (article) => article.status === "repealed",
);

const dbUnconstitutional = dbArticles.filter(
  (article) => article.status === "unconstitutional",
);

const db21 = findArticle(dbArticles, "21");

const db76Repeat = findArticle(dbArticles, "76 مكررا");

const dbFirst = dbArticles[0];

const dbLast = dbArticles[dbArticles.length - 1];

const problems = [];

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

if (db21?.status !== "unconstitutional") {
  problems.push("Article 21 status incorrect");
}

if (db21?.content_ar !== null) {
  problems.push("Article 21 content should be null");
}

if (db76Repeat?.status !== "active") {
  problems.push("76 مكررا status incorrect");
}

if (dbFirst?.article_number !== "1" || dbFirst?.article_order !== 1) {
  problems.push("First article incorrect");
}

if (dbLast?.article_number !== "79" || dbLast?.article_order !== 80) {
  problems.push("Last article incorrect");
}

for (const [number, part, chapter, section] of hierarchyChecks) {
  const article = findArticle(dbArticles, number);

  if (
    article?.part_title !== part ||
    article?.chapter_title !== chapter ||
    article?.section_title !== section
  ) {
    problems.push(`Hierarchy incorrect at article ${number}`);
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

console.log(`Article 21: ${db21?.status}`);

console.log(
  `Article 21 content: ${db21?.content_ar === null ? "null" : "NOT NULL"}`,
);

console.log(`76 مكررا: ${db76Repeat?.status}`);

console.log("");

for (const [number] of hierarchyChecks) {
  const article = findArticle(dbArticles, number);

  console.log(
    `Article ${number}: ${article?.part_title} / ${article?.chapter_title ?? "-"} / ${article?.section_title ?? "-"}`,
  );
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
