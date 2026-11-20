import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "egyptian-penal-code-final.json";

const EXPECTED = {
  lawNumber: "58",
  lawYear: 1937,
  total: 535,
  active: 471,
  repealed: 64,
  first: "1",
  last: "395",
  specialCount: 140,
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
// FILE
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
// BASIC INPUT VALIDATION
// =========================================================

if (String(data.law.law_number) !== EXPECTED.lawNumber) {
  throw new Error(`Unexpected law number: ${data.law.law_number}`);
}

if (Number(data.law.law_year) !== EXPECTED.lawYear) {
  throw new Error(`Unexpected law year: ${data.law.law_year}`);
}

if (data.articles.length !== EXPECTED.total) {
  throw new Error(
    `Expected ${EXPECTED.total} articles, got ${data.articles.length}`,
  );
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

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function unique(values) {
  return [...new Set(values)];
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("PENAL CODE IMPORT");

console.log("==============================");

console.log("");

console.log(`Input articles: ${data.articles.length}`);

// =========================================================
// PRE-IMPORT VALIDATION
// =========================================================

const articleNumbers = data.articles.map((article) =>
  String(article.article_number),
);

const duplicateNumbers = articleNumbers.filter(
  (number, index) => articleNumbers.indexOf(number) !== index,
);

if (duplicateNumbers.length) {
  throw new Error(
    `Duplicate article numbers: ${unique(duplicateNumbers).join(", ")}`,
  );
}

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

const invalidOrders = data.articles.filter(
  (article, index) => article.article_order !== index + 1,
);

if (invalidOrders.length) {
  throw new Error(
    `Invalid article_order for: ${invalidOrders
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

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

const specialArticleNumbers = data.articles.filter(
  (article) => !/^\d+$/u.test(String(article.article_number)),
);

if (specialArticleNumbers.length !== EXPECTED.specialCount) {
  throw new Error(
    `Expected ${EXPECTED.specialCount} special article numbers, got ${specialArticleNumbers.length}`,
  );
}

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

  sort_order: 4,
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
// IMPORT IN BATCHES
// =========================================================

const BATCH_SIZE = 100;

const batches = chunkArray(articleRows, BATCH_SIZE);

console.log("");
console.log(`Importing in ${batches.length} batch(es)...`);

console.log("");

let imported = 0;

for (let i = 0; i < batches.length; i++) {
  const batch = batches[i];

  const start = imported + 1;

  const end = imported + batch.length;

  console.log(`Batch ${i + 1}/${batches.length}: ${start}-${end}`);

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
        content_ar,
        book_title,
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

const total = dbArticles.length;

const active = dbArticles.filter(
  (article) => article.status === "active",
).length;

const repealed = dbArticles.filter(
  (article) => article.status === "repealed",
).length;

const first = dbArticles[0];

const last = dbArticles[dbArticles.length - 1];

const dbSpecialArticles = dbArticles.filter(
  (article) => !/^\d+$/u.test(article.article_number),
);

// =========================================================
// IMPORTANT SPECIAL CHECKS
// =========================================================

const article44Repeat = dbArticles.find(
  (article) => article.article_number === "44 مكرر",
);

const article83Repeat = dbArticles.find(
  (article) => article.article_number === "83 مكرر",
);

const article186Repeat = dbArticles.find(
  (article) => article.article_number === "186 مكرر",
);

const article293 = dbArticles.find(
  (article) => article.article_number === "293",
);

const article376 = dbArticles.find(
  (article) => article.article_number === "376",
);

const article395 = dbArticles.find(
  (article) => article.article_number === "395",
);

// =========================================================
// OUTPUT
// =========================================================

console.log("");
console.log("==============================");

console.log("IMPORT RESULT");

console.log("==============================");

console.log(`Total articles: ${total}`);

console.log(`Active articles: ${active}`);

console.log(`Repealed articles: ${repealed}`);

console.log(`Special article numbers: ${dbSpecialArticles.length}`);

console.log(`First: ${first?.article_number} (order ${first?.article_order})`);

console.log(`Last: ${last?.article_number} (order ${last?.article_order})`);

console.log("");

console.log(
  `44 مكرر: ${
    article44Repeat
      ? `found (order ${article44Repeat.article_order})`
      : "MISSING"
  }`,
);

console.log(`83 مكرر: ${article83Repeat ? article83Repeat.status : "MISSING"}`);

console.log(`186 مكرر: ${article186Repeat ? "found" : "MISSING"}`);

console.log(`293: ${article293 ? "found" : "MISSING"}`);

console.log(`376 section: ${article376?.section_title ?? "MISSING"}`);

console.log(`395 status: ${article395?.status ?? "MISSING"}`);

// =========================================================
// FINAL ASSERTIONS
// =========================================================

const errors = [];

if (total !== EXPECTED.total) {
  errors.push(`Expected total ${EXPECTED.total}, got ${total}`);
}

if (active !== EXPECTED.active) {
  errors.push(`Expected active ${EXPECTED.active}, got ${active}`);
}

if (repealed !== EXPECTED.repealed) {
  errors.push(`Expected repealed ${EXPECTED.repealed}, got ${repealed}`);
}

if (dbSpecialArticles.length !== EXPECTED.specialCount) {
  errors.push(
    `Expected ${EXPECTED.specialCount} special articles, got ${dbSpecialArticles.length}`,
  );
}

if (first?.article_number !== EXPECTED.first) {
  errors.push(`Unexpected first article: ${first?.article_number}`);
}

if (last?.article_number !== EXPECTED.last) {
  errors.push(`Unexpected last article: ${last?.article_number}`);
}

if (first?.article_order !== 1) {
  errors.push(`Unexpected first article order: ${first?.article_order}`);
}

if (last?.article_order !== EXPECTED.total) {
  errors.push(`Unexpected last article order: ${last?.article_order}`);
}

if (!article44Repeat) {
  errors.push("44 مكرر is missing");
}

if (article83Repeat?.status !== "repealed") {
  errors.push("83 مكرر should be repealed");
}

if (!article186Repeat) {
  errors.push("186 مكرر is missing");
}

if (!article293) {
  errors.push("Article 293 is missing");
}

if (article376?.section_title !== "المخالفات المتعلقة بالطرق العمومية") {
  errors.push("Article 376 section_title is incorrect");
}

if (article395?.status !== "repealed") {
  errors.push("Article 395 should be repealed");
}

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
