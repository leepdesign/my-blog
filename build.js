import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

marked.use({ breaks: true });

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
// Prefix for every site-absolute link, e.g. "/my-blog" when served from a GitHub Pages project URL
const BASE = (process.env.BASE_PATH || '').replace(/\/$/, '');

export async function build() {
  // Re-import config each build so dev mode picks up edits
  const { default: site } = await import(`./site.config.js?t=${Date.now()}`);

  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.cpSync(path.join(ROOT, 'static'), OUT, { recursive: true });

  const posts = loadPosts();
  const tags = countTags(posts, site.tagOrder);

  const homeMd = readIfExists(path.join(ROOT, 'content/home.md'));
  writePage('index.html', layout(site, {
    title: site.title,
    description: site.description,
    bodyClass: 'home',
    main: `<div class="intro">${marked.parse(homeMd)}</div>${writingSection(site, posts, tags)}`,
  }));

  for (const [tag] of tags) {
    writePage(`tags/${tag}/index.html`, layout(site, {
      title: `${tag} · ${site.title}`,
      bodyClass: 'home',
      main: writingSection(site, posts.filter((p) => p.tags.includes(tag)), tags, tag),
    }));
  }

  posts.forEach((post, i) => {
    const newer = posts[i - 1];
    const older = posts[i + 1];
    const nav = (newer || older) ? `<nav class="post-navigation">
      ${older ? `<a class="prev" href="/posts/${older.slug}/">← ${esc(older.title)}</a>` : ''}
      ${newer ? `<a class="next" href="/posts/${newer.slug}/">${esc(newer.title)} →</a>` : ''}
    </nav>` : '';
    writePage(`posts/${post.slug}/index.html`, layout(site, {
      title: `${post.title} · ${site.title}`,
      description: post.description || site.description,
      bodyClass: 'article',
      main: `<h1>${esc(post.title)}</h1>
        <p class="date"><time datetime="${post.date}">${formatLong(post.date)}</time>${post.tags.map((t) => `<span aria-hidden="true"> · </span><a class="tag" href="${tagHref(t)}">${esc(t)}</a>`).join('')}</p>
        ${renderBody(post.body)}
        ${post.source ? `<p class="source"><a href="${post.source}">在 Threads 上查看原串文 ↗</a></p>` : ''}${nav}`,
    }));
  });

  writePage('404.html', layout(site, {
    title: `找不到页面 · ${site.title}`, bodyClass: 'article',
    main: '<h1>找不到这个页面</h1><p><a href="/">← 回到首页</a></p>',
  }));

  return posts.length;
}

function loadPosts() {
  const dir = path.join(ROOT, 'posts');
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { data, body } = frontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!data.title || !data.date) throw new Error(`${f}: 缺少 title 或 date`);
      const tags = (data.tags || '').split(/[,，]/).map((t) => t.trim()).filter(Boolean);
      return { slug: f.replace(/\.md$/, ''), ...data, date: String(data.date), tags, body };
    })
    .filter((p) => p.draft !== 'true')
    .sort((a, b) => b.date.localeCompare(a.date));
}

function frontmatter(src) {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: src };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) data[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return { data, body: src.slice(m[0].length) };
}

// A post made of several Threads posts separates them with `<!-- part -->`;
// each part gets its own number and a divider between them
function renderBody(body) {
  const parts = body.split(/\n\s*<!-- part -->\s*\n/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return marked.parse(body);
  return parts.map((p, i) => `<section class="part">
      <p class="part-no">${i + 1} / ${parts.length}</p>
      ${marked.parse(p)}
    </section>`).join('<hr class="part-rule">');
}

// [tag, count] pairs: tags listed in `order` first, the rest by most used
function countTags(posts, order = []) {
  const counts = new Map();
  for (const p of posts) for (const t of p.tags) counts.set(t, (counts.get(t) || 0) + 1);
  const rank = (t) => (order.includes(t) ? order.indexOf(t) : order.length);
  return [...counts].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
}

function tagHref(tag) {
  return `/tags/${encodeURIComponent(tag)}/`;
}

function writingSection(site, posts, tags = [], current = null) {
  const years = Map.groupBy(posts, (p) => p.date.slice(0, 4));
  const extra = site.extraLink
    ? `<span aria-hidden="true">&middot;</span><a href="${site.extraLink.href}">${esc(site.extraLink.label)}</a>`
    : '';
  const tagNav = tags.length ? `<nav class="tag-nav" aria-label="按标签筛选">
      <a href="/"${current ? '' : ' aria-current="page"'}>全部</a>
      ${tags.map(([t, n]) => `<a href="${tagHref(t)}"${t === current ? ' aria-current="page"' : ''}>${esc(t)}<sup>${n}</sup></a>`).join('')}
    </nav>` : '';
  const groups = [...years].map(([year, list]) => `
    <section class="archive-year" aria-labelledby="year-${year}">
      <h3 id="year-${year}">${year}</h3>
      <ul>${list.map((p) => `<li><a href="/posts/${p.slug}/">${esc(p.title)}</a><time datetime="${p.date}">${formatShort(p.date)}</time></li>`).join('')}</ul>
    </section>`).join('');
  return `<section class="home-writing" aria-labelledby="writing-title">
    <div class="writing-heading"><h2 id="writing-title">写作</h2>${extra}</div>
    ${tagNav}
    ${groups || '<p class="date">还没有文章。</p>'}
  </section>`;
}

function layout(site, { title, description = site.description, bodyClass, main }) {
  const social = site.social.map((s) =>
    `<a class="chip" href="${s.href}" aria-label="${esc(s.title)}">${esc(s.label)}</a>`).join('');
  const nameTag = bodyClass === 'home'
    ? `<h1><a class="name" href="/">${esc(site.title)}</a></h1>`
    : `<a class="name" href="/">${esc(site.title)}</a>`;
  return `<!doctype html>
<html lang="${site.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="color-scheme" content="light dark">
<link rel="stylesheet" href="/style.css">
<script>${themeScript}</script>
</head>
<body class="${bodyClass}">
<header class="site-header">${nameTag}
  <nav aria-label="主导航">
    ${social}
    <button class="theme-toggle" type="button" data-theme-toggle aria-label="切换深色模式"><span aria-hidden="true">☾</span></button>
  </nav>
</header>
<main>${main}</main>
<footer class="site-footer">© ${new Date().getFullYear()} ${esc(site.title)}</footer>
</body>
</html>`;
}

// Runs in <head> to avoid a flash of the wrong theme; remembers the reader's choice
const themeScript = `(() => {
  const root = document.documentElement;
  let choice, system;
  try { const s = localStorage.getItem('theme'); if (s === 'light' || s === 'dark') choice = s; } catch {}
  try { system = matchMedia('(prefers-color-scheme: light)'); } catch {}
  function update() {
    const dark = choice ? choice === 'dark' : !system?.matches;
    root.dataset.theme = dark ? 'dark' : 'light';
    const b = document.querySelector('[data-theme-toggle]');
    if (b) { b.title = dark ? '切换到浅色' : '切换到深色'; b.firstElementChild.textContent = dark ? '☀︎' : '☾'; }
  }
  update();
  document.addEventListener('DOMContentLoaded', () => {
    update();
    document.querySelector('[data-theme-toggle]').onclick = () => {
      choice = root.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('theme', choice); } catch {}
      update();
    };
  });
  system?.addEventListener?.('change', update);
})();`;


// Dates may carry a time ("2026-10-19T14:51:52+08:00"); only the calendar day is shown
function formatShort(date) {
  const [, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${m} 月 ${d} 日`;
}

function formatLong(date) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

function writePage(rel, html) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, BASE ? html.replace(/(href|src)="\/(?!\/)/g, `$1="${BASE}/`) : html);
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function esc(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const n = await build();
  console.log(`已生成 ${n} 篇文章 → dist/`);
}
