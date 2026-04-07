"""
Confluence Crawler

Given a Confluence page URL, recursively fetches all sub-page links,
strips images and Figma embeds, and dumps the cleaned text content
of every page into a single output file.

Usage:
    python confluence_crawler.py <confluence_url> [--output out.txt] [--max-pages N]

Auth:
    Set CONFLUENCE_USER and CONFLUENCE_TOKEN environment variables
    (the token is an Atlassian API token).
"""

import argparse
import os
import re
import sys
from collections import deque
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup


FIGMA_HOSTS = ("figma.com", "www.figma.com")
SKIP_TAGS = ("img", "picture", "svg", "video", "iframe", "object", "embed")


def get_auth():
    user = os.environ.get("CONFLUENCE_USER")
    token = os.environ.get("CONFLUENCE_TOKEN")
    if not user or not token:
        return None
    return (user, token)


def is_same_confluence_space(url, base_netloc, base_path_prefix):
    """Restrict crawling to the same host and path prefix (e.g. /wiki/spaces/FOO/)."""
    parsed = urlparse(url)
    if parsed.netloc and parsed.netloc != base_netloc:
        return False
    return parsed.path.startswith(base_path_prefix)


def fetch(url, session):
    try:
        resp = session.get(url, timeout=30)
        resp.raise_for_status()
        return resp.text
    except requests.RequestException as e:
        print(f"  ! failed: {e}", file=sys.stderr)
        return None


def clean_html(html):
    """Strip images, Figma embeds, scripts, styles. Return (title, text)."""
    soup = BeautifulSoup(html, "html.parser")

    # Drop non-text / media tags entirely
    for tag in soup(("script", "style", "noscript") + SKIP_TAGS):
        tag.decompose()

    # Drop anchors that link to Figma or image files
    for a in soup.find_all("a", href=True):
        href = a["href"].lower()
        if any(host in href for host in FIGMA_HOSTS) or re.search(
            r"\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)", href
        ):
            a.decompose()

    title_tag = soup.find("title")
    title = title_tag.get_text(strip=True) if title_tag else "(untitled)"

    # Prefer the main content container if present
    content = soup.find("div", id="main-content") or soup.body or soup
    text = content.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return title, text


def extract_links(html, current_url, base_netloc, base_path_prefix):
    soup = BeautifulSoup(html, "html.parser")
    links = set()
    for a in soup.find_all("a", href=True):
        absolute = urljoin(current_url, a["href"]).split("#")[0]
        if is_same_confluence_space(absolute, base_netloc, base_path_prefix):
            links.add(absolute)
    return links


def crawl(start_url, output_path, max_pages):
    parsed = urlparse(start_url)
    base_netloc = parsed.netloc
    # Use the directory of the start URL as the path prefix to stay in-space
    base_path_prefix = parsed.path.rsplit("/", 1)[0] + "/"

    session = requests.Session()
    auth = get_auth()
    if auth:
        session.auth = auth

    seen = set()
    queue = deque([start_url])
    written = 0

    with open(output_path, "w", encoding="utf-8") as out:
        while queue and written < max_pages:
            url = queue.popleft()
            if url in seen:
                continue
            seen.add(url)

            print(f"[{written + 1}/{max_pages}] {url}")
            html = fetch(url, session)
            if html is None:
                continue

            title, text = clean_html(html)
            out.write(f"\n\n{'=' * 80}\n")
            out.write(f"URL: {url}\n")
            out.write(f"TITLE: {title}\n")
            out.write(f"{'=' * 80}\n\n")
            out.write(text)
            out.write("\n")
            written += 1

            for link in extract_links(html, url, base_netloc, base_path_prefix):
                if link not in seen:
                    queue.append(link)

    print(f"\nDone. Wrote {written} pages to {output_path}")


def main():
    parser = argparse.ArgumentParser(description="Confluence text crawler")
    parser.add_argument("url", help="Confluence page URL to start from")
    parser.add_argument("--output", default="confluence_dump.txt", help="Output file")
    parser.add_argument("--max-pages", type=int, default=200, help="Max pages to crawl")
    args = parser.parse_args()

    crawl(args.url, args.output, args.max_pages)


if __name__ == "__main__":
    main()
