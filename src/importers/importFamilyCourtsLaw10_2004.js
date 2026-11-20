import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "data/final/family-courts-law-10-2004-final.json";

const EXPECTED = {
  lawNumber: "10",
  lawYear: 2004,

  total: 15,
  active: 15,
  repealed: 0,
  unconstitutional: 0,

  first: "1",
  last: "15",
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

console.log("FAMILY COURTS LAW 10/2004 IMPORT");

console.log("==============================");

console.log("");

console.log(`Input articles: ${data.articles.length}`);

// =========================================================
// METADATA VALIDATION
// =========================================================

if (String(data.law.law_number) !== EXPECTED.lawNumber) {
  throw new Error(`Unexpected law number: ${data.law.law_number}`);
}

if (Number(data.law.law_year) !== EXPECTED.lawYear) {
  throw new Error(`Unexpected law year: ${data.law.law_year}`);
}

// =========================================================
// COUNT
// =========================================================

if (data.articles.length !== EXPECTED.total) {
  throw new Error(
    `Expected ${EXPECTED.total} articles, got ${data.articles.length}`,
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
// ORDER
// =========================================================

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
// EMPTY CONTENT
// =========================================================

const emptyArticles = data.articles.filter((article) => !article.content_ar);

if (emptyArticles.length) {
  throw new Error(
    `Empty articles: ${emptyArticles
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// =========================================================
// IMPORTANT REFERENCES
// =========================================================

const checks = [
  ["2", "المادة (11)"],

  ["3", "المادة (3)"],

  ["4", "للمادة (65)"],

  ["9", "للمادة (6)"],

  ["9", "المادة (8)"],

  ["11", "المادة (2)"],

  ["12", "المادة (10)"],

  ["14", "المادة (250)"],
];

for (const [number, expectedText] of checks) {
  const article = findArticle(data.articles, number);

  if (!article) {
    throw new Error(`Article ${number} missing.`);
  }

  if (!article.content_ar.includes(expectedText)) {
    throw new Error(
      `Article ${number} missing expected reference: ${expectedText}`,
    );
  }
}

// =========================================================
// ARTICLE 11 FOOTNOTE CHECK
// =========================================================

const article11 = findArticle(data.articles, "11");

if (/\(1\)\s*$/u.test(article11.content_ar)) {
  throw new Error("Article 11 still contains source footnote.");
}

// =========================================================
// PRE-IMPORT PASS
// =========================================================

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

  sort_order: 9,
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
        division_title,
        book_title,
        part_title,
        chapter_title,
        section_title,
        subsection_title
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
// POST IMPORT COUNTS
// =========================================================

const dbActive = dbArticles.filter((article) => article.status === "active");

const dbRepealed = dbArticles.filter(
  (article) => article.status === "repealed",
);

const dbUnconstitutional = dbArticles.filter(
  (article) => article.status === "unconstitutional",
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

// =========================================================
// VERIFY FIRST / LAST
// =========================================================

if (dbFirst?.article_number !== "1" || dbFirst?.article_order !== 1) {
  problems.push("First article incorrect");
}

if (dbLast?.article_number !== "15" || dbLast?.article_order !== 15) {
  problems.push("Last article incorrect");
}

// =========================================================
// VERIFY REFERENCES AFTER IMPORT
// =========================================================

for (const [number, expectedText] of checks) {
  const article = findArticle(dbArticles, number);

  if (!article?.content_ar?.includes(expectedText)) {
    problems.push(`Article ${number} missing reference ${expectedText}`);
  }
}

// =========================================================
// ARTICLE 11
// =========================================================

const db11 = findArticle(dbArticles, "11");

if (db11?.status !== "active") {
  problems.push("Article 11 status incorrect");
}

if (/\(1\)\s*$/u.test(db11?.content_ar ?? "")) {
  problems.push("Article 11 still has source footnote");
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

console.log(
  `First: ${dbFirst?.article_number} (order ${dbFirst?.article_order})`,
);

console.log(`Last: ${dbLast?.article_number} (order ${dbLast?.article_order})`);

console.log("");

console.log(`Article 11: ${db11?.status}`);

console.log(
  `Article 11 source footnote present: ${
    /\(1\)\s*$/u.test(db11?.content_ar ?? "") ? "Yes" : "No"
  }`,
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
