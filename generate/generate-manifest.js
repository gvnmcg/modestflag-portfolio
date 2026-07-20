/**
 * generate-manifest.js
 * Converts markdown files into static HTML pages using the site template,
 * and maintains content-manifest.json (title, tags, upload date) without
 * clobbering hand-edited manifest fields on re-runs.
 *
 * Usage:
 *   node generate/generate-manifest.js                  regenerate everything
 *   node generate/generate-manifest.js --file DSP.md     regenerate just one file
 *   node generate/generate-manifest.js [mdDir] [outDir]  override folders
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TEMPLATE_PATH = path.join(ROOT, 'generate/template');
const MANIFEST_PATH = path.join(ROOT, 'content-manifest.json');
const INDEX_PATH = path.join(ROOT, 'index.html');
const LINKS_START = '<!-- AUTO-GENERATED-LINKS:START -->';
const LINKS_END = '<!-- AUTO-GENERATED-LINKS:END -->';

function parseArgs(argv) {
  const positional = [];
  let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--file' || argv[i] === '-f') {
      file = argv[++i];
    } else {
      positional.push(argv[i]);
    }
  }
  return { file, positional };
}

const { file: ONLY_FILE, positional } = parseArgs(process.argv.slice(2));
const MD_DIR = path.join(ROOT, positional[0] || 'content');
const OUT_DIR = path.join(ROOT, positional[1] || 'content');

function getTitle(markdown, fallback) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function titleCaseFromFilename(filename) {
  return path
    .basename(filename, '.md')
    .replace(/[-_]/g, ' ')
    .trim();
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function toWebPath(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join('/');
}

function readExistingManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch (err) {
    console.warn(`Could not parse existing ${toWebPath(MANIFEST_PATH)}, starting fresh: ${err.message}`);
    return [];
  }
}

function writeManifest(pages) {
  const sorted = [...pages].sort((a, b) => new Date(b.date) - new Date(a.date));
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(sorted, null, 2));
  console.log(`Wrote ${toWebPath(MANIFEST_PATH)} (${sorted.length} pages)`);
  return sorted;
}

function updateHomeLinks(pages) {
  if (!fs.existsSync(INDEX_PATH)) return;

  const index = fs.readFileSync(INDEX_PATH, 'utf8');
  const startIdx = index.indexOf(LINKS_START);
  const endIdx = index.indexOf(LINKS_END);
  if (startIdx === -1 || endIdx === -1) {
    console.warn(`Skipped home page links: markers ${LINKS_START} / ${LINKS_END} not found in index.html`);
    return;
  }

  const links = pages
    .map((p) => `      <a href="${p.href}">${escapeHtml(p.label)}</a>`)
    .join('\n');

  const updated =
    index.slice(0, startIdx + LINKS_START.length) +
    '\n' + links + '\n      ' +
    index.slice(endIdx);

  fs.writeFileSync(INDEX_PATH, updated);
  console.log(`Updated home page links in ${toWebPath(INDEX_PATH)}`);
}

// Renders one markdown file to HTML and returns its fresh manifest fields
// (title/label/href/source). Caller merges in any preserved metadata (tags, date).
function renderPage(marked, template, file) {
  const markdown = fs.readFileSync(path.join(MD_DIR, file), 'utf8');
  const title = getTitle(markdown, titleCaseFromFilename(file));
  const label = titleCaseFromFilename(file);
  const contentHtml = marked.parse(markdown);

  const page = template
    .replace(/{{Title}}/g, title)
    .replace(/{{Content}}/g, contentHtml);

  const outName = path.basename(file, '.md').toLowerCase() + '.html';
  const outPath = path.join(OUT_DIR, outName);
  fs.writeFileSync(outPath, page);
  console.log(`Generated ${toWebPath(outPath)} from ${file}`);

  return { title, label, source: file, href: toWebPath(outPath) };
}

async function run() {
  const { marked } = await import('marked');
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  
  const existing = readExistingManifest();
  const bySource = new Map(existing.map((p) => [p.source, p]));
  
    if (!fs.existsSync(OUT_DIR)) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
    }

  function mergeEntry(file) {
    const fresh = renderPage(marked, template, file);
    const prior = bySource.get(file);
    return {
      ...fresh,
      tags: (prior && prior.tags) || [],
      date: (prior && prior.date) || new Date().toISOString(),
    };
  }

  let pages;
  if (ONLY_FILE) {
    if (!fs.existsSync(path.join(MD_DIR, ONLY_FILE))) {
      console.error(`File not found: ${path.join(toWebPath(MD_DIR), ONLY_FILE)}`);
      process.exitCode = 1;
      return;
    }
    const updatedEntry = mergeEntry(ONLY_FILE);
    bySource.set(ONLY_FILE, updatedEntry);
    pages = Array.from(bySource.values());
  } else {
    const mdFiles = fs.readdirSync(MD_DIR).filter((f) => f.toLowerCase().endsWith('.md'));
    const dropped = existing.filter((p) => !mdFiles.includes(p.source));
    dropped.forEach((p) => console.log(`Removing manifest entry for missing file: ${p.source}`));
    pages = mdFiles.map(mergeEntry);
  }

  const sorted = writeManifest(pages);
  updateHomeLinks(sorted);
}

run();
