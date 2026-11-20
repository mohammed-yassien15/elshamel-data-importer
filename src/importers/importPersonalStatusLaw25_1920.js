import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "personal-status-law-25-1920-final.json";

const EXPECTED = {
  lawNumber: "25",
  lawYear: 1920,
  total: 13,
  active: 10,
  repealed: 3,
  first: "1",
  last: "13",
  repealedArticles: ["3", "7", "12"],
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

// =========================================================
// LOAD FILE
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  throw new Error(`File not found: ${INPUT_FILE}`);
}

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf8"));

if (!data?.law) {
  throw new Error("Invalid JSON: law metadata missing.");
}

if (!Array.isArray(data.articles)) {
  throw new Error("Invalid JSON: articles array missing.");
}

// =========================================================
// SUPABASE
// =========================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// =========================================================
// HELPERS
// =========================================================

function unique(values) {
  return [...new Set(values)];
}

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === number);
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("PERSONAL STATUS LAW 25/1920 IMPORT");

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

const articleNumbers = data.articles.map((article) =>
  String(article.article_number),
);

const duplicates = unique(
  articleNumbers.filter(
    (number, index) => articleNumbers.indexOf(number) !== index,
  ),
);

if (duplicates.length) {
  throw new Error(`Duplicate article numbers: ${duplicates.join(", ")}`);
}

// ---------------------------------------------------------
// STATUS COUNTS
// ---------------------------------------------------------

const activeInput = data.articles.filter(
  (article) => article.status === "active",
);

const repealedInput = data.articles.filter(
  (article) => article.status === "repealed",
);

if (activeInput.length !== EXPECTED.active) {
  throw new Error(
    `Expected ${EXPECTED.active} active articles, got ${activeInput.length}`,
  );
}

if (repealedInput.length !== EXPECTED.repealed) {
  throw new Error(
    `Expected ${EXPECTED.repealed} repealed articles, got ${repealedInput.length}`,
  );
}

// ---------------------------------------------------------
// INVALID STATUS
// ---------------------------------------------------------

const invalidStatuses = data.articles.filter(
  (article) => !["active", "repealed"].includes(article.status),
);

if (invalidStatuses.length) {
  throw new Error(
    `Invalid statuses: ${invalidStatuses
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// EMPTY ACTIVE
// ---------------------------------------------------------

const emptyActive = data.articles.filter(
  (article) =>
    article.status === "active" && !String(article.content_ar || "").trim(),
);

if (emptyActive.length) {
  throw new Error(
    `Active articles with empty content: ${emptyActive
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// REPEALED CONTENT
// ---------------------------------------------------------

const repealedWithContent = data.articles.filter(
  (article) => article.status === "repealed" && article.content_ar !== null,
);

if (repealedWithContent.length) {
  throw new Error(
    `Repealed articles with content: ${repealedWithContent
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// ---------------------------------------------------------
// ORDER
// ---------------------------------------------------------

const invalidOrders = data.articles.filter(
  (article, index) => article.article_order !== index + 1,
);

if (invalidOrders.length) {
  throw new Error(
    `Invalid article_order: ${invalidOrders
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
// EXPECTED REPEALED ARTICLES
// ---------------------------------------------------------

const actualRepealed = repealedInput.map((article) => article.article_number);

const missingRepealed = EXPECTED.repealedArticles.filter(
  (number) => !actualRepealed.includes(number),
);

const unexpectedRepealed = actualRepealed.filter(
  (number) => !EXPECTED.repealedArticles.includes(number),
);

if (missingRepealed.length) {
  throw new Error(
    `Missing expected repealed articles: ${missingRepealed.join(", ")}`,
  );
}

if (unexpectedRepealed.length) {
  throw new Error(
    `Unexpected repealed articles: ${unexpectedRepealed.join(", ")}`,
  );
}

// ---------------------------------------------------------
// HIERARCHY ANCHORS
// ---------------------------------------------------------

const article1 = findArticle(data.articles, "1");

const article4 = findArticle(data.articles, "4");

const article7 = findArticle(data.articles, "7");

const article9 = findArticle(data.articles, "9");

const article12 = findArticle(data.articles, "12");

const hierarchyProblems = [];

if (article1?.part_title !== "الباب الأول: في النفقة") {
  hierarchyProblems.push("Article 1 part_title incorrect");
}

if (article1?.section_title !== "القسم الأول: في النفقة والعدة") {
  hierarchyProblems.push("Article 1 section_title incorrect");
}

if (article4?.section_title !== "القسم الثاني: في العجز عن النفقة") {
  hierarchyProblems.push("Article 4 section_title incorrect");
}

if (article7?.part_title !== "الباب الثاني: في المفقود") {
  hierarchyProblems.push("Article 7 part_title incorrect");
}

if (article9?.part_title !== "الباب الثالث: في التفريق بالعيب") {
  hierarchyProblems.push("Article 9 part_title incorrect");
}

if (article12?.part_title !== "الباب الرابع: في أحكام متفرقة") {
  hierarchyProblems.push("Article 12 part_title incorrect");
}

if (hierarchyProblems.length) {
  throw new Error(`Hierarchy problems:\n- ${hierarchyProblems.join("\n- ")}`);
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

  sort_order: 6,
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

  article_number: String(article.article_number),

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
// UPSERT ARTICLES
// =========================================================

const { error: articlesError } = await supabase
  .from("articles")
  .upsert(articleRows, {
    onConflict: "law_id,article_number",
  });

if (articlesError) {
  throw articlesError;
}

console.log(`✅ Imported ${articleRows.length}/${articleRows.length}`);

// =========================================================
// POST-IMPORT VERIFICATION
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
// COUNTS
// =========================================================

const total = dbArticles.length;

const active = dbArticles.filter(
  (article) => article.status === "active",
).length;

const repealed = dbArticles.filter(
  (article) => article.status === "repealed",
).length;

const dbRepealed = dbArticles
  .filter((article) => article.status === "repealed")
  .map((article) => article.article_number);

const first = dbArticles[0];

const last = dbArticles[dbArticles.length - 1];

// =========================================================
// VERIFY IMPORTANT ARTICLES
// =========================================================

const db1 = findArticle(dbArticles, "1");

const db3 = findArticle(dbArticles, "3");

const db4 = findArticle(dbArticles, "4");

const db7 = findArticle(dbArticles, "7");

const db9 = findArticle(dbArticles, "9");

const db12 = findArticle(dbArticles, "12");

// =========================================================
// OUTPUT
// =========================================================

console.log("");
console.log("==============================");

console.log("IMPORT RESULT");

console.log("==============================");

console.log("");

console.log(`Total articles: ${total}`);

console.log(`Active articles: ${active}`);

console.log(`Repealed articles: ${repealed}`);

console.log(`Repealed article numbers: ${dbRepealed.join(", ")}`);

console.log("");

console.log(`First: ${first?.article_number} (order ${first?.article_order})`);

console.log(`Last: ${last?.article_number} (order ${last?.article_order})`);

console.log("");

console.log(`Article 1: ${db1?.part_title} / ${db1?.section_title}`);

console.log(`Article 4: ${db4?.part_title} / ${db4?.section_title}`);

console.log(`Article 7: ${db7?.part_title}`);

console.log(`Article 9: ${db9?.part_title}`);

console.log(`Article 12: ${db12?.part_title}`);

// =========================================================
// FINAL ASSERTIONS
// =========================================================

const errors = [];

if (total !== EXPECTED.total) {
  errors.push(`Expected ${EXPECTED.total} total, got ${total}`);
}

if (active !== EXPECTED.active) {
  errors.push(`Expected ${EXPECTED.active} active, got ${active}`);
}

if (repealed !== EXPECTED.repealed) {
  errors.push(`Expected ${EXPECTED.repealed} repealed, got ${repealed}`);
}

if (first?.article_number !== EXPECTED.first || first?.article_order !== 1) {
  errors.push("First article verification failed");
}

if (
  last?.article_number !== EXPECTED.last ||
  last?.article_order !== EXPECTED.total
) {
  errors.push("Last article verification failed");
}

for (const number of EXPECTED.repealedArticles) {
  const article = findArticle(dbArticles, number);

  if (
    !article ||
    article.status !== "repealed" ||
    article.content_ar !== null
  ) {
    errors.push(`Repealed article verification failed: ${number}`);
  }
}

if (db1?.part_title !== "الباب الأول: في النفقة") {
  errors.push("Article 1 part hierarchy incorrect");
}

if (db1?.section_title !== "القسم الأول: في النفقة والعدة") {
  errors.push("Article 1 section hierarchy incorrect");
}

if (db4?.section_title !== "القسم الثاني: في العجز عن النفقة") {
  errors.push("Article 4 section hierarchy incorrect");
}

if (db7?.part_title !== "الباب الثاني: في المفقود") {
  errors.push("Article 7 part hierarchy incorrect");
}

if (db9?.part_title !== "الباب الثالث: في التفريق بالعيب") {
  errors.push("Article 9 part hierarchy incorrect");
}

if (db12?.part_title !== "الباب الرابع: في أحكام متفرقة") {
  errors.push("Article 12 part hierarchy incorrect");
}

// =========================================================
// RESULT
// =========================================================

if (errors.length) {
  console.log("");
  console.log("❌ VERIFICATION FAILED");

  for (const error of errors) {
    console.log(`- ${error}`);
  }

  process.exit(1);
}

console.log("");
console.log("✅ Import looks correct.");
