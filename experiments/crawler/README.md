# Experiment: Confluence Crawler

## Objective

Given a Confluence page URL, recursively fetch all sub-page links within
the same space and dump cleaned text content into a single file. Strip
out images and Figma embeds — keep only readable text.

## Motivation

Useful for offline reading, feeding documentation into LLMs as context,
or archiving a knowledge base section without binary noise.

## Approach

1. Start from the provided Confluence URL
2. BFS over links restricted to the same host + path prefix (keeps the
   crawl scoped to a single space/section)
3. For each page:
   - Drop `<script>`, `<style>`, `<img>`, `<svg>`, `<video>`, `<iframe>`,
     `<object>`, `<embed>`, `<picture>`
   - Drop anchors pointing to `figma.com` or image file extensions
   - Extract text from `#main-content` if present, else `<body>`
4. Append each page (URL, title, text) to a single output file

## Setup

```bash
pip install requests beautifulsoup4

# For private Confluence instances
export CONFLUENCE_USER="you@example.com"
export CONFLUENCE_TOKEN="your_atlassian_api_token"
```

## Usage

```bash
python confluence_crawler.py \
    "https://your-org.atlassian.net/wiki/spaces/ENG/pages/12345/Home" \
    --output eng_docs.txt \
    --max-pages 500
```

## Notes & Future Work

- Currently uses anonymous HTML scraping; switching to the Confluence
  REST API (`/rest/api/content`) would be more reliable for permissions
  and would yield clean storage-format content
- Add concurrency with a worker pool for large spaces
- Add a `--include-tables` flag to preserve tabular data as Markdown
- Respect `robots.txt` and add a polite rate limit

---

[Back to Experiments](../index.md)
