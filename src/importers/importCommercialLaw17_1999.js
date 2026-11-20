import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "data/final/commercial-law-17-1999-final.json";

const EXPECTED = {
  lawNumber: "17",
  lawYear: 1999,

  total: 772,

  active: 548,
  repealed: 223,
  unconstitutional: 1,

  first: "1",
  last: "772",

  books: 0,
  parts: 4,
  chapters: 17,
  sections: 8,
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
// LOAD FILE
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

function findArticle(articles, number) {
  return articles.find((article) => article.article_number === String(number));
}

// =========================================================
// START
// =========================================================

console.log("");
console.log("==============================");

console.log("COMMERCIAL LAW 17/1999 IMPORT");

console.log("==============================");

console.log("");

console.log(`Input rows: ${data.articles.length}`);

// =========================================================
// BASIC LAW CHECK
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
// ORDER CHECK
// =========================================================

const invalidOrders = data.articles.filter(
  (article) => article.article_order !== Number(article.article_number),
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
// STATUS CHECK
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
// EMPTY ACTIVE CONTENT
// =========================================================

const emptyActive = data.articles.filter(
  (article) => article.status === "active" && !article.content_ar,
);

if (emptyActive.length) {
  throw new Error(
    `Empty active articles: ${emptyActive
      .map((article) => article.article_number)
      .join(", ")}`,
  );
}

// =========================================================
// HIERARCHY CHECK
// =========================================================

const books = unique(
  data.articles.map((article) => article.book_title).filter(Boolean),
);

const parts = unique(
  data.articles.map((article) => article.part_title).filter(Boolean),
);

const chapters = unique(
  data.articles.map((article) => article.chapter_title).filter(Boolean),
);

const sections = unique(
  data.articles.map((article) => article.section_title).filter(Boolean),
);

if (books.length !== EXPECTED.books) {
  throw new Error(`Expected ${EXPECTED.books} books, got ${books.length}`);
}

if (parts.length !== EXPECTED.parts) {
  throw new Error(`Expected ${EXPECTED.parts} parts, got ${parts.length}`);
}

if (chapters.length !== EXPECTED.chapters) {
  throw new Error(
    `Expected ${EXPECTED.chapters} chapters, got ${chapters.length}`,
  );
}

if (sections.length !== EXPECTED.sections) {
  throw new Error(
    `Expected ${EXPECTED.sections} sections, got ${sections.length}`,
  );
}

// =========================================================
// SPECIAL LEGAL CHECKS
// =========================================================

const article189 = findArticle(data.articles, 189);

const article190 = findArticle(data.articles, 190);

if (!article189) {
  throw new Error("Article 189 missing.");
}

if (article189.status !== "unconstitutional") {
  throw new Error("Article 189 should be unconstitutional.");
}

if (!article189.legal_note) {
  throw new Error("Article 189 legal_note missing.");
}

if (!article190) {
  throw new Error("Article 190 missing.");
}

if (article190.status !== "active") {
  throw new Error("Article 190 should remain active.");
}

if (!article190.legal_note) {
  throw new Error("Article 190 legal_note missing.");
}

// =========================================================
// REPEALED RANGE CHECK 550-772
// =========================================================

for (let number = 550; number <= 772; number++) {
  const article = findArticle(data.articles, number);

  if (!article) {
    throw new Error(`Missing repealed article ${number}`);
  }

  if (article.status !== "repealed") {
    throw new Error(`Article ${number} should be repealed.`);
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

  sort_order: 12,
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

console.log(`Prepared ${articleRows.length} rows.`);

// =========================================================
// IMPORT BATCHES
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
        legal_note,
        division_title,
        book_title,
        part_title,
        chapter_title,
        section_title,
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
// POST IMPORT COUNTS
// =========================================================

const dbActive = dbArticles.filter((article) => article.status === "active");

const dbRepealed = dbArticles.filter(
  (article) => article.status === "repealed",
);

const dbUnconstitutional = dbArticles.filter(
  (article) => article.status === "unconstitutional",
);

const dbBooks = unique(
  dbArticles.map((article) => article.book_title).filter(Boolean),
);

const dbParts = unique(
  dbArticles.map((article) => article.part_title).filter(Boolean),
);

const dbChapters = unique(
  dbArticles.map((article) => article.chapter_title).filter(Boolean),
);

const dbSections = unique(
  dbArticles.map((article) => article.section_title).filter(Boolean),
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
// VERIFY HIERARCHY
// =========================================================

if (dbBooks.length !== EXPECTED.books) {
  problems.push(`Expected ${EXPECTED.books} books, got ${dbBooks.length}`);
}

if (dbParts.length !== EXPECTED.parts) {
  problems.push(`Expected ${EXPECTED.parts} parts, got ${dbParts.length}`);
}

if (dbChapters.length !== EXPECTED.chapters) {
  problems.push(
    `Expected ${EXPECTED.chapters} chapters, got ${dbChapters.length}`,
  );
}

if (dbSections.length !== EXPECTED.sections) {
  problems.push(
    `Expected ${EXPECTED.sections} sections, got ${dbSections.length}`,
  );
}

// =========================================================
// VERIFY FIRST / LAST
// =========================================================

if (dbFirst?.article_number !== "1" || dbFirst?.article_order !== 1) {
  problems.push("First article incorrect");
}

if (dbLast?.article_number !== "772" || dbLast?.article_order !== 772) {
  problems.push("Last article incorrect");
}

// =========================================================
// VERIFY ARTICLE 189
// =========================================================

const db189 = findArticle(dbArticles, 189);

if (db189?.status !== "unconstitutional") {
  problems.push("Article 189 status incorrect");
}

if (!db189?.legal_note) {
  problems.push("Article 189 legal_note missing");
}

// =========================================================
// VERIFY ARTICLE 190
// =========================================================

const db190 = findArticle(dbArticles, 190);

if (db190?.status !== "active") {
  problems.push("Article 190 status incorrect");
}

if (!db190?.legal_note) {
  problems.push("Article 190 legal_note missing");
}

// =========================================================
// VERIFY REPEALED RANGE
// =========================================================

const wrongRepealed = dbArticles.filter((article) => {
  const number = Number(article.article_number);

  return number >= 550 && number <= 772 && article.status !== "repealed";
});

if (wrongRepealed.length) {
  problems.push(
    `Wrong status in repealed range: ${wrongRepealed
      .map((article) => article.article_number)
      .join(", ")}`,
  );
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

console.log(`Books: ${dbBooks.length}`);

console.log(`Parts: ${dbParts.length}`);

console.log(`Chapters: ${dbChapters.length}`);

console.log(`Sections: ${dbSections.length}`);

console.log("");

console.log(
  `First: ${dbFirst?.article_number} (order ${dbFirst?.article_order})`,
);

console.log(`Last: ${dbLast?.article_number} (order ${dbLast?.article_order})`);

console.log("");

console.log(`Article 189: ${db189?.status}`);

console.log(
  `Article 190: ${db190?.status} + legal_note ${
    db190?.legal_note ? "✅" : "❌"
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
