# El Shamel Data Importer

Node.js data pipeline for collecting, cleaning, validating, and importing Egyptian legislation for the **El Shamel LegalTech** platform.

## What this project does

- Scrapes Egyptian legislation from public legal sources.
- Extracts article numbers, article text, and legal hierarchy.
- Preserves division, book, part, chapter, section, and subsection structure.
- Cleans source-specific formatting and malformed hierarchy.
- Validates duplicate article numbers, empty articles, and suspicious content.
- Produces normalized JSON datasets.
- Imports validated legal data into Supabase.

## Tech stack

- Node.js
- JavaScript ES Modules
- Cheerio
- Supabase
- dotenv

## Project structure

```text
src/
  scrapers/     # Source extraction
  cleaners/     # Normalization and law-specific corrections
  importers/    # Validated Supabase import scripts

data/
  source/       # Saved HTML source pages used by local scrapers
  raw/          # Scraper output before cleanup
  final/        # Cleaned and validated datasets ready for import

.env.example
package.json
README.md
```

Source pages and generated datasets are organized under `data/source`, `data/raw`, and `data/final`. Scrapers, cleaners, and importers use these paths directly.

## Pipeline

```text
Public legal source
      ↓
Scraper
      ↓
Raw JSON
      ↓
Cleaner / validation
      ↓
Final JSON
      ↓
Supabase importer
      ↓
El Shamel
```

Example — Egyptian Civil Law:

```bash
npm run scrape:civil
npm run clean:civil
npm run import:civil
```

Run scraping + cleaning:

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

Add your own local credentials:

```env
SUPABASE_URL=your-project-url
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

> Never commit the real `.env` file or a Supabase service-role key.

## Supported legal datasets

The repository includes dedicated workflows for:

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

A normalized article can include:

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

The scripts include checks for:

- duplicate article numbers
- empty article content
- unexpected hierarchy headings inside article text
- first and last extracted article
- extracted article totals
- law-specific expected counts where available

Always review validation output before importing a dataset into Supabase.

## Security

- `.env` is ignored by Git.
- `.env.example` contains variable names only.
- Supabase service-role credentials stay local.
- Secrets must never be hardcoded in scraper, cleaner, or importer files.

## Author

Mohammed Yassien
