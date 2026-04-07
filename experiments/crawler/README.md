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
pip install requests beautifulsoup4 browser_cookie3
```

## Auth

By default the crawler reuses your **local browser session** — if you're
already signed in to Confluence in Chrome (or Firefox/Edge/Safari/Brave),
it will read those cookies and crawl as you. No tokens, no manual login.

```bash
# Default: Chrome
python confluence_crawler.py "https://your-org.atlassian.net/wiki/spaces/ENG/pages/12345/Home"

# Or pick a different browser
python confluence_crawler.py <url> --browser firefox
```

If you'd rather use an API token:

```bash
export CONFLUENCE_USER="you@example.com"
export CONFLUENCE_TOKEN="your_atlassian_api_token"
python confluence_crawler.py <url>
```

## Usage

```bash
python confluence_crawler.py \
    "https://your-org.atlassian.net/wiki/spaces/ENG/pages/12345/Home" \
    --output eng_docs.txt \
    --max-pages 500 \
    --browser chrome
```

> **Note:** On macOS, reading Chrome/Safari cookies may prompt for keychain
> access the first time. On Linux, Chrome cookies are decrypted via the
> Gnome keyring or KWallet.

## Notes & Future Work

- Currently uses anonymous HTML scraping; switching to the Confluence
  REST API (`/rest/api/content`) would be more reliable for permissions
  and would yield clean storage-format content
- Add concurrency with a worker pool for large spaces
- Add a `--include-tables` flag to preserve tabular data as Markdown
- Respect `robots.txt` and add a polite rate limit

---

[Back to Experiments](../index.md)
