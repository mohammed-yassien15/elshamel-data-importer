import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "egyptian-criminal-procedure-law-final.json";

const EXPECTED = {
  lawNumber: "150",
  lawYear: 1950,
  total: 585,
  active: 486,
  repealed: 99,
  first: "1",
  last: "560",
  specialCount: 25,
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

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === number);
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("CRIMINAL PROCEDURE LAW IMPORT");

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

const articleNumbers = data.articles.map((article) =>
  String(article.article_number),
);

const duplicateNumbers = articleNumbers.filter(
  (number, index) => articleNumbers.indexOf(number) !== index,
);

const duplicates = unique(duplicateNumbers);

if (duplicates.length) {
  throw new Error(`Duplicate article numbers: ${duplicates.join(", ")}`);
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

// =========================================================
// ORDER VALIDATION
// =========================================================

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

// =========================================================
// STATUS VALIDATION
// =========================================================

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

// =========================================================
// EMPTY ACTIVE
// =========================================================

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

// =========================================================
// REPEALED MUST BE NULL
// =========================================================

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

// =========================================================
// SPECIAL ARTICLE COUNT
// =========================================================

const specialArticles = data.articles.filter(
  (article) => !/^\d+$/u.test(String(article.article_number)),
);

if (specialArticles.length !== EXPECTED.specialCount) {
  throw new Error(
    `Expected ${EXPECTED.specialCount} special article numbers, got ${specialArticles.length}`,
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
// IMPORTANT ARTICLE CHECKS
// =========================================================

const article47 = findArticle(data.articles, "47");

const article113Repeat = findArticle(data.articles, "113 مكررا");

const article208B = findArticle(data.articles, "208 مكررا (ب)");

const article276Repeat = findArticle(data.articles, "276 مكررا");

if (!article47) {
  throw new Error("Article 47 missing");
}

if (article47.status !== "repealed" || article47.content_ar !== null) {
  throw new Error("Article 47 cleanup is incorrect");
}

if (!article113Repeat) {
  throw new Error("113 مكررا missing");
}

if (!article208B) {
  throw new Error("208 مكررا (ب) missing");
}

if (!article276Repeat) {
  throw new Error("276 مكررا missing");
}

// =========================================================
// HIERARCHY ANCHOR CHECKS
// =========================================================

const anchorProblems = [];

function checkAnchor(number, expected) {
  const article = findArticle(data.articles, number);

  if (!article) {
    anchorProblems.push(`${number}: missing`);

    return;
  }

  for (const [key, value] of Object.entries(expected)) {
    if (article[key] !== value) {
      anchorProblems.push(
        `${number}: ${key} expected "${value}", got "${article[key]}"`,
      );
    }
  }
}

checkAnchor("1", {
  book_title: "الكتاب الأول: في الدعوى الجنائية وجمع الاستدلالات والتحقيق",

  part_title: "الباب الأول: في الدعوى الجنائية",
});

checkAnchor("21", {
  part_title: "الباب الثاني: في جمع الاستدلالات ورفع الدعوى",
});

checkAnchor("215", {
  book_title: "الكتاب الثاني: في المحاكم",
});

checkAnchor("398", {
  book_title: "الكتاب الثالث: في طرق الطعن في الأحكام",
});

checkAnchor("459", {
  book_title: "الكتاب الرابع: في التنفيذ",
});

if (anchorProblems.length) {
  throw new Error(
    `Hierarchy anchor problems:\n- ${anchorProblems.join("\n- ")}`,
  );
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

  sort_order: 5,
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
// IMPORT
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
// COUNTS
// =========================================================

const total = dbArticles.length;

const active = dbArticles.filter(
  (article) => article.status === "active",
).length;

const repealed = dbArticles.filter(
  (article) => article.status === "repealed",
).length;

const dbSpecial = dbArticles.filter(
  (article) => !/^\d+$/u.test(article.article_number),
);

const first = dbArticles[0];

const last = dbArticles[dbArticles.length - 1];

// =========================================================
// IMPORTANT DB ARTICLES
// =========================================================

const db47 = findArticle(dbArticles, "47");

const db113Repeat = findArticle(dbArticles, "113 مكررا");

const db208B = findArticle(dbArticles, "208 مكررا (ب)");

const db276Repeat = findArticle(dbArticles, "276 مكررا");

const db215 = findArticle(dbArticles, "215");

const db398 = findArticle(dbArticles, "398");

const db459 = findArticle(dbArticles, "459");

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

console.log(`Special article numbers: ${dbSpecial.length}`);

console.log(`First: ${first?.article_number} (order ${first?.article_order})`);

console.log(`Last: ${last?.article_number} (order ${last?.article_order})`);

console.log("");

console.log(
  `47: ${
    db47
      ? `${db47.status}, content ${
          db47.content_ar === null ? "null" : "NOT NULL"
        }`
      : "MISSING"
  }`,
);

console.log(
  `113 مكررا: ${
    db113Repeat ? `found (order ${db113Repeat.article_order})` : "MISSING"
  }`,
);

console.log(
  `208 مكررا (ب): ${
    db208B ? `found (order ${db208B.article_order})` : "MISSING"
  }`,
);

console.log(
  `276 مكررا: ${
    db276Repeat ? `found (order ${db276Repeat.article_order})` : "MISSING"
  }`,
);

console.log(`215 book: ${db215?.book_title ?? "MISSING"}`);

console.log(`398 book: ${db398?.book_title ?? "MISSING"}`);

console.log(`459 book: ${db459?.book_title ?? "MISSING"}`);

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

if (dbSpecial.length !== EXPECTED.specialCount) {
  errors.push(
    `Expected ${EXPECTED.specialCount} special articles, got ${dbSpecial.length}`,
  );
}

if (first?.article_number !== EXPECTED.first) {
  errors.push(`Unexpected first article: ${first?.article_number}`);
}

if (last?.article_number !== EXPECTED.last) {
  errors.push(`Unexpected last article: ${last?.article_number}`);
}

if (first?.article_order !== 1) {
  errors.push(`Unexpected first order: ${first?.article_order}`);
}

if (last?.article_order !== EXPECTED.total) {
  errors.push(`Unexpected last order: ${last?.article_order}`);
}

if (!db47 || db47.status !== "repealed" || db47.content_ar !== null) {
  errors.push("Article 47 verification failed");
}

if (!db113Repeat) {
  errors.push("113 مكررا missing");
}

if (!db208B) {
  errors.push("208 مكررا (ب) missing");
}

if (!db276Repeat) {
  errors.push("276 مكررا missing");
}

if (db215?.book_title !== "الكتاب الثاني: في المحاكم") {
  errors.push("Article 215 book hierarchy incorrect");
}

if (db398?.book_title !== "الكتاب الثالث: في طرق الطعن في الأحكام") {
  errors.push("Article 398 book hierarchy incorrect");
}

if (db459?.book_title !== "الكتاب الرابع: في التنفيذ") {
  errors.push("Article 459 book hierarchy incorrect");
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
