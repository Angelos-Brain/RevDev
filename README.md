# RevDev

RevDev is a free, browser-first study helper for college students. The goal is to turn uploaded study files into three exam-prep modes: Mock Exam, Flashcards, and Summary Reviewer.

## Current status

Milestone 1 is complete on the `build-revdev` branch.

It includes:

- Responsive static website in `/docs`
- PDF text extraction with PDF.js
- DOCX text extraction with Mammoth
- PPTX slide-text extraction with JSZip
- TXT and Markdown extraction
- Multiple-file upload
- Drag-and-drop upload
- Extracted-text preview
- Clear handling for scanned/image-only files with no readable text
- No backend server and no API key required for this milestone

Milestones 2 and 3 will add Gemini/Groq AI generation, chunking, retry/backoff, JSON validation, topic selection, flashcards, summary reviewers, mock exams, scoring, CSV export, and print-to-PDF.

## GitHub Pages setup

GitHub Pages supports publishing from a branch and the `/docs` folder. urlGitHub Pages publishing-source documentationhttps://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

1. Open the RevDev repository on GitHub.
2. Switch to the `build-revdev` branch.
3. Open **Settings**.
4. Open **Pages** under **Code, planning, and automation**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Choose branch `build-revdev`.
7. Choose folder `/docs`.
8. Click **Save**.
9. Open the generated Pages URL shown by GitHub.

For GitHub Free, the repository must be public for GitHub Pages. urlGitHub Pages guidehttps://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site

## CDN libraries

The site uses exact pinned CDN versions:

- PDF.js / pdfjs-dist 6.4.299
- Mammoth 1.13.0
- JSZip 3.10.2

These versions were checked against the package/documentation sources available on October 7, 2026. PDF.js documents CDN use for pdfjs-dist; the npm package currently lists 6.4.299. Mammoth currently lists 1.13.0. JSZip currently lists 3.10.2. urlPDF.js getting startedhttps://mozilla.github.io/pdf.js/getting_started/ urlpdfjs-dist on npmhttps://www.npmjs.com/package/pdfjs-dist urlMammoth on npmhttps://www.npmjs.com/package/mammoth urlJSZip documentationhttps://stuk.github.io/jszip/

## Privacy

Files are read in the browser. The planned AI milestone will send only extracted text to the AI provider selected by the user. API keys will be stored only in browser localStorage and never committed to this repository.

Scanned or image-only files are not OCRed in the current milestone. When a file contains no readable text, RevDev tells the user instead of pretending it extracted content.

## Repository rules

- Work happens on `build-revdev` until explicitly approved otherwise.
- Never commit API keys, tokens, passwords, or other secrets.
- Keep the app static and free to run.
- No build step is required.
