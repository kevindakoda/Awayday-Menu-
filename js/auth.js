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

  function loginMarkup(msg, signup) {
    return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-brand"><span class="login-logo">📈</span>
          <div><div class="login-title">Procurement Savings Portal</div>
          <div class="login-sub">${signup ? "Create your account to request access" : "Sign in to access the savings command center"}</div></div>
        </div>
        <form id="loginForm" autocomplete="on">
          ${signup ? `<div class="field"><label>Full name</label>
            <input type="text" id="loginName" placeholder="Jane Doe" autocomplete="name"></div>` : ""}
          <div class="field"><label>Email</label>
            <input type="email" id="loginEmail" placeholder="you@company.com" required></div>
          <div class="field"><label>Password</label>
            <input type="password" id="loginPassword" placeholder="••••••••" required autocomplete="${signup ? "new-password" : "current-password"}"></div>
          <div id="loginMsg" class="login-msg">${msg || ""}</div>
          <button type="submit" class="btn btn-primary" id="loginBtn" style="width:100%;justify-content:center">${signup ? "Create account" : "Sign in"}</button>
        </form>
        <div class="login-foot" style="margin-bottom:6px">
          ${signup
            ? `Already have an account? <a href="#" id="authToggle">Sign in</a>`
            : `New here? <a href="#" id="authToggle">Create an account</a>`}
        </div>
        <div class="login-foot">Secured with Supabase Auth · access is role-based${signup ? " · an admin assigns your role after sign-up" : ""}</div>
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
        showLogin("✅ Account created. Check your email to confirm, then sign in. An admin will assign your role.");
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
    let role = "Shop Manager", name = session.user.email;
    try {
      const { data: profile } = await client.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      if (profile) {
        role = profile.role || role; name = profile.full_name || name;
      } else {
        // First sign-in: create the profile row (role stays the safe default;
        // an admin assigns the real role on the Security page).
        const meta = session.user.user_metadata || {};
        await client.from("profiles").insert({
          id: session.user.id, email: session.user.email, full_name: meta.full_name || "",
        });
        name = meta.full_name || name;
      }
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
