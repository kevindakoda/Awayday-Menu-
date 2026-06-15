/* =====================================================================
   Authentication gate (Supabase Auth).
   The app shell stays hidden until a valid session exists. The logged-in
   user's profile row supplies the procurement role used for access control.
   ===================================================================== */
(function () {
  "use strict";
  const cfg = window.PSP_CONFIG;
  let client = null;
  // Captured before supabase-js consumes the URL hash: invited (or password
  // recovery) users arrive with #access_token=…&type=invite and must set a
  // password before entering the app.
  const inviteLanding = /[#&]type=(invite|recovery)/.test(location.hash);

  function sb() {
    if (!client) {
      if (!window.supabase || !cfg) return null;
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      });
    }
    return client;
  }

  const $ = (id) => document.getElementById(id);

  function loginMarkup(msg, signup) {
    const points = [
      "AI savings, price compliance & weekly market insights",
      "Vendors, contracts & invoiced spend in one command center",
      "Built for rental presidents to see expenses at a glance",
    ];
    return `
    <div class="login-wrap">
      <div class="retro-grid" aria-hidden="true"></div>
      <div class="login-glow" aria-hidden="true"></div>
      <div class="login-shell">
        <div class="login-hero">
          <div class="login-badge">⚓ Procurement Command Center <span>›</span></div>
          <h1 class="login-hl">Spend smarter.<br><span class="grad">Save more.</span></h1>
          <p class="login-hero-sub">Centralized visibility into vendors, contracts, and invoiced spend — with AI that surfaces the savings and keeps every comparison apples-to-apples.</p>
          <ul class="login-points">${points.map((p) => `<li><span class="lp-dot">✓</span>${p}</li>`).join("")}</ul>
        </div>
        <div class="login-card">
          <div class="login-brand"><span class="login-logo">📈</span>
            <div><div class="login-title">${signup ? "Request access" : "Welcome back"}</div>
            <div class="login-sub">${signup ? "Create your account — an admin reviews each request" : "Sign in to the Savings Portal"}</div></div>
          </div>
          <form id="loginForm" autocomplete="on">
            ${signup ? `<div class="field"><label>Full name</label>
              <input type="text" id="loginName" placeholder="Jane Doe" autocomplete="name"></div>` : ""}
            <div class="field"><label>Email</label>
              <input type="email" id="loginEmail" placeholder="you@company.com" required></div>
            <div class="field"><label>Password</label>
              <input type="password" id="loginPassword" placeholder="••••••••" required autocomplete="${signup ? "new-password" : "current-password"}"></div>
            <div id="loginMsg" class="login-msg">${msg || ""}</div>
            <button type="submit" class="btn btn-primary" id="loginBtn" style="width:100%;justify-content:center">${signup ? "Request access" : "Sign in"}</button>
          </form>
          <div class="login-foot" style="margin-bottom:6px">
            ${signup
              ? `Already have an account? <a href="#" id="authToggle">Sign in</a>`
              : `Need access? <a href="#" id="authToggle">Request an account</a>`}
          </div>
          <div class="login-foot">Secured with Supabase Auth · ${signup ? "access is approved by an administrator" : "role-based access"}</div>
        </div>
      </div>
    </div>`;
  }

  let signupMode = false;

  function showLogin(msg) {
    const root = $("loginScreen");
    const app = $("appRoot");
    if (app) app.style.display = "none";
    if (root) { root.style.display = "block"; root.innerHTML = loginMarkup(msg, signupMode); }
    const form = $("loginForm");
    if (form) form.addEventListener("submit", onSubmit);
    const toggle = $("authToggle");
    if (toggle) toggle.addEventListener("click", (e) => { e.preventDefault(); signupMode = !signupMode; showLogin(); });
    const email = $("loginEmail");
    if (email) email.focus();
  }

  function setMsg(text, kind) {
    const el = $("loginMsg");
    if (el) { el.textContent = text; el.className = "login-msg" + (kind ? " " + kind : ""); }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const client = sb();
    if (!client) { setMsg("Auth service unavailable. Check connection.", "err"); return; }
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const btn = $("loginBtn");
    btn.disabled = true; btn.textContent = signupMode ? "Creating account…" : "Signing in…";
    setMsg("");

    if (signupMode) {
      const fullName = ($("loginName") && $("loginName").value.trim()) || "";
      const { data, error } = await client.auth.signUp({
        email, password, options: { data: { full_name: fullName } },
      });
      if (error) {
        setMsg(error.message || "Could not create the account.", "err");
        btn.disabled = false; btn.textContent = "Create account";
        return;
      }
      // Projects with email confirmation enabled return no session yet.
      if (!data.session) {
        signupMode = false;
        showLogin("✅ Request submitted. Confirm your email, then sign in — an admin will approve your access.");
        return;
      }
      await onAuthed(data.session);
      return;
    }

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) {
      setMsg(error.message || "Invalid email or password.", "err");
      btn.disabled = false; btn.textContent = "Sign in";
      return;
    }
    await onAuthed(data.session);
  }

  async function onAuthed(session) {
    const client = sb();
    let role = "Shop Manager", name = session.user.email, status = "pending", shop = "", region = "";
    try {
      const { data: profile } = await client.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (profile) {
        role = profile.role || role; name = profile.full_name || name; status = profile.status || "pending";
        shop = profile.shop || ""; region = profile.region || "";
      } else {
        // First sign-in: create a PENDING profile (default role). The user
        // can't enter until an admin approves them on the Security page.
        const meta = session.user.user_metadata || {};
        await client.from("profiles").insert({
          id: session.user.id, email: session.user.email, full_name: meta.full_name || "",
        });
        name = meta.full_name || name; status = "pending";
      }
    } catch (_) { /* fall back to defaults */ }

    // Access gate: only approved users enter the app.
    if (status !== "approved") { showAccessScreen(session, name, status); return; }

    window.CURRENT_USER = { email: session.user.email, name, role, id: session.user.id, shop, region };
    if (window.AppState) { window.AppState.role = role; window.AppState.userShop = shop; window.AppState.userRegion = region; }

    const root = $("loginScreen");
    const app = $("appRoot");
    if (root) { root.style.display = "none"; root.innerHTML = ""; }
    if (app) app.style.display = "flex";
    if (window.App && window.App.start) window.App.start();
  }

  // Shown to users awaiting approval (or denied).
  function showAccessScreen(session, name, status) {
    const denied = status === "denied";
    const root = $("loginScreen");
    const app = $("appRoot");
    if (app) app.style.display = "none";
    if (root) {
      root.style.display = "block";
      root.innerHTML = `
      <div class="login-wrap">
        <div class="retro-grid" aria-hidden="true"></div>
        <div class="login-glow" aria-hidden="true"></div>
        <div class="login-shell" style="grid-template-columns:1fr;max-width:480px">
          <div class="login-card" style="text-align:center">
            <div class="login-logo" style="margin:0 auto 14px">${denied ? "🚫" : "⏳"}</div>
            <div class="login-title">${denied ? "Access not approved" : "Request received"}</div>
            <p class="login-sub" style="margin:10px 0 4px">${denied
              ? "An administrator has declined access for " + esc(session.user.email) + ". If you believe this is a mistake, contact your portal admin."
              : "Thanks, " + esc(name || session.user.email) + "! Your access request is awaiting administrator approval. You'll be able to sign in as soon as it's approved."}</p>
          <div class="login-msg" style="min-height:0"></div>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:14px">
            ${denied ? "" : `<button class="btn btn-outline btn-sm" id="accessRecheck">Check again</button>`}
            <button class="btn btn-primary btn-sm" id="accessOut">Sign out</button>
          </div>
          </div>
        </div>
      </div>`;
    }
    const out = $("accessOut"); if (out) out.addEventListener("click", logout);
    const re = $("accessRecheck"); if (re) re.addEventListener("click", () => location.reload());
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  async function logout() {
    const client = sb();
    if (client) { try { await client.auth.signOut(); } catch (_) {} }
    window.CURRENT_USER = null;
    location.hash = "";
    location.reload();
  }

  function showSetPassword(session) {
    const root = $("loginScreen");
    const app = $("appRoot");
    if (app) app.style.display = "none";
    if (root) {
      root.style.display = "block";
      root.innerHTML = `
      <div class="login-wrap">
        <div class="login-card">
          <div class="login-brand"><span class="login-logo">📈</span>
            <div><div class="login-title">Welcome to the Savings Portal</div>
            <div class="login-sub">You're invited as ${session.user.email}. Set a password to finish.</div></div>
          </div>
          <form id="pwForm">
            <div class="field"><label>New password</label>
              <input type="password" id="pwNew" placeholder="At least 8 characters" required minlength="8" autocomplete="new-password"></div>
            <div class="field"><label>Confirm password</label>
              <input type="password" id="pwConfirm" placeholder="••••••••" required autocomplete="new-password"></div>
            <div id="loginMsg" class="login-msg"></div>
            <button type="submit" class="btn btn-primary" id="pwBtn" style="width:100%;justify-content:center">Set password &amp; enter</button>
          </form>
          <div class="login-foot">Your role has already been assigned by the portal owner</div>
        </div>
      </div>`;
    }
    const form = $("pwForm");
    if (form) form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const pw = $("pwNew").value, pw2 = $("pwConfirm").value;
      if (pw !== pw2) { setMsg("Passwords do not match.", "err"); return; }
      const btn = $("pwBtn");
      btn.disabled = true; btn.textContent = "Saving…";
      const { error } = await sb().auth.updateUser({ password: pw });
      if (error) {
        setMsg(error.message || "Could not set the password.", "err");
        btn.disabled = false; btn.textContent = "Set password & enter";
        return;
      }
      await onAuthed(session);
    });
    const first = $("pwNew");
    if (first) first.focus();
  }

  async function boot() {
    const client = sb();
    if (!client) { showLogin("Unable to load authentication. Please retry."); return; }
    const { data } = await client.auth.getSession();
    if (data && data.session) {
      if (inviteLanding) { showSetPassword(data.session); return; }
      await onAuthed(data.session);
    } else {
      showLogin();
    }
  }

  window.Auth = { logout, client: sb };
  window.addEventListener("DOMContentLoaded", boot);
})();
