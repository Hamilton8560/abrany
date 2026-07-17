import JSZip from "jszip";
import { marked } from "marked";

/**
 * Build a valid EPUB 3 (Kindle-compatible via Send-to-Kindle) entirely in JS —
 * no native deps. Cover is an SVG page in the same design language as the app's
 * BookCover; chapters are the generated markdown converted to XHTML.
 */

export type EpubChapter = { title: string; markdown: string };
export type EpubBook = {
  title: string;
  author: string;
  language: string; // e.g. "en"
  chapters: EpubChapter[];
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Close void elements so marked's HTML parses as XHTML in strict readers. */
function toXhtml(html: string): string {
  return html
    .replace(/<(br|hr)>/g, "<$1/>")
    .replace(/<img([^>]*?)\s*\/?>(?!<\/img>)/g, "<img$1/>")
    .replace(/&nbsp;/g, "&#160;");
}

/** Books read as prose — swap diagram code fences for a quiet figure note. */
function stripDiagramFences(md: string): string {
  return md.replace(/```(?:mermaid|arch)[\s\S]*?```/g, "*[Figure: see the interactive version in Abrany]*");
}

const CSS = `
body { font-family: Georgia, 'Times New Roman', serif; line-height: 1.65; margin: 0 5%; color: #1b2436; }
h1, h2, h3 { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1b2436; line-height: 1.15; }
h1 { font-size: 1.7em; margin: 1.6em 0 0.2em; }
.chapter-label { font-family: 'Helvetica Neue', Arial, sans-serif; color: #ff4326; font-size: 0.8em; letter-spacing: 0.18em; text-transform: uppercase; margin-top: 2.5em; }
h2 { font-size: 1.25em; margin-top: 1.6em; }
p { margin: 0.8em 0; }
blockquote { border-left: 3px solid #ff4326; margin-left: 0; padding-left: 1em; color: #444; }
table { border-collapse: collapse; margin: 1em 0; } td, th { border: 1px solid #cfd8e3; padding: 0.35em 0.6em; }
code { font-family: Menlo, monospace; font-size: 0.9em; background: #f0f3f8; padding: 0 0.25em; }
pre { background: #f0f3f8; padding: 0.8em; overflow-x: auto; }
hr { border: none; border-top: 1px solid #d9e0ea; margin: 2em auto; width: 40%; }
`;

function coverSvg(title: string, author: string): string {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > 16) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  const shown = lines.slice(0, 5);
  const size = shown.some((l) => l.length > 13) ? 88 : 108;
  const startY = 1180 - shown.length * (size * 1.12);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1500" viewBox="0 0 1000 1500">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#232e45"/><stop offset="0.5" stop-color="#1b2436"/><stop offset="1" stop-color="#141b2a"/>
    </linearGradient>
    <linearGradient id="acc" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ff4326"/><stop offset="1" stop-color="#ff8a3d"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ff4326" stop-opacity="0.35"/><stop offset="1" stop-color="#ff4326" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1000" height="1500" fill="url(#bg)"/>
  <ellipse cx="500" cy="700" rx="430" ry="380" fill="url(#glow)"/>
  <g stroke="#ffb49e" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" transform="translate(320,470) scale(15)">
    <path d="M12 3.2c-2.1 0-3.6 1.3-3.9 3-1.7.3-2.9 1.7-2.9 3.5 0 1 .4 1.9 1.1 2.5-.2.4-.3.9-.3 1.4 0 1.8 1.4 3.2 3.3 3.4.4 1.5 1.8 2.6 3.6 2.6" stroke-width="1.1"/>
    <path d="M12 3.2c2.1 0 3.6 1.3 3.9 3 1.7.3 2.9 1.7 2.9 3.5 0 1-.4 1.9-1.1 2.5.2.4.3.9.3 1.4 0 1.8-1.4 3.2-3.3 3.4-.4 1.5-1.8 2.6-3.6 2.6" stroke-width="1.1"/>
    <path d="M12 6v13" stroke-width="1.1"/>
  </g>
  <text x="90" y="120" font-family="Arial, sans-serif" font-size="40" font-weight="800" letter-spacing="14" fill="#ffffff">ABRANY</text>
  <rect x="90" y="${startY - 90}" width="150" height="12" rx="6" fill="url(#acc)"/>
  ${shown
    .map(
      (l, i) =>
        `<text x="90" y="${startY + i * size * 1.12}" font-family="Arial, sans-serif" font-size="${size}" font-weight="800" fill="#ffffff">${esc(l.toUpperCase())}</text>`,
    )
    .join("\n  ")}
  <text x="90" y="1400" font-family="Arial, sans-serif" font-size="38" fill="#b9c2d4">${esc(author)}</text>
</svg>`;
}

export async function buildEpub(book: EpubBook): Promise<Buffer> {
  const zip = new JSZip();
  const uid = `abrany-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const lang = book.language || "en";

  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );

  const xhtml = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="styles.css"/></head>
<body>${body}</body></html>`;

  zip.file("OEBPS/styles.css", CSS);
  zip.file("OEBPS/cover.svg", coverSvg(book.title, book.author));
  zip.file(
    "OEBPS/cover.xhtml",
    xhtml(book.title, `<div style="text-align:center;margin:0;padding:0;"><img src="cover.svg" alt="${esc(book.title)}" style="max-width:100%;height:auto;"/></div>`),
  );

  // title page
  zip.file(
    "OEBPS/title.xhtml",
    xhtml(
      book.title,
      `<div style="margin-top:30%;text-align:center;">
        <p style="color:#ff4326;letter-spacing:0.2em;font-family:Arial,sans-serif;font-size:0.85em;">ABRANY</p>
        <h1 style="font-size:2em;">${esc(book.title)}</h1>
        <p style="color:#5c6675;">${esc(book.author)}</p>
      </div>`,
    ),
  );

  // chapters
  const files: { id: string; href: string; title: string }[] = [];
  book.chapters.forEach((ch, i) => {
    const html = toXhtml(marked.parse(stripDiagramFences(ch.markdown), { async: false }) as string);
    const href = `chapter-${i + 1}.xhtml`;
    files.push({ id: `ch${i + 1}`, href, title: ch.title });
    zip.file(
      `OEBPS/${href}`,
      xhtml(ch.title, `<p class="chapter-label">Chapter ${i + 1}</p><h1>${esc(ch.title)}</h1>\n${html}`),
    );
  });

  // nav
  zip.file(
    "OEBPS/nav.xhtml",
    xhtml(
      "Contents",
      `<nav epub:type="toc" id="toc"><h1>Contents</h1><ol>
        ${files.map((f) => `<li><a href="${f.href}">${esc(f.title)}</a></li>`).join("\n")}
      </ol></nav>`,
    ),
  );

  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="${lang}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">${uid}</dc:identifier>
    <dc:title>${esc(book.title)}</dc:title>
    <dc:creator>${esc(book.author)}</dc:creator>
    <dc:language>${lang}</dc:language>
    <dc:publisher>Abrany</dc:publisher>
    <meta property="dcterms:modified">${now}</meta>
  </metadata>
  <manifest>
    <item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${files.map((f) => `<item id="${f.id}" href="${f.href}" media-type="application/xhtml+xml"/>`).join("\n    ")}
  </manifest>
  <spine>
    <itemref idref="cover"/>
    <itemref idref="title"/>
    <itemref idref="nav"/>
    ${files.map((f) => `<itemref idref="${f.id}"/>`).join("\n    ")}
  </spine>
</package>`,
  );

  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" }) as Promise<Buffer>;
}
