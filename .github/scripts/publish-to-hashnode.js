/**
 * Publish changed Markdown articles to Hashnode via GraphQL API.
 * Runs inside a GitHub Action — expects these env vars:
 *   HASHNODE_API_KEY        — Personal Access Token
 *   HASHNODE_PUBLICATION_ID — Publication ID (from Hashnode dashboard)
 */

const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

const API_KEY = process.env.HASHNODE_API_KEY;
const PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID;

// Hashnode GraphQL endpoint — using https module directly to avoid
// Node's built-in fetch silently converting POST redirects to GET.
const GQL_HOST = 'gql.hashnode.com';
const GQL_PATH = '/';

if (!API_KEY || !PUBLICATION_ID) {
  console.error('Missing HASHNODE_API_KEY or HASHNODE_PUBLICATION_ID');
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  // Strip frontmatter (--- ... ---) and return fields + clean body
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    // No frontmatter — fall back to H1 title + full content
    const titleMatch = content.match(/^#\s+(.+)/m);
    return titleMatch ? { title: titleMatch[1].trim(), slug: '', _body: content } : null;
  }
  const fm = {};
  match[1].split('\n').forEach(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    const val = line.slice(colonIdx + 1).trim().replace(/^"|"$/g, '');
    if (key) fm[key] = val;
  });
  // Body is everything after the closing --- (no frontmatter visible to readers)
  fm._body = match[2].trim();
  return fm;
}

// Raw HTTPS POST — never follows redirects, so we always see the real response.
function gql(query, variables) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const options = {
      hostname: GQL_HOST,
      port: 443,
      path: GQL_PATH,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'Authorization': API_KEY,   // Hashnode PATs used directly, no Bearer prefix
      },
    };

    const req = https.request(options, (res) => {
      const ct = res.headers['content-type'] || '';
      console.log(`  API status: ${res.statusCode} | Content-Type: ${ct}`);

      // Surface redirects immediately so we can fix the URL — never follow silently.
      if (res.statusCode >= 300 && res.statusCode < 400) {
        const loc = res.headers['location'] || '(no Location header)';
        return reject(new Error(`Redirected (${res.statusCode}) → ${loc}. Update GQL_PATH in script.`));
      }

      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(data);
        } catch {
          console.error(`  Raw response (first 300 chars): ${data.slice(0, 300)}`);
          return reject(new Error(`Hashnode API returned non-JSON (status ${res.statusCode})`));
        }
        if (json.errors) return reject(new Error(JSON.stringify(json.errors, null, 2)));
        resolve(json.data);
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getPostBySlug(slug) {
  const data = await gql(`
    query GetPost($host: String!, $slug: String!) {
      publication(host: $host) {
        post(slug: $slug) { id title slug }
      }
    }
  `, { host: 'vaibhavfrenz.hashnode.dev', slug });
  return data?.publication?.post ?? null;
}

async function publishPost(fm) {
  const tags = (fm.tags || '').split(',').map(t => ({ slug: t.trim() })).filter(t => t.slug);
  const input = {
    title: fm.title,
    subtitle: fm.subtitle || undefined,
    publicationId: PUBLICATION_ID,
    contentMarkdown: fm._body,
    slug: fm.slug,
    tags,
    isTableOfContentEnabled: fm.enableToc === 'true',
  };
  if (fm.cover && !fm.cover.includes('PLACEHOLDER')) {
    input.coverImageOptions = { coverImageURL: fm.cover };
  }
  if (fm.seoTitle || fm.seoDescription) {
    input.metaTags = { title: fm.seoTitle, description: fm.seoDescription };
  }
  const data = await gql(`
    mutation Publish($input: PublishPostInput!) {
      publishPost(input: $input) {
        post { id slug url }
      }
    }
  `, { input });
  return data.publishPost.post;
}

async function updatePost(postId, fm) {
  const tags = (fm.tags || '').split(',').map(t => ({ slug: t.trim() })).filter(t => t.slug);
  const input = {
    id: postId,
    title: fm.title,
    subtitle: fm.subtitle || undefined,
    contentMarkdown: fm._body,
    slug: fm.slug,
    tags,
    isTableOfContentEnabled: fm.enableToc === 'true',
  };
  if (fm.cover && !fm.cover.includes('PLACEHOLDER')) {
    input.coverImageOptions = { coverImageURL: fm.cover };
  }
  if (fm.seoTitle || fm.seoDescription) {
    input.metaTags = { title: fm.seoTitle, description: fm.seoDescription };
  }
  const data = await gql(`
    mutation Update($input: UpdatePostInput!) {
      updatePost(input: $input) {
        post { id slug url }
      }
    }
  `, { input });
  return data.updatePost.post;
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Get changed .md files in blogs/ (skip bot commits)
  let changedFiles;
  try {
    changedFiles = execSync('git diff --name-only HEAD~1 HEAD -- "blogs/*.md"')
      .toString().trim().split('\n').filter(f => f.endsWith('.md') && f.startsWith('blogs/'));
  } catch {
    // First commit fallback
    changedFiles = execSync('git diff --name-only HEAD -- "blogs/*.md"')
      .toString().trim().split('\n').filter(f => f.endsWith('.md') && f.startsWith('blogs/'));
  }

  if (!changedFiles.length || (changedFiles.length === 1 && !changedFiles[0])) {
    console.log('No changed blog .md files found. Skipping.');
    return;
  }

  console.log(`Processing ${changedFiles.length} file(s):`, changedFiles);

  for (const file of changedFiles) {
    if (!fs.existsSync(file)) { console.log(`  Skipping deleted file: ${file}`); continue; }

    const content = fs.readFileSync(file, 'utf8');
    const fm = parseFrontmatter(content);

    if (!fm) { console.warn(`  No frontmatter in ${file} — skipping`); continue; }
    if (fm.ignorePost === 'true') { console.log(`  ignorePost=true, skipping ${file}`); continue; }
    if (fm.saveAsDraft === 'true') { console.log(`  saveAsDraft=true, skipping ${file}`); continue; }
    if (!fm.slug) { console.warn(`  No slug in ${file} — skipping`); continue; }

    try {
      const existing = await getPostBySlug(fm.slug);
      if (existing) {
        console.log(`  Updating "${fm.title}" (slug: ${fm.slug})`);
        const post = await updatePost(existing.id, fm);
        console.log(`  ✅ Updated: ${post.url}`);
      } else {
        console.log(`  Publishing "${fm.title}" (slug: ${fm.slug})`);
        const post = await publishPost(fm);
        console.log(`  ✅ Published: ${post.url}`);
      }
    } catch (err) {
      console.error(`  ❌ Failed for ${file}:`, err.message);
      process.exitCode = 1;
    }
  }
}

main();
