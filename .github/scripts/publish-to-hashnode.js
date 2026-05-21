/**
 * Publish changed Markdown articles to Hashnode via GraphQL API.
 * Runs inside a GitHub Action — expects these env vars:
 *   HASHNODE_API_KEY        — Personal Access Token
 *   HASHNODE_PUBLICATION_ID — Publication ID (from Hashnode dashboard)
 */

const fs = require('fs');
const { execSync } = require('child_process');

const API_KEY = process.env.HASHNODE_API_KEY;
const PUBLICATION_ID = process.env.HASHNODE_PUBLICATION_ID;
const GQL = 'https://gql.hashnode.com';

if (!API_KEY || !PUBLICATION_ID) {
  console.error('Missing HASHNODE_API_KEY or HASHNODE_PUBLICATION_ID');
  process.exit(1);
}

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return null;
  const fm = {};
  match[1].split('\n').forEach(line => {
    const [key, ...rest] = line.split(':');
    if (key && rest.length) fm[key.trim()] = rest.join(':').trim().replace(/^"|"$/g, '');
  });
  fm._body = match[2].trim();
  return fm;
}

async function gql(query, variables) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2));
  return json.data;
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
