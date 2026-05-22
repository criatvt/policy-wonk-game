// Shared HTML shell for every /admin/* page.
//
// Deliberately plain: this is an internal admin tool, not part of the
// public game UI. No Tailwind, no React, no Astro — just system fonts and
// a few inline styles for data-dense readability. Keeps the bundle out of
// the public site and avoids re-rendering admin views inside BaseLayout.

import { html, raw, type SafeHtml } from "./escape";

type Crumb = { label: string; href?: string };

export type LayoutOpts = {
  title: string;
  crumbs?: Crumb[];
  body: SafeHtml;
};

const STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1a1a1a;
    background: #f5f5f4;
    line-height: 1.5;
    font-size: 14px;
  }
  header.admin-bar {
    background: #1a1b4b;
    color: #f8f1e4;
    padding: 10px 20px;
    display: flex;
    gap: 24px;
    align-items: baseline;
    border-bottom: 3px solid #c77b47;
  }
  header.admin-bar a { color: #f8f1e4; text-decoration: none; }
  header.admin-bar a:hover { text-decoration: underline; }
  header.admin-bar .brand { font-weight: 700; letter-spacing: 0.02em; }
  header.admin-bar .brand::after {
    content: "admin";
    margin-left: 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    background: #c77b47;
    color: #1a1a1a;
    padding: 2px 6px;
    border-radius: 2px;
  }
  header.admin-bar nav { display: flex; gap: 16px; font-size: 13px; }
  main { padding: 24px 20px 60px; max-width: 1100px; margin: 0 auto; }
  .crumbs { color: #6b6b6b; font-size: 12px; margin-bottom: 8px; }
  .crumbs a { color: #6b6b6b; }
  .crumbs span { margin: 0 6px; }
  h1 { font-size: 22px; margin: 0 0 16px; font-weight: 600; }
  h2 { font-size: 16px; margin: 24px 0 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e3e3e0; font-size: 13px; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #ececec; vertical-align: top; }
  th { background: #fafaf9; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafaf9; }
  .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 28px; }
  .stat { background: #fff; padding: 14px 16px; border: 1px solid #e3e3e0; border-radius: 4px; }
  .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #666; }
  .stat .value { font-size: 24px; font-weight: 600; margin-top: 4px; }
  .stat .sub { font-size: 12px; color: #888; margin-top: 2px; }
  form.search { margin-bottom: 16px; display: flex; gap: 8px; }
  form.filter { margin-bottom: 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
  form.filter label { display: flex; flex-direction: column; font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.05em; gap: 4px; }
  input[type="text"], input[type="date"], input[type="search"], select {
    padding: 6px 8px; border: 1px solid #c4c4c0; border-radius: 3px; background: #fff; font: inherit;
  }
  button, .btn {
    padding: 6px 14px; border: 1px solid #1a1b4b; background: #1a1b4b; color: #f8f1e4;
    border-radius: 3px; cursor: pointer; font: inherit; text-decoration: none; display: inline-block;
  }
  button.secondary, .btn.secondary { background: #fff; color: #1a1b4b; }
  .pager { margin-top: 12px; display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .pager a { color: #1a1b4b; }
  .empty { padding: 40px 20px; text-align: center; color: #888; background: #fff; border: 1px dashed #d4d4d0; border-radius: 4px; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 10px; font-size: 11px; font-weight: 500; }
  .pill-won { background: #e6f3d8; color: #3f6e1f; }
  .pill-lost { background: #f9dcd4; color: #8a2e16; }
  .pill-walked { background: #fdecd1; color: #8a5a1c; }
  .muted { color: #888; }
  .avatar-letter {
    display: inline-flex; width: 22px; height: 22px; align-items: center; justify-content: center;
    background: #1a1b4b; color: #f8f1e4; border-radius: 3px; font-family: ui-monospace, monospace;
    font-size: 12px; font-weight: 700; vertical-align: middle;
  }
`;

const NAV_LINKS: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/sessions", label: "Sessions" },
];

function renderCrumbs(crumbs: Crumb[]): SafeHtml {
  const items = crumbs.map((c, i) => {
    const sep = i === 0 ? raw("") : html`<span>›</span>`;
    const node = c.href
      ? html`<a href=${c.href}>${c.label}</a>`
      : html`<span>${c.label}</span>`;
    return html`${sep}${node}`;
  });
  return html`<div class="crumbs">${items}</div>`;
}

function renderNav(): SafeHtml {
  const links = NAV_LINKS.map(
    (l) => html`<a href=${l.href}>${l.label}</a>`,
  );
  return html`<nav>${links}</nav>`;
}

export function renderShell(opts: LayoutOpts): string {
  const crumbs =
    opts.crumbs && opts.crumbs.length > 0 ? renderCrumbs(opts.crumbs) : raw("");
  const doc = html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>${opts.title} · Policy Wonk admin</title>
  <style>${raw(STYLES)}</style>
</head>
<body>
  <header class="admin-bar">
    <a class="brand" href="/admin">Policy Wonk</a>
    ${renderNav()}
  </header>
  <main>
    ${crumbs}
    ${opts.body}
  </main>
</body>
</html>`;
  return doc.__html;
}

// Standalone 404 page used by the admin guard for non-admin requests.
// Visually identical to a generic Not Found — does not hint at the
// existence of an /admin tree.
export function renderNotFound(): string {
  const doc = html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Not found · Policy Wonk</title>
  <style>${raw(`
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1a1a1a; background: #f8f1e4; min-height: 100vh; display: grid; place-items: center; padding: 20px; }
    .box { max-width: 480px; text-align: center; }
    h1 { font-family: Georgia, serif; font-size: 36px; margin: 0 0 10px; }
    p { color: #555; line-height: 1.55; }
    a { color: #1a1b4b; }
  `)}</style>
</head>
<body>
  <div class="box">
    <h1>Not found</h1>
    <p>That page doesn't exist. <a href="/">Back to Policy Wonk →</a></p>
  </div>
</body>
</html>`;
  return doc.__html;
}
