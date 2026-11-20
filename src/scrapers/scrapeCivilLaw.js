import * as cheerio from "cheerio";
import fs from "fs";

const URL = "https://nexuscharter.com/ar/egyptian-civil-law/";

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
  const arabicDigits = "٠١٢٣٤٥٦٧٨٩";

  return value.replace(/[٠-٩]/g, (digit) =>
    String(arabicDigits.indexOf(digit)),
  );
}

function extractArticleNumber(text) {
  const match = text.match(/^مادة\s*\(?\s*([٠-٩0-9]+)\s*\)?\s*:?\s*$/);

  if (!match) return null;

  return arabicToEnglishDigits(match[1]);
}

// =========================================================
// HEADING HELPERS
// =========================================================

function cleanHeading(text) {
  return text.replace(/^\(+/, "").replace(/\)+$/, "").replace(/:$/, "").trim();
}

function getMainHeadingType(text) {
  const cleaned = cleanHeading(text);

  if (/^القسم\s+/i.test(cleaned)) {
    return "division";
  }

  if (/^الكتاب\s+/i.test(cleaned)) {
    return "book";
  }

  if (/^الباب\s+/i.test(cleaned) || /^باب\s+/i.test(cleaned)) {
    return "part";
  }

  if (/^الفصل\s+/i.test(cleaned)) {
    return "chapter";
  }

  return null;
}

function looksLikeNumberedSection(text) {
  const cleaned = cleanHeading(text);

  if (!/^[٠-٩0-9]+\s*[-–—]\s*.+/.test(cleaned)) {
    return false;
  }

  if (cleaned.length > 65) {
    return false;
  }

  if (cleaned.includes("،") || cleaned.includes("؛") || cleaned.includes(".")) {
    return false;
  }

  return true;
}

function looksLikeSmallHeading(text) {
  const cleaned = cleanHeading(text);

  if (!cleaned) return false;

  if (cleaned.length > 60) return false;

  if (
    cleaned.includes("،") ||
    cleaned.includes("؛") ||
    cleaned.includes(".") ||
    cleaned.includes("؟")
  ) {
    return false;
  }

  const proseStarts = [
    "إذا ",
    "يجوز ",
    "لا يجوز ",
    "يكون ",
    "تكون ",
    "يسري ",
    "تسري ",
    "يعتبر ",
    "تعتبر ",
    "لكل ",
    "كل ",
    "من ",
    "على ",
    "في ",
    "لا ",
    "أما ",
    "ومع ذلك",
    "يجب ",
    "يلتزم ",
    "تنقضي ",
    "يجري ",
    "تثبت ",
    "تحسب ",
    "يقع ",
    "تنشأ ",
    "ينقضي ",
    "يفترض ",
    "يلزم ",
  ];

  if (proseStarts.some((prefix) => cleaned.startsWith(prefix))) {
    return false;
  }

  const words = cleaned.split(/\s+/);

  return words.length <= 7;
}

function isRepealedRange(text) {
  return /^المواد?\s+من\s+\(?[٠-٩0-9]+\)?\s+(إلى|الى)\s+\(?[٠-٩0-9]+\)?/i.test(
    text,
  );
}

// =========================================================
// LOOK AHEAD HELPERS
// =========================================================

function getNextMeaningfulText(elements, $, currentIndex) {
  for (let i = currentIndex + 1; i < elements.length; i++) {
    const nextText = normalizeText($(elements[i]).text());

    if (nextText) {
      return nextText;
    }
  }

  return null;
}

function getNextTwoMeaningfulTexts(elements, $, currentIndex) {
  const results = [];

  for (
    let i = currentIndex + 1;
    i < elements.length && results.length < 2;
    i++
  ) {
    const nextText = normalizeText($(elements[i]).text());

    if (nextText) {
      results.push(nextText);
    }
  }

  return results;
}

function isHeadingBeforeNextArticle(text, elements, $, index) {
  const nextTexts = getNextTwoMeaningfulTexts(elements, $, index);

  if (!nextTexts.length) {
    return false;
  }

  const firstNext = nextTexts[0];
  const secondNext = nextTexts[1];

  /*
   * Case:
   *
   * ٢ – تطبيق القانون
   * تنازع القوانين من حيث الزمان
   * مادة (6)
   */
  if (
    looksLikeNumberedSection(text) &&
    secondNext &&
    extractArticleNumber(secondNext)
  ) {
    return true;
  }

  /*
   * Case:
   *
   * البطلان:
   * مادة (138)
   */
  if (looksLikeSmallHeading(text) && extractArticleNumber(firstNext)) {
    return true;
  }

  /*
   * Case:
   *
   * ٣ – تنازع القوانين من حيث المكان
   * مادة (10)
   */
  if (looksLikeNumberedSection(text) && extractArticleNumber(firstNext)) {
    return true;
  }

  return false;
}

// =========================================================
// SCRAPER
// =========================================================

async function scrape() {
  console.log("Fetching page...");

  const response = await fetch(URL);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch page: ${response.status} ${response.statusText}`,
    );
  }

  const html = await response.text();

  const $ = cheerio.load(html);

  let root = $(".entry-content").first();

  if (!root.length) {
    root = $("article").first();
  }

  if (!root.length) {
    root = $("main").first();
  }

  if (!root.length) {
    throw new Error("Could not find article content container.");
  }

  const elements = root.find("p, h1, h2, h3, h4, h5, h6, li").toArray();

  const articles = [];

  // Current hierarchy
  let currentDivision = null;
  let currentBook = null;
  let currentPart = null;
  let currentChapter = null;
  let currentSection = null;
  let currentSubsection = null;

  // Current article
  let currentArticle = null;

  let articleOrder = 0;

  // =======================================================
  // SAVE ARTICLE
  // =======================================================

  function saveCurrentArticle() {
    if (!currentArticle) return;

    const content = currentArticle.contentParts
      .map(normalizeText)
      .filter(Boolean)
      .join("\n")
      .trim();

    currentArticle.content_ar = content;

    delete currentArticle.contentParts;

    articles.push(currentArticle);

    currentArticle = null;
  }

  // =======================================================
  // APPLY MAIN HIERARCHY
  // =======================================================

  function applyMainHeading(type, text) {
    const cleaned = cleanHeading(text);

    switch (type) {
      case "division":
        currentDivision = cleaned;

        currentBook = null;
        currentPart = null;
        currentChapter = null;
        currentSection = null;
        currentSubsection = null;
        break;

      case "book":
        currentBook = cleaned;

        currentPart = null;
        currentChapter = null;
        currentSection = null;
        currentSubsection = null;
        break;

      case "part":
        currentPart = cleaned;

        currentChapter = null;
        currentSection = null;
        currentSubsection = null;
        break;

      case "chapter":
        currentChapter = cleaned;

        currentSection = null;
        currentSubsection = null;
        break;
    }
  }

  // =======================================================
  // MAIN LOOP
  // =======================================================

  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];

    const text = normalizeText($(element).text());

    if (!text) continue;

    // -----------------------------------------------------
    // 1. NEW ARTICLE
    // -----------------------------------------------------

    const articleNumber = extractArticleNumber(text);

    if (articleNumber) {
      saveCurrentArticle();

      articleOrder += 1;

      currentArticle = {
        article_number: articleNumber,
        article_order: articleOrder,

        division_title: currentDivision,
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
    // 2. MAIN HIERARCHY
    // -----------------------------------------------------

    const mainHeadingType = getMainHeadingType(text);

    if (mainHeadingType) {
      saveCurrentArticle();

      applyMainHeading(mainHeadingType, text);

      continue;
    }

    // -----------------------------------------------------
    // 3. REPEALED RANGE
    // -----------------------------------------------------

    if (isRepealedRange(text)) {
      saveCurrentArticle();

      currentSubsection = cleanHeading(text);

      continue;
    }

    // -----------------------------------------------------
    // 4. NUMBERED SECTION WITH LOOK AHEAD
    // -----------------------------------------------------

    if (looksLikeNumberedSection(text)) {
      const nextText = getNextMeaningfulText(elements, $, index);

      const nextTwo = getNextTwoMeaningfulTexts(elements, $, index);

      const nextIsArticle = nextText && extractArticleNumber(nextText);

      const secondIsArticle = nextTwo[1] && extractArticleNumber(nextTwo[1]);

      /*
       * Heading case:
       *
       * ٢ – تطبيق القانون
       * تنازع القوانين من حيث الزمان
       * مادة 6
       */

      if (nextIsArticle || secondIsArticle) {
        saveCurrentArticle();

        currentSection = cleanHeading(text);

        currentSubsection = null;

        continue;
      }

      /*
       * Otherwise this numbered line is
       * article content.
       */
    }

    // -----------------------------------------------------
    // 5. SMALL HEADING WITH LOOK AHEAD
    // -----------------------------------------------------

    if (looksLikeSmallHeading(text)) {
      const nextText = getNextMeaningfulText(elements, $, index);

      /*
       * Example:
       *
       * البطلان:
       * مادة 138
       */

      if (nextText && extractArticleNumber(nextText)) {
        saveCurrentArticle();

        currentSubsection = cleanHeading(text);

        continue;
      }

      /*
       * Example:
       *
       * تنازع القوانين من حيث الزمان
       * مادة 6
       */

      const nextTwo = getNextTwoMeaningfulTexts(elements, $, index);

      if (nextTwo[0] && extractArticleNumber(nextTwo[0])) {
        saveCurrentArticle();

        currentSubsection = cleanHeading(text);

        continue;
      }

      /*
       * If there is no active article,
       * it's safe to use as a subsection.
       */
      if (!currentArticle) {
        currentSubsection = cleanHeading(text);

        continue;
      }
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

  const articleNumbers = articles
    .map((article) => Number(article.article_number))
    .filter(Number.isFinite);

  const duplicates = articleNumbers.filter(
    (number, index) => articleNumbers.indexOf(number) !== index,
  );

  const uniqueDuplicates = [...new Set(duplicates)];

  const emptyArticles = articles
    .filter((article) => !article.content_ar?.trim())
    .map((article) => article.article_number);

  // =======================================================
  // EXTRA VALIDATION
  // =======================================================

  const suspiciousContent = [];

  for (const article of articles) {
    const content = article.content_ar || "";

    if (
      /\nالقسم\s+/i.test(content) ||
      /\nالكتاب\s+/i.test(content) ||
      /\nالباب\s+/i.test(content) ||
      /\nالفصل\s+/i.test(content)
    ) {
      suspiciousContent.push({
        article_number: article.article_number,

        reason: "Hierarchy heading found inside content",
      });
    }
  }

  // =======================================================
  // OUTPUT
  // =======================================================

  const output = {
    law: {
      title_ar: "القانون المدني المصري",

      law_number: "131",

      law_year: 1948,

      source_name: "Nexus & Charter",

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

      suspicious_content: suspiciousContent,

      suspicious_content_count: suspiciousContent.length,
    },

    articles,
  };

  fs.writeFileSync(
    "data/raw/egyptian-civil-law.json",
    JSON.stringify(output, null, 2),
    "utf8",
  );

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

  console.log(`Suspicious content count: ${suspiciousContent.length}`);

  if (suspiciousContent.length) {
    console.log("Suspicious articles:");

    console.log(
      suspiciousContent.map((item) => item.article_number).join(", "),
    );
  }

  console.log("");

  console.log("Saved → data/raw/egyptian-civil-law.json");
}

// =========================================================
// RUN
// =========================================================

scrape().catch((error) => {
  console.error("");

  console.error("Scraping failed:");

  console.error(error);

  process.exit(1);
});
