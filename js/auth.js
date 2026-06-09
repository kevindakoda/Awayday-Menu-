/* =====================================================================
   Authentication gate (Supabase Auth).
   The app shell stays hidden until a valid session exists. The logged-in
   user's profile row supplies the procurement role used for access control.
   ===================================================================== */
(function () {
  "use strict";
  const cfg = window.PSP_CONFIG;
  let client = null;

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

  function loginMarkup(msg) {
    return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand"><span class="login-logo">📈</span>
          <div><div class="login-title">Procurement Savings Portal</div>
          <div class="login-sub">Sign in to access the savings command center</div></div>
        </div>
        <form id="loginForm" autocomplete="on">
          <div class="field"><label>Email</label>
            <input type="email" id="loginEmail" placeholder="you@company.com" required></div>
          <div class="field"><label>Password</label>
            <input type="password" id="loginPassword" placeholder="••••••••" required></div>
          <div id="loginMsg" class="login-msg">${msg || ""}</div>
          <button type="submit" class="btn btn-primary" id="loginBtn" style="width:100%;justify-content:center">Sign in</button>
        </form>
        <div class="login-foot">Secured with Supabase Auth · access is role-based</div>
      </div>
    </div>`;
  }

  function showLogin(msg) {
    const root = $("loginScreen");
    const app = $("appRoot");
    if (app) app.style.display = "none";
    if (root) { root.style.display = "block"; root.innerHTML = loginMarkup(msg); }
    const form = $("loginForm");
    if (form) form.addEventListener("submit", onSubmit);
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
    btn.disabled = true; btn.textContent = "Signing in…";
    setMsg("");
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
    let role = "Shop Manager", name = session.user.email;
    try {
      const { data: profile } = await client.from("profiles").select("*").eq("id", session.user.id).single();
      if (profile) { role = profile.role || role; name = profile.full_name || name; }
    } catch (_) { /* fall back to defaults */ }

    window.CURRENT_USER = { email: session.user.email, name, role, id: session.user.id };
    if (window.AppState) window.AppState.role = role;

    const root = $("loginScreen");
    const app = $("appRoot");
    if (root) { root.style.display = "none"; root.innerHTML = ""; }
    if (app) app.style.display = "flex";
    if (window.App && window.App.start) window.App.start();
  }

  async function logout() {
    const client = sb();
    if (client) { try { await client.auth.signOut(); } catch (_) {} }
    window.CURRENT_USER = null;
    location.hash = "";
    location.reload();
  }

  async function boot() {
    const client = sb();
    if (!client) { showLogin("Unable to load authentication. Please retry."); return; }
    const { data } = await client.auth.getSession();
    if (data && data.session) {
      await onAuthed(data.session);
    } else {
      showLogin();
    }
  }

  window.Auth = { logout, client: sb };
  window.addEventListener("DOMContentLoaded", boot);
})();
