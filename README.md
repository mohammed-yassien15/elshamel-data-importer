# El Shamel Data Importer

Node.js data pipeline for collecting, cleaning, validating, and preparing Egyptian legislation for the **El Shamel LegalTech** platform.

The project contains law-specific scrapers and cleanup scripts that transform public legal web content into structured JSON ready for database import.

## What this project does

- Scrapes Egyptian legislation from public legal sources.
- Extracts article numbers, article text, and legal hierarchy.
- Preserves hierarchy such as division, book, part, chapter, section, and subsection.
- Cleans malformed or misplaced headings from article content.
- Handles special legal states such as repealed articles where supported by the source data.
- Runs validation checks for duplicate article numbers, empty articles, and suspicious hierarchy text.
- Produces normalized JSON datasets for use by El Shamel.
- Supports Supabase-based import workflows through environment variables without exposing credentials.

## Tech stack

- Node.js
- JavaScript ES Modules
- Cheerio
- Supabase
- dotenv

## Current workflow

Most laws follow a two-stage pipeline:

```text
Public legal source
      ↓
Scraper
      ↓
Raw JSON
      ↓
Cleanup / normalization
      ↓
Validated final JSON
      ↓
Supabase / El Shamel
```

For example, the Egyptian Civil Law pipeline is:

```bash
npm run scrape:civil
npm run clean:civil
```

Or run both stages:

```bash
npm run pipeline:civil
```

## Setup

```bash
git clone https://github.com/mohammed-yassien15/elshamel-data-importer.git
cd elshamel-data-importer
npm install
cp .env.example .env
```

Then add your own values:

```env
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Never commit the real `.env` file or a Supabase service-role key.

## Supported legal datasets

The repository includes dedicated scraping and cleaning scripts for multiple Egyptian laws, including:

- Civil Law
- Civil and Commercial Procedures Law
- Evidence Law
- Penal Code
- Criminal Procedure Law
- Personal Status laws
- Family Courts Law
- Family Insurance Fund Law
- Labor Law
- Commercial Law
- Companies Law

## Data model

A normalized article can contain:

```json
{
  "article_number": "1",
  "article_order": 1,
  "division_title": null,
  "book_title": null,
  "part_title": "باب تمهيدي",
  "chapter_title": "الفصل الأول",
  "section_title": null,
  "subsection_title": null,
  "title_ar": null,
  "status": "active",
  "content_ar": "..."
}
```

## Validation

Scrapers and cleanup scripts include checks for:

- duplicate article numbers
- empty article content
- unexpected hierarchy headings inside article text
- first and last extracted article
- total extracted article count

Always review validation output before importing a dataset into the production database.

## Security

- `.env` is ignored by Git.
- `.env.example` contains variable names only.
- Supabase service-role credentials must remain local.
- Do not place secrets directly inside scraper or importer source files.

## Project purpose

This repository is the data-engineering companion to **El Shamel**, a LegalTech platform focused on making Egyptian legislation easier to structure, search, and read in a mobile experience.

## Author

Mohammed Yassien
