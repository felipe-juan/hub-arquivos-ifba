# Native OCR importer

This version adds a browser-native document ingestion flow inspired by Paperless-ngx.

## What it does

- Opens PDF/image files directly in the browser.
- For PDFs, tries to extract the real text layer first.
- In `auto` mode, OCR is used only when the PDF has too little text.
- In `force` mode, OCR is used on all processed pages.
- Splits extracted text into page-aware chunks.
- Suggests academic tags from the document content.
- Creates a document object compatible with `data.js`.
- Can save imported documents in this browser using localStorage.
- Can export/copy JSON so the document can be published in the static site.

## Why this is different from the previous workflow

The previous workflow depended on running OCRMyPDF/Tesseract in the terminal before adding documents.
This one lets the app do the import from `admin.html`.

## Limits

This is still a static/free-site approach. The browser processes the document, but the site has no shared cloud database yet.
For a public archive, after importing and reviewing a document, copy the generated JSON into `data.js` and put the PDF in `documents/` or use the official source URL.

Browser OCR is slower than a dedicated server. For large scanned PDFs, process a limited number of pages first, review quality, then increase the limit.

## Paperless-ngx ideas adapted

- Text-first OCR strategy: do not OCR born-digital PDFs unnecessarily.
- OCR modes: auto/text-only/force.
- Sidecar-like text result: extracted text is stored separately from the PDF.
- Page-aware chunks for search.
- Automatic tag suggestion.
- Duplicate checksum.
- Manual review before verification.
