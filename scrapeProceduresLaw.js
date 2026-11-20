import * as cheerio from "cheerio";
import fs from "fs";

const URL =
  "https://alberonsy.com/%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-%DB%B1%DB%B3-%D9%84%D8%B3%D9%86%D8%A9-%DB%B1%DB%B9%D9%A6%DB%B8-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%B1%D9%82%D9%85-13-%D9%84%D8%B3%D9%86%D8%A9-1968-%D8%A8%D8%A5%D8%B5%D8%AF%D8%A7%D8%B1-%D9%82%D8%A7%D9%86%D9%88%D9%86-%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D9%81%D8%B9%D8%A7%D8%AA-%D8%A7%D9%84%D9%85%D8%AF%D9%86%D9%8A%D8%A9-%D9%88%D8%A7%D9%84%D8%AA%D8%AC%D8%A7%D8%B1%D9%8A%D8%A9-%D9%88%D9%81%D9%82%D8%A7%D9%8B-%D9%84%D8%A2%D8%AE%D8%B1-%D8%AA%D8%B9%D8%AF%D9%8A%D9%84-%D8%B5%D8%A7%D8%AF%D8%B1-%D9%81%D9%8A-10-%D9%8A%D9%88%D9%84%D9%8A%D8%A9-%D8%B9%D8%A7%D9%85-2024/";

const OUTPUT_FILE = "egyptian-procedures-law.json";

// =========================================================
// TEXT HELPERS
// =========================================================

function normalizeText(text = "") {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function arabicToEnglishDigits(value = "") {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";

  return value
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)));
}

function cleanHeading(text = "") {
  return normalizeText(text)
    .replace(/^\(+/, "")
    .replace(/\)+$/, "")
    .replace(/:$/, "")
    .trim();
}

// =========================================================
// ARTICLE NUMBER
// Supports:
// مادة (1):
// مادة (3 مكررًا):
// مادة (3 مكرر):
// =========================================================

function extractArticleNumber(text) {
  const cleaned = normalizeText(text);

  const match = cleaned.match(
    /^مادة\s*\(\s*([٠-٩۰-۹0-9]+)(?:\s+(مكرراً|مكررًا|مكرر|مكررا))?\s*\)\s*:?\s*$/i,
  );

  if (!match) {
    return null;
  }

  const number = arabicToEnglishDigits(match[1]);

  const suffix = match[2];

  if (suffix) {
    return `${number} مكرر`;
  }

  return number;
}

// =========================================================
// STRUCTURAL HEADINGS
// =========================================================

function getStructuralHeadingType(text) {
  const cleaned = cleanHeading(text);

  if (/^الكتاب\s+/i.test(cleaned)) {
    return "book";
  }

  if (/^الباب\s+/i.test(cleaned)) {
    return "part";
  }

  if (/^الفصل\s+/i.test(cleaned)) {
    return "chapter";
  }

  return null;
}

// =========================================================
// START MARKER
// We ignore issuance articles before this point.
// =========================================================

function isMainLawStart(text) {
  const cleaned = normalizeText(text);

  return cleaned === "قانون المرافعات المدنية والتجارية";
}

// =========================================================
// SMALL / DESCRIPTIVE HEADING
// Examples:
// أحكام عامة
// التداعي أمام المحاكم
// الاختصاص
// الاختصاص الدولي للمحاكم
// =========================================================

function looksLikeHeadingTitle(text) {
  const cleaned = cleanHeading(text);

  if (!cleaned) return false;

  if (cleaned.length > 90) {
    return false;
  }

  if (
    cleaned.includes(".") ||
    cleaned.includes("،") ||
    cleaned.includes("؛") ||
    cleaned.includes("؟")
  ) {
    return false;
  }

  if (extractArticleNumber(cleaned)) {
    return false;
  }

  const words = cleaned.split(/\s+/);

  return words.length <= 10;
}

// =========================================================
// SCRAPER
// =========================================================

async function scrape() {
  console.log("Fetching procedures law page...");

  const response = await fetch(URL);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch page: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  const $ = cheerio.load(html);

  // WordPress / article fallbacks
  let root = $(".entry-content").first();

  if (!root.length) {
    root = $(".post-content").first();
  }

  if (!root.length) {
    root = $("article").first();
  }

  if (!root.length) {
    root = $("main").first();
  }

  if (!root.length) {
    throw new Error("Could not find page content container.");
  }

  const elements = root.find("p, h1, h2, h3, h4, h5, h6, li").toArray();

  const articles = [];

  // =======================================================
  // STATE
  // =======================================================

  let lawStarted = false;

  let currentBook = null;
  let currentPart = null;
  let currentChapter = null;
  let currentSection = null;
  let currentSubsection = null;

  let currentArticle = null;

  let articleOrder = 0;

  /*
   * Used for structures such as:
   *
   * الكتاب الأول
   * التداعي أمام المحاكم
   *
   * الباب الأول
   * الاختصاص
   *
   * (الفصل الأول)
   * الاختصاص الدولي للمحاكم
   */
  let pendingHeading = null;

  // =======================================================
  // SAVE ARTICLE
  // =======================================================

  function saveCurrentArticle() {
    if (!currentArticle) {
      return;
    }

    currentArticle.content_ar = currentArticle.contentParts
      .map(normalizeText)
      .filter(Boolean)
      .join("\n")
      .trim();

    delete currentArticle.contentParts;

    articles.push(currentArticle);

    currentArticle = null;
  }

  // =======================================================
  // APPLY COMBINED STRUCTURE
  // =======================================================

  function applyPendingHeadingTitle(title) {
    if (!pendingHeading) {
      return false;
    }

    const headingTitle = cleanHeading(title);

    const combined = `${pendingHeading.label}: ${headingTitle}`;

    switch (pendingHeading.type) {
      case "book":
        currentBook = combined;

        currentPart = null;
        currentChapter = null;
        currentSection = null;
        currentSubsection = null;

        break;

      case "part":
        currentPart = combined;

        currentChapter = null;
        currentSection = null;
        currentSubsection = null;

        break;

      case "chapter":
        currentChapter = combined;

        currentSection = null;
        currentSubsection = null;

        break;
    }

    pendingHeading = null;

    return true;
  }

  // =======================================================
  // MAIN LOOP
  // =======================================================

  for (let index = 0; index < elements.length; index++) {
    const text = normalizeText($(elements[index]).text());

    if (!text) {
      continue;
    }

    // -----------------------------------------------------
    // 1. WAIT UNTIL ACTUAL LAW STARTS
    // -----------------------------------------------------

    if (!lawStarted) {
      if (isMainLawStart(text)) {
        lawStarted = true;

        console.log("Main procedures law section found.");
      }

      continue;
    }

    // -----------------------------------------------------
    // 2. ARTICLE MARKER
    // -----------------------------------------------------

    const articleNumber = extractArticleNumber(text);

    if (articleNumber) {
      saveCurrentArticle();

      /*
       * If there was a structural heading without
       * a title after it, keep its label itself.
       */
      if (pendingHeading) {
        switch (pendingHeading.type) {
          case "book":
            currentBook = pendingHeading.label;
            break;

          case "part":
            currentPart = pendingHeading.label;
            break;

          case "chapter":
            currentChapter = pendingHeading.label;
            break;
        }

        pendingHeading = null;
      }

      articleOrder += 1;

      currentArticle = {
        article_number: articleNumber,

        article_order: articleOrder,

        division_title: null,

        book_title: currentBook,

        part_title: currentPart,

        chapter_title: currentChapter,

        section_title: currentSection,

        subsection_title: currentSubsection,

        title_ar: currentSubsection,

        status: "active",

        contentParts: [],
      };

      continue;
    }

    // -----------------------------------------------------
    // 3. BOOK / BAB / FASL
    // -----------------------------------------------------

    const structuralType = getStructuralHeadingType(text);

    if (structuralType) {
      saveCurrentArticle();

      pendingHeading = {
        type: structuralType,

        label: cleanHeading(text),
      };

      continue;
    }

    // -----------------------------------------------------
    // 4. TITLE AFTER BOOK / BAB / FASL
    // -----------------------------------------------------

    if (pendingHeading && looksLikeHeadingTitle(text)) {
      applyPendingHeadingTitle(text);

      continue;
    }

    // -----------------------------------------------------
    // 5. GENERAL HEADINGS OUTSIDE ARTICLES
    // -----------------------------------------------------

    /*
     * Before المادة 1:
     * أحكام عامة
     *
     * Other page sections may also appear
     * between structural headings and articles.
     */

    if (!currentArticle && looksLikeHeadingTitle(text)) {
      currentSubsection = cleanHeading(text);

      continue;
    }

    // -----------------------------------------------------
    // 6. ARTICLE CONTENT
    // -----------------------------------------------------

    if (currentArticle) {
      currentArticle.contentParts.push(text);

      continue;
    }
  }

  saveCurrentArticle();

  // =======================================================
  // VALIDATION
  // =======================================================

  const seen = new Set();

  const duplicates = [];

  for (const article of articles) {
    const number = article.article_number;

    if (seen.has(number)) {
      duplicates.push(number);
    }

    seen.add(number);
  }

  const uniqueDuplicates = [...new Set(duplicates)];

  const emptyArticles = articles
    .filter((article) => !article.content_ar?.trim())
    .map((article) => article.article_number);

  const repeatedArticles = articles
    .filter((article) => article.article_number.includes("مكرر"))
    .map((article) => article.article_number);

  const suspiciousContent = [];

  for (const article of articles) {
    const content = article.content_ar || "";

    if (
      /\nالكتاب\s+/i.test(content) ||
      /\nالباب\s+/i.test(content) ||
      /\nالفصل\s+/i.test(content)
    ) {
      suspiciousContent.push(article.article_number);
    }
  }

  // =======================================================
  // OUTPUT
  // =======================================================

  const output = {
    law: {
      title_ar: "قانون المرافعات المدنية والتجارية",

      short_title_ar: "قانون المرافعات",

      law_number: "13",

      law_year: 1968,

      source_name: "Alber Onsy",

      source_url: URL,
    },

    extracted_at: new Date().toISOString(),

    total_articles: articles.length,

    validation: {
      first_article: articles[0]?.article_number ?? null,

      last_article: articles[articles.length - 1]?.article_number ?? null,

      duplicate_article_numbers: uniqueDuplicates,

      empty_articles: emptyArticles,

      empty_articles_count: emptyArticles.length,

      repeated_articles: repeatedArticles,

      repeated_articles_count: repeatedArticles.length,

      suspicious_content: suspiciousContent,

      suspicious_content_count: suspiciousContent.length,
    },

    articles,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf8");

  // =======================================================
  // CONSOLE SUMMARY
  // =======================================================

  console.log("");
  console.log("==============================");

  console.log("SCRAPING COMPLETE");

  console.log("==============================");

  console.log(`Articles: ${articles.length}`);

  console.log(`First article: ${output.validation.first_article}`);

  console.log(`Last article: ${output.validation.last_article}`);

  console.log(
    `Duplicates: ${
      uniqueDuplicates.length ? uniqueDuplicates.join(", ") : "None"
    }`,
  );

  console.log(
    `Empty articles: ${
      emptyArticles.length ? emptyArticles.join(", ") : "None"
    }`,
  );

  console.log(`Empty articles count: ${emptyArticles.length}`);

  console.log(
    `Repeated articles: ${
      repeatedArticles.length ? repeatedArticles.join(", ") : "None"
    }`,
  );

  console.log(`Suspicious content count: ${suspiciousContent.length}`);

  console.log("");

  console.log(`Saved → ${OUTPUT_FILE}`);
}

// =========================================================
// RUN
// =========================================================

scrape().catch((error) => {
  console.error("");
  console.error("SCRAPING FAILED");

  console.error(error);

  process.exit(1);
});
