import fs from "fs";

const INPUT_FILE = "egyptian-civil-law.json";
const OUTPUT_FILE = "egyptian-civil-law-final.json";

// =========================================================
// LOAD RAW JSON
// =========================================================

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`File not found: ${INPUT_FILE}`);
  process.exit(1);
}

const raw = fs.readFileSync(INPUT_FILE, "utf8");
const data = JSON.parse(raw);

if (!Array.isArray(data.articles)) {
  console.error("Invalid JSON: articles array not found.");
  process.exit(1);
}

// =========================================================
// HELPERS
// =========================================================

function getArticle(number) {
  return data.articles.find(
    (article) => String(article.article_number) === String(number),
  );
}

function requireArticle(number) {
  const article = getArticle(number);

  if (!article) {
    throw new Error(`Article ${number} was not found.`);
  }

  return article;
}

function updateArticle(number, changes) {
  const article = requireArticle(number);

  Object.assign(article, changes);

  console.log(`Updated Article ${number}`);
}

function removeTrailingText(number, textToRemove) {
  const article = requireArticle(number);

  if (!article.content_ar) {
    return;
  }

  const content = article.content_ar.trim();

  if (content.endsWith(textToRemove)) {
    article.content_ar = content
      .slice(0, content.length - textToRemove.length)
      .trim();

    console.log(`Removed trailing "${textToRemove}" from Article ${number}`);
  }
}

// =========================================================
// CLEANUP RULE 1
// ARTICLE 53
// =========================================================

/*
 * "الجمعيات" is a heading after Article 53,
 * not part of the statutory text of Article 53.
 */

removeTrailingText("53", "الجمعيات");

// =========================================================
// CLEANUP RULE 2
// ARTICLES 136–137 → السبب
// =========================================================

/*
 * Structure:
 *
 * ١ – أركان العقد
 *   الرضاء
 *   المحل
 *   السبب
 *   البطلان
 *
 * Articles 136–137 belong to "السبب".
 */

for (const number of ["136", "137"]) {
  updateArticle(number, {
    section_title: "١ – أركان العقد",
    subsection_title: "السبب",
    title_ar: "السبب",
  });
}

// =========================================================
// CLEANUP RULE 3
// ARTICLES 138+ → البطلان
// =========================================================

/*
 * Article 138 starts the "البطلان" subsection.
 *
 * We continue fixing the immediately following articles
 * only while they are still within the same subsection.
 *
 * We are NOT blindly changing every later article.
 */

for (const number of ["138", "139", "140", "141", "142", "143", "144"]) {
  const article = getArticle(number);

  if (!article) continue;

  updateArticle(number, {
    section_title: "١ – أركان العقد",
    subsection_title: "البطلان",
    title_ar: "البطلان",
  });
}

// =========================================================
// NORMALIZATION
// =========================================================

for (const article of data.articles) {
  if (typeof article.content_ar === "string") {
    article.content_ar = article.content_ar.trim();
  }

  if (typeof article.section_title === "string") {
    article.section_title = article.section_title.trim();
  }

  if (typeof article.subsection_title === "string") {
    article.subsection_title = article.subsection_title.trim();
  }

  if (typeof article.title_ar === "string") {
    article.title_ar = article.title_ar.trim();
  }
}

// =========================================================
// VALIDATION
// =========================================================

const articleNumbers = data.articles.map((article) =>
  String(article.article_number),
);

const duplicates = articleNumbers.filter(
  (number, index) => articleNumbers.indexOf(number) !== index,
);

const uniqueDuplicates = [...new Set(duplicates)];

const emptyArticles = data.articles
  .filter((article) => !article.content_ar || !article.content_ar.trim())
  .map((article) => article.article_number);

const suspiciousHierarchyInContent = [];

for (const article of data.articles) {
  const content = article.content_ar || "";

  if (
    /\nالقسم\s+/i.test(content) ||
    /\nالكتاب\s+/i.test(content) ||
    /\nالباب\s+/i.test(content) ||
    /\nالفصل\s+/i.test(content)
  ) {
    suspiciousHierarchyInContent.push(article.article_number);
  }
}

// =========================================================
// FINAL METADATA
// =========================================================

data.cleaned_at = new Date().toISOString();

data.processing = {
  scraper_output: INPUT_FILE,

  cleanup_script: "cleanCivilLaw.js",

  final_output: OUTPUT_FILE,
};

data.validation = {
  ...data.validation,

  duplicate_article_numbers: uniqueDuplicates,

  empty_articles: emptyArticles,

  empty_articles_count: emptyArticles.length,

  suspicious_hierarchy_in_content: suspiciousHierarchyInContent,

  suspicious_hierarchy_in_content_count: suspiciousHierarchyInContent.length,

  cleanup_applied: true,
};

// =========================================================
// SAVE FINAL JSON
// =========================================================

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), "utf8");

// =========================================================
// CONSOLE OUTPUT
// =========================================================

console.log("");
console.log("==============================");

console.log("CLEANUP COMPLETE");

console.log("==============================");

console.log(`Articles: ${data.articles.length}`);

console.log(
  `Duplicates: ${
    uniqueDuplicates.length ? uniqueDuplicates.join(", ") : "None"
  }`,
);

console.log(
  `Empty articles: ${emptyArticles.length ? emptyArticles.join(", ") : "None"}`,
);

console.log(
  `Suspicious hierarchy in content: ${
    suspiciousHierarchyInContent.length
      ? suspiciousHierarchyInContent.join(", ")
      : "None"
  }`,
);

console.log("");

console.log(`Saved → ${OUTPUT_FILE}`);
