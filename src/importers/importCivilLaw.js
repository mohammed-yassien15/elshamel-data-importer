import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "data/final/egyptian-civil-law-final.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

// =========================================================
// LOAD JSON
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`File not found: ${INPUT_FILE}`);
  process.exit(1);
}

const raw = fs.readFileSync(INPUT_FILE, "utf8");
const data = JSON.parse(raw);

if (!data?.law) {
  console.error("Invalid JSON: law object missing.");
  process.exit(1);
}

if (!Array.isArray(data?.articles)) {
  console.error("Invalid JSON: articles array missing.");
  process.exit(1);
}

// =========================================================
// HELPERS
// =========================================================

function buildRepealedArticle(number) {
  return {
    article_number: String(number),
    title_ar: null,
    content_ar: null,

    division_title: null,
    book_title: null,
    part_title: null,
    chapter_title: null,
    section_title: null,
    subsection_title: null,

    article_order: number,

    status: "repealed",
    is_published: true,
  };
}

function isRepealedNumber(number) {
  return (number >= 54 && number <= 80) || (number >= 389 && number <= 417);
}

function normalizeArticle(article) {
  const number = Number(article.article_number);

  return {
    article_number: String(article.article_number),

    title_ar: article.title_ar ?? null,

    content_ar: article.content_ar ?? null,

    division_title: article.division_title ?? null,

    book_title: article.book_title ?? null,

    part_title: article.part_title ?? null,

    chapter_title: article.chapter_title ?? null,

    section_title: article.section_title ?? null,

    subsection_title: article.subsection_title ?? null,

    article_order: number,

    status: article.status ?? "active",

    is_published: true,
  };
}

// =========================================================
// PREPARE ALL ARTICLES 1 → 1149
// =========================================================

function buildCompleteArticleList() {
  const sourceMap = new Map();

  for (const article of data.articles) {
    sourceMap.set(Number(article.article_number), article);
  }

  const finalArticles = [];

  for (let number = 1; number <= 1149; number++) {
    const existing = sourceMap.get(number);

    if (existing) {
      finalArticles.push(normalizeArticle(existing));

      continue;
    }

    if (isRepealedNumber(number)) {
      finalArticles.push(buildRepealedArticle(number));

      continue;
    }

    console.warn(
      `WARNING: Article ${number} missing and not marked as repealed`,
    );
  }

  return finalArticles;
}

// =========================================================
// UPSERT LAW
// =========================================================

async function upsertLaw() {
  console.log("");
  console.log("Upserting law...");

  const lawPayload = {
    title_ar: data.law.title_ar,

    short_title_ar: "القانون المدني",

    law_number: String(data.law.law_number),

    law_year: Number(data.law.law_year),

    source_name: data.law.source_name ?? null,

    source_url: data.law.source_url ?? null,

    is_published: true,

    sort_order: 1,
  };

  const { data: lawResult, error } = await supabase
    .from("laws")
    .upsert(lawPayload, {
      onConflict: "law_number,law_year",
    })
    .select("id, title_ar, law_number, law_year")
    .single();

  if (error) {
    throw new Error(`Failed to upsert law: ${error.message}`);
  }

  console.log(`Law ready: ${lawResult.title_ar}`);

  console.log(`Law ID: ${lawResult.id}`);

  return lawResult;
}

// =========================================================
// UPSERT ARTICLES IN BATCHES
// =========================================================

async function upsertArticles(lawId, articles) {
  const BATCH_SIZE = 100;

  console.log("");
  console.log(`Preparing to import ${articles.length} articles...`);

  for (let start = 0; start < articles.length; start += BATCH_SIZE) {
    const batch = articles.slice(start, start + BATCH_SIZE);

    const payload = batch.map((article) => ({
      ...article,
      law_id: lawId,
    }));

    const { error } = await supabase.from("articles").upsert(payload, {
      onConflict: "law_id,article_number",
    });

    if (error) {
      throw new Error(
        `Failed importing articles ${start + 1}-${
          start + batch.length
        }: ${error.message}`,
      );
    }

    console.log(`Imported ${start + 1}-${start + batch.length}`);
  }
}

// =========================================================
// VERIFY IMPORT
// =========================================================

async function verifyImport(lawId) {
  console.log("");
  console.log("Verifying import...");

  const { count: totalCount, error: totalError } = await supabase
    .from("articles")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("law_id", lawId);

  if (totalError) {
    throw new Error(`Verification failed: ${totalError.message}`);
  }

  const { count: activeCount, error: activeError } = await supabase
    .from("articles")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("law_id", lawId)
    .eq("status", "active");

  if (activeError) {
    throw new Error(`Active count failed: ${activeError.message}`);
  }

  const { count: repealedCount, error: repealedError } = await supabase
    .from("articles")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("law_id", lawId)
    .eq("status", "repealed");

  if (repealedError) {
    throw new Error(`Repealed count failed: ${repealedError.message}`);
  }

  console.log("");
  console.log("==============================");

  console.log("IMPORT VERIFICATION");

  console.log("==============================");

  console.log(`Total articles: ${totalCount}`);

  console.log(`Active articles: ${activeCount}`);

  console.log(`Repealed articles: ${repealedCount}`);

  console.log("");

  if (totalCount === 1149 && activeCount === 1093 && repealedCount === 56) {
    console.log("✅ Import looks correct.");
  } else {
    console.warn("⚠️ Counts are different from expected.");
  }
}

// =========================================================
// MAIN
// =========================================================

async function main() {
  console.log("==============================");

  console.log("EL SHAMEL CIVIL LAW IMPORTER");

  console.log("==============================");

  const allArticles = buildCompleteArticleList();

  console.log(`Prepared articles: ${allArticles.length}`);

  const activeCount = allArticles.filter(
    (article) => article.status === "active",
  ).length;

  const repealedCount = allArticles.filter(
    (article) => article.status === "repealed",
  ).length;

  console.log(`Active: ${activeCount}`);

  console.log(`Repealed: ${repealedCount}`);

  const law = await upsertLaw();

  await upsertArticles(law.id, allArticles);

  await verifyImport(law.id);

  console.log("");
  console.log("Import complete.");
}

// =========================================================
// RUN
// =========================================================

main().catch((error) => {
  console.error("");
  console.error("IMPORT FAILED");

  console.error(error.message);

  process.exit(1);
});
