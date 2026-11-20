import fs from "fs";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const INPUT_FILE = "egyptian-procedures-law-final.json";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("❌ Missing SUPABASE_URL in .env");
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`❌ File not found: ${INPUT_FILE}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function chunkArray(array, size) {
  const chunks = [];

  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }

  return chunks;
}

async function main() {
  console.log("");
  console.log("==============================");
  console.log("PROCEDURES LAW IMPORT");
  console.log("==============================");

  const raw = fs.readFileSync(INPUT_FILE, "utf8");

  const data = JSON.parse(raw);

  if (!data?.law) {
    throw new Error("Invalid JSON: law object not found.");
  }

  if (!Array.isArray(data?.articles)) {
    throw new Error("Invalid JSON: articles array not found.");
  }

  console.log(`Input articles: ${data.articles.length}`);

  // =====================================================
  // 1. UPSERT LAW
  // =====================================================

  const lawPayload = {
    title_ar: data.law.title_ar,

    short_title_ar: data.law.short_title_ar,

    law_number: String(data.law.law_number),

    law_year: Number(data.law.law_year),

    source_name: data.law.source_name ?? null,

    source_url: data.law.source_url ?? null,

    is_published: true,

    sort_order: 2,
  };

  console.log("");
  console.log("Upserting law...");

  const { data: lawRows, error: lawError } = await supabase
    .from("laws")
    .upsert(lawPayload, {
      onConflict: "law_number,law_year",
    })
    .select();

  if (lawError) {
    throw lawError;
  }

  if (!lawRows || lawRows.length === 0) {
    throw new Error("Law upsert succeeded but returned no row.");
  }

  const law = lawRows[0];

  console.log(`✅ Law ID: ${law.id}`);

  // =====================================================
  // 2. PREPARE ARTICLES
  // =====================================================

  const articleRows = data.articles.map((article) => ({
    law_id: law.id,

    article_number: String(article.article_number),

    title_ar: article.title_ar ?? null,

    content_ar: article.content_ar ?? null,

    division_title: article.division_title ?? null,

    book_title: article.book_title ?? null,

    part_title: article.part_title ?? null,

    chapter_title: article.chapter_title ?? null,

    section_title: article.section_title ?? null,

    subsection_title: article.subsection_title ?? null,

    article_order: Number(article.article_order),

    status: article.status,

    is_published: true,
  }));

  // =====================================================
  // 3. BASIC PRE-IMPORT VALIDATION
  // =====================================================

  const invalidRows = articleRows.filter((article) => {
    return (
      !article.article_number ||
      !Number.isInteger(article.article_order) ||
      !["active", "repealed"].includes(article.status)
    );
  });

  if (invalidRows.length > 0) {
    console.error("❌ Invalid articles found:");

    console.error(invalidRows.slice(0, 10));

    throw new Error(`Invalid article rows: ${invalidRows.length}`);
  }

  const activeWithoutContent = articleRows.filter(
    (article) => article.status === "active" && !article.content_ar,
  );

  if (activeWithoutContent.length > 0) {
    console.error("❌ Active articles without content:");

    console.error(
      activeWithoutContent.map((article) => article.article_number),
    );

    throw new Error("Active articles cannot have empty content.");
  }

  console.log("");
  console.log(`Prepared ${articleRows.length} article rows.`);

  // =====================================================
  // 4. IMPORT IN BATCHES
  // =====================================================

  const BATCH_SIZE = 100;

  const batches = chunkArray(articleRows, BATCH_SIZE);

  console.log(`Importing in ${batches.length} batch(es)...`);

  let importedCount = 0;

  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];

    const start = importedCount + 1;

    const end = importedCount + batch.length;

    console.log(`Batch ${index + 1}/${batches.length}: ${start}-${end}`);

    const { error: articlesError } = await supabase
      .from("articles")
      .upsert(batch, {
        onConflict: "law_id,article_number",
      });

    if (articlesError) {
      throw articlesError;
    }

    importedCount += batch.length;

    console.log(`✅ Imported ${importedCount}/${articleRows.length}`);
  }

  // =====================================================
  // 5. VERIFY TOTAL COUNT
  // =====================================================

  console.log("");
  console.log("Verifying import...");

  const { count: totalCount, error: totalError } = await supabase
    .from("articles")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("law_id", law.id);

  if (totalError) {
    throw totalError;
  }

  // =====================================================
  // 6. VERIFY ACTIVE
  // =====================================================

  const { count: activeCount, error: activeError } = await supabase
    .from("articles")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("law_id", law.id)
    .eq("status", "active");

  if (activeError) {
    throw activeError;
  }

  // =====================================================
  // 7. VERIFY REPEALED
  // =====================================================

  const { count: repealedCount, error: repealedError } = await supabase
    .from("articles")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("law_id", law.id)
    .eq("status", "repealed");

  if (repealedError) {
    throw repealedError;
  }

  // =====================================================
  // 8. VERIFY ORDER RANGE
  // =====================================================

  const { data: firstRows, error: firstError } = await supabase
    .from("articles")
    .select("article_number,article_order")
    .eq("law_id", law.id)
    .order("article_order", {
      ascending: true,
    })
    .limit(1);

  if (firstError) {
    throw firstError;
  }

  const { data: lastRows, error: lastError } = await supabase
    .from("articles")
    .select("article_number,article_order")
    .eq("law_id", law.id)
    .order("article_order", {
      ascending: false,
    })
    .limit(1);

  if (lastError) {
    throw lastError;
  }

  const firstArticle = firstRows?.[0];

  const lastArticle = lastRows?.[0];

  // =====================================================
  // 9. EXPECTED VALUES
  // =====================================================

  const expectedTotal = data.validation?.total_articles ?? data.articles.length;

  const expectedActive =
    data.validation?.active_articles ??
    data.articles.filter((article) => article.status === "active").length;

  const expectedRepealed =
    data.validation?.repealed_articles ??
    data.articles.filter((article) => article.status === "repealed").length;

  console.log("");
  console.log("==============================");
  console.log("IMPORT RESULT");
  console.log("==============================");

  console.log(`Total articles: ${totalCount}`);

  console.log(`Active articles: ${activeCount}`);

  console.log(`Repealed articles: ${repealedCount}`);

  console.log(
    `First: ${firstArticle?.article_number} (order ${firstArticle?.article_order})`,
  );

  console.log(
    `Last: ${lastArticle?.article_number} (order ${lastArticle?.article_order})`,
  );

  console.log("");

  // =====================================================
  // 10. FINAL VALIDATION
  // =====================================================

  const problems = [];

  if (totalCount !== expectedTotal) {
    problems.push(`Expected ${expectedTotal} total, found ${totalCount}`);
  }

  if (activeCount !== expectedActive) {
    problems.push(`Expected ${expectedActive} active, found ${activeCount}`);
  }

  if (repealedCount !== expectedRepealed) {
    problems.push(
      `Expected ${expectedRepealed} repealed, found ${repealedCount}`,
    );
  }

  if (firstArticle?.article_order !== 1) {
    problems.push(`First article_order should be 1`);
  }

  if (lastArticle?.article_order !== data.articles.length) {
    problems.push(`Last article_order should be ${data.articles.length}`);
  }

  if (problems.length > 0) {
    console.error("❌ Import verification failed:");

    for (const problem of problems) {
      console.error(`- ${problem}`);
    }

    process.exit(1);
  }

  console.log("✅ Import looks correct.");
}

main().catch((error) => {
  console.error("");
  console.error("==============================");

  console.error("IMPORT FAILED");

  console.error("==============================");

  console.error(error);

  process.exit(1);
});
