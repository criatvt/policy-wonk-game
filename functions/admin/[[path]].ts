// Pages Functions catch-all for /admin/*.
//
// Every request is gated by an admin middleware that reads the session
// cookie, looks up the user, and confirms is_admin. Non-admins (including
// logged-out callers) get a generic Not Found page — per #26, we don't
// leak the existence of the admin tree.
//
// Pages are rendered server-side as HTML strings. No client-side JS, no
// JSON API for the admin tree: the entire request is one round-trip.
//
// Phase 1: read-only. No edit/delete, no exports, no audit log. Those
// are explicitly out of scope per the issue.

import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import { html, raw, type SafeHtml } from "./_lib/escape";
import { renderShell, renderNotFound } from "./_lib/layout";
import { loadAdminUser } from "./_lib/guard";
import { formatIST, formatRelative, parseLifelines } from "./_lib/format";
import {
  ADMIN_MODULE_IDS,
  getDashboardStats,
  getUserDetail,
  listRecentSessions,
  listUsers,
  type AdminOutcome,
  type AdminSessionRow,
  type AdminUserRow,
} from "./_lib/queries";

type Bindings = {
  DB: D1Database;
  ENV: string;
  SESSION_SECRET?: string;
};

// Note: routes are registered with full /admin/... paths (no .basePath()).
// The basePath() helper was setting Hono's internal route prefix in a way
// that did not match Cloudflare Pages' canonical path for the bare
// `/admin` URL (works locally with `wrangler pages dev`, fell through to
// notFound on the deployed Pages Functions runtime). Full paths sidestep
// that mismatch entirely.
const app = new Hono<{ Bindings: Bindings }>();

// TEMPORARY diagnostic — gated to non-prod envs only. Visit /admin/__diag
// from a logged-in browser to see exactly what the guard sees. Remove
// before the phase-1 → main merge.
app.get("/admin/__diag", async (c) => {
  if (c.env.ENV === "production") {
    return c.html(renderNotFound(), 404);
  }
  const { readSession } = await import("../api/_lib/session");
  const { findUserById } = await import("../api/_lib/users");

  const hasSecret = !!c.env.SESSION_SECRET;
  const cookieHeader = c.req.header("Cookie") ?? "";
  const hasCookie = cookieHeader.includes("pwg_session=");
  const cookieTail = hasCookie ? cookieHeader.split("pwg_session=")[1].split(";")[0].slice(-8) : null;

  let claimsSub: string | null = null;
  let claimsEmail: string | null = null;
  if (hasSecret) {
    const claims = await readSession(c, c.env.SESSION_SECRET!);
    claimsSub = claims?.sub ?? null;
    claimsEmail = claims?.email ?? null;
  }

  let userJson: unknown = null;
  let isAdminType: string | null = null;
  let isAdminValue: unknown = null;
  let isAdminCoerced: number | null = null;
  let isAdminMatchesOne: boolean | null = null;
  if (claimsSub) {
    const u = await findUserById(c.env.DB, claimsSub);
    if (u) {
      userJson = { id: u.id, email: u.email, nickname: u.nickname, is_admin: String(u.is_admin) };
      isAdminType = typeof u.is_admin;
      isAdminValue = String(u.is_admin);
      isAdminCoerced = Number(u.is_admin);
      isAdminMatchesOne = Number(u.is_admin) === 1;
    }
  }

  // Cross-check: also call the actual guard function so we can see if its
  // return value matches the manual reconstruction above. If they diverge,
  // the guard itself has a bug.
  const realGuardReturned = await loadAdminUser(c);
  const realGuardResult: unknown = realGuardReturned
    ? { id: realGuardReturned.id, email: realGuardReturned.email, is_admin: String(realGuardReturned.is_admin) }
    : null;

  return c.json({
    env: c.env.ENV,
    has_session_secret: hasSecret,
    has_cookie: hasCookie,
    cookie_tail: cookieTail,
    claims_sub: claimsSub,
    claims_email: claimsEmail,
    user: userJson,
    is_admin_type: isAdminType,
    is_admin_value: isAdminValue,
    is_admin_coerced: isAdminCoerced,
    is_admin_matches_one: isAdminMatchesOne,
    guard_would_pass: isAdminMatchesOne === true,
    real_guard_returned: realGuardResult,
    real_guard_was_null: realGuardReturned === null,
  });
});

// Guard: every admin route must clear this. On failure, return a real
// 404 page (not a 403) so the route family is indistinguishable from
// nonexistent paths.
app.use("*", async (c, next) => {
  // Diagnostic bypass — only in non-production envs. The /__diag handler
  // returns the raw state the guard sees, so we can debug why a real
  // admin user is being rejected. Production stays locked down.
  if (c.req.path === "/admin/__diag" && c.env.ENV !== "production") {
    await next();
    return;
  }
  // Routing-only test bypass — ?__routetest=1 skips the guard so we can
  // see whether the route handler itself matches the request. Non-prod
  // only.
  if (c.req.query("__routetest") === "1" && c.env.ENV !== "production") {
    await next();
    return;
  }
  const user = await loadAdminUser(c);
  if (!user) {
    return c.html(renderNotFound(), 404);
  }
  await next();
});

// ---------- /admin (dashboard) ----------

const dashboardHandler = async (c: import("hono").Context<{ Bindings: Bindings }>) => {
  const stats = await getDashboardStats(c.env.DB);

  const statCards = html`
    <div class="stat-grid">
      <div class="stat">
        <div class="label">Total users</div>
        <div class="value">${stats.total_users}</div>
      </div>
      <div class="stat">
        <div class="label">Signups, last 7 days</div>
        <div class="value">${stats.signups_last_7d}</div>
      </div>
      <div class="stat">
        <div class="label">Sessions today</div>
        <div class="value">${stats.sessions_today}</div>
        <div class="sub">since 00:00 UTC</div>
      </div>
      <div class="stat">
        <div class="label">Most-played module</div>
        <div class="value">${
          stats.most_played_module ? stats.most_played_module.module_id : "—"
        }</div>
        <div class="sub">${
          stats.most_played_module
            ? `${stats.most_played_module.count} sessions`
            : "no sessions yet"
        }</div>
      </div>
    </div>`;

  const body = html`
    <h1>Dashboard</h1>
    ${statCards}
    <p class="muted">
      <a href="/admin/users">Browse all users →</a>
      &nbsp;·&nbsp;
      <a href="/admin/sessions">Browse all sessions →</a>
    </p>`;

  return c.html(renderShell({ title: "Dashboard", body }));
};
app.get("/admin", dashboardHandler);
app.get("/admin/", dashboardHandler);

// ---------- /admin/users ----------

app.get("/admin/users", async (c) => {
  const search = (c.req.query("search") ?? "").trim();
  const page = parseIntSafe(c.req.query("page"), 1);
  const pageSize = 50;

  const result = await listUsers(c.env.DB, { search, page, pageSize });
  const lastPage = Math.max(1, Math.ceil(result.total / pageSize));

  const rows: SafeHtml[] = result.users.map((u) => userRow(u));

  const tableOrEmpty: SafeHtml =
    result.users.length === 0
      ? html`<div class="empty">${
          search ? html`No users match <code>${search}</code>.` : raw("No users yet.")
        }</div>`
      : html`<table>
          <thead>
            <tr>
              <th></th>
              <th>Email</th>
              <th>Nickname</th>
              <th>Signed up</th>
              <th>Last login</th>
              <th>Sessions</th>
              <th>Admin</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;

  const body = html`
    <h1>Users</h1>
    <form class="search" method="get" action="/admin/users">
      <input
        type="search"
        name="search"
        value="${search}"
        placeholder="Search by email…"
        autocomplete="off"
      />
      <button type="submit">Search</button>
      ${
        search
          ? html`<a class="btn secondary" href="/admin/users">Clear</a>`
          : raw("")
      }
    </form>
    <p class="muted">${result.total} total${search ? html` matching “${search}”` : raw("")}</p>
    ${tableOrEmpty}
    ${pager("/admin/users", result.page, lastPage, search ? { search } : {})}`;

  return c.html(
    renderShell({
      title: "Users",
      crumbs: [{ label: "Admin", href: "/admin" }, { label: "Users" }],
      body,
    }),
  );
});

function userRow(u: AdminUserRow): SafeHtml {
  const letter = (u.avatar_slug ?? "?").toUpperCase().slice(0, 1);
  return html`
    <tr>
      <td><span class="avatar-letter">${letter}</span></td>
      <td><a href="${`/admin/users/${u.id}`}">${u.email}</a></td>
      <td>${u.nickname ?? html`<span class="muted">—</span>`}</td>
      <td>${formatIST(u.created_at)}</td>
      <td>${
        u.last_login_at
          ? html`${formatIST(u.last_login_at)}<br /><span class="muted">${formatRelative(u.last_login_at)}</span>`
          : html`<span class="muted">never</span>`
      }</td>
      <td>${u.session_count}</td>
      <td>${u.is_admin === 1 ? html`<span class="pill pill-won">admin</span>` : raw("")}</td>
    </tr>`;
}

// ---------- /admin/users/:id ----------

app.get("/admin/users/:id", async (c) => {
  const id = c.req.param("id");
  const detail = await getUserDetail(c.env.DB, id);
  if (!detail) {
    return c.html(renderNotFound(), 404);
  }

  const { user, played_modules, sessions } = detail;
  const letter = (user.avatar_slug ?? "?").toUpperCase().slice(0, 1);

  const profile = html`
    <div class="stat-grid">
      <div class="stat">
        <div class="label">Email</div>
        <div class="value" style="font-size: 16px;"><code>${user.email}</code></div>
      </div>
      <div class="stat">
        <div class="label">Nickname</div>
        <div class="value" style="font-size: 16px;">
          <span class="avatar-letter">${letter}</span> ${user.nickname ?? html`<span class="muted">—</span>`}
        </div>
      </div>
      <div class="stat">
        <div class="label">Signed up</div>
        <div class="value" style="font-size: 14px;">${formatIST(user.created_at)}</div>
        <div class="sub">${formatRelative(user.created_at)}</div>
      </div>
      <div class="stat">
        <div class="label">Last login</div>
        <div class="value" style="font-size: 14px;">${
          user.last_login_at ? formatIST(user.last_login_at) : "—"
        }</div>
        <div class="sub">${user.last_login_at ? formatRelative(user.last_login_at) : ""}</div>
      </div>
    </div>`;

  const playedList: SafeHtml =
    played_modules.length === 0
      ? html`<p class="muted">No completed sessions yet.</p>`
      : html`<p>${played_modules.map(
          (m, i) =>
            html`${i > 0 ? raw(", ") : raw("")}<code>${m}</code>`,
        )}</p>`;

  const sessionsBlock: SafeHtml =
    sessions.length === 0
      ? html`<div class="empty">No sessions yet.</div>`
      : html`<table>
          <thead>
            <tr>
              <th>Ended</th>
              <th>Module</th>
              <th>Outcome</th>
              <th>Score</th>
              <th>Rung</th>
              <th>Lifelines</th>
              <th>Session id</th>
            </tr>
          </thead>
          <tbody>${sessions.map((s) => sessionRow(s, { showUser: false }))}</tbody>
        </table>`;

  const adminPill = user.is_admin === 1 ? html`<span class="pill pill-won">admin</span>` : raw("");

  const body = html`
    <h1>${user.email} ${adminPill}</h1>
    ${profile}

    <h2>Played modules</h2>
    ${playedList}

    <h2>Session history (${sessions.length})</h2>
    ${sessionsBlock}`;

  return c.html(
    renderShell({
      title: user.email,
      crumbs: [
        { label: "Admin", href: "/admin" },
        { label: "Users", href: "/admin/users" },
        { label: user.email },
      ],
      body,
    }),
  );
});

// ---------- /admin/sessions ----------

app.get("/admin/sessions", async (c) => {
  const moduleId = pickModule(c.req.query("module"));
  const outcome = pickOutcome(c.req.query("outcome"));
  const since = pickDate(c.req.query("since"));
  const until = pickDate(c.req.query("until"));
  const page = parseIntSafe(c.req.query("page"), 1);
  const pageSize = 50;

  const result = await listRecentSessions(c.env.DB, {
    moduleId,
    outcome,
    since,
    until,
    page,
    pageSize,
  });
  const lastPage = Math.max(1, Math.ceil(result.total / pageSize));

  const moduleOptions = ADMIN_MODULE_IDS.map(
    (id) =>
      html`<option value="${id}" ${moduleId === id ? raw("selected") : raw("")}>${id}</option>`,
  );

  const outcomeOptions = (["won", "lost", "walked_away"] as AdminOutcome[]).map(
    (o) =>
      html`<option value="${o}" ${outcome === o ? raw("selected") : raw("")}>${o}</option>`,
  );

  const filters = html`
    <form class="filter" method="get" action="/admin/sessions">
      <label>
        Module
        <select name="module">
          <option value="">All</option>
          ${moduleOptions}
        </select>
      </label>
      <label>
        Outcome
        <select name="outcome">
          <option value="">All</option>
          ${outcomeOptions}
        </select>
      </label>
      <label>
        From
        <input type="date" name="since" value="${since ?? ""}" />
      </label>
      <label>
        To
        <input type="date" name="until" value="${until ?? ""}" />
      </label>
      <button type="submit">Apply</button>
      ${
        moduleId || outcome || since || until
          ? html`<a class="btn secondary" href="/admin/sessions">Reset</a>`
          : raw("")
      }
    </form>`;

  const tableOrEmpty: SafeHtml =
    result.sessions.length === 0
      ? html`<div class="empty">No sessions match those filters.</div>`
      : html`<table>
          <thead>
            <tr>
              <th>Ended</th>
              <th>User</th>
              <th>Module</th>
              <th>Outcome</th>
              <th>Score</th>
              <th>Rung</th>
              <th>Lifelines</th>
            </tr>
          </thead>
          <tbody>${result.sessions.map((s) => sessionRow(s, { showUser: true }))}</tbody>
        </table>`;

  const filterQs: Record<string, string> = {};
  if (moduleId) filterQs.module = moduleId;
  if (outcome) filterQs.outcome = outcome;
  if (since) filterQs.since = since;
  if (until) filterQs.until = until;

  const body = html`
    <h1>Sessions</h1>
    ${filters}
    <p class="muted">${result.total} total</p>
    ${tableOrEmpty}
    ${pager("/admin/sessions", result.page, lastPage, filterQs)}`;

  return c.html(
    renderShell({
      title: "Sessions",
      crumbs: [{ label: "Admin", href: "/admin" }, { label: "Sessions" }],
      body,
    }),
  );
});

// Anything else under /admin/* — render the same generic 404 the guard
// produces. Keeps the surface uniform.
app.notFound((c) => c.html(renderNotFound(), 404));

app.onError((err, c) => {
  console.error("admin error:", err);
  return c.html(renderNotFound(), 500);
});

// ---------- shared row + paging helpers ----------

function sessionRow(s: AdminSessionRow, opts: { showUser: boolean }): SafeHtml {
  const pillClass: Record<AdminOutcome, string> = {
    won: "pill pill-won",
    lost: "pill pill-lost",
    walked_away: "pill pill-walked",
  };
  const lifelines = parseLifelines(s.lifelines_used);
  const userCell: SafeHtml = opts.showUser
    ? html`<td>
        <a href="${`/admin/users/${s.user_id}`}">${s.user_email}</a>
        ${
          s.user_nickname
            ? html`<br /><span class="muted">${s.user_nickname}</span>`
            : raw("")
        }
      </td>`
    : raw("");

  return html`
    <tr>
      <td>${formatIST(s.ended_at)}<br /><span class="muted">${formatRelative(s.ended_at)}</span></td>
      ${userCell}
      <td><code>${s.module_id}</code></td>
      <td><span class="${pillClass[s.outcome]}">${
        s.outcome === "walked_away" ? "walked away" : s.outcome
      }</span>${
        s.outcome === "walked_away" && s.walk_away_tier
          ? html`<br /><span class="muted">@ ${s.walk_away_tier}</span>`
          : raw("")
      }</td>
      <td>${s.score}</td>
      <td>${s.highest_cleared_rung}</td>
      <td>${
        lifelines.length === 0
          ? html`<span class="muted">none</span>`
          : html`${lifelines.map(
              (l, i) =>
                html`${i > 0 ? raw(", ") : raw("")}<code>${l}</code>`,
            )}`
      }</td>
    </tr>`;
}

function pager(
  basePath: string,
  page: number,
  lastPage: number,
  extra: Record<string, string>,
): SafeHtml {
  if (lastPage <= 1) return raw("");
  const prev = page > 1 ? page - 1 : null;
  const next = page < lastPage ? page + 1 : null;
  const linkFor = (p: number) => {
    const qs = new URLSearchParams({ ...extra, page: String(p) }).toString();
    return `${basePath}?${qs}`;
  };
  return html`
    <div class="pager">
      ${prev ? html`<a href="${linkFor(prev)}">← Prev</a>` : html`<span class="muted">← Prev</span>`}
      <span>Page ${page} of ${lastPage}</span>
      ${next ? html`<a href="${linkFor(next)}">Next →</a>` : html`<span class="muted">Next →</span>`}
    </div>`;
}

// ---------- query-string parsers ----------

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function pickModule(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return (ADMIN_MODULE_IDS as readonly string[]).includes(value) ? value : undefined;
}

function pickOutcome(value: string | undefined): AdminOutcome | undefined {
  if (value === "won" || value === "lost" || value === "walked_away") return value;
  return undefined;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function pickDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return ISO_DATE_RE.test(value) ? value : undefined;
}

export const onRequest = handle(app);
