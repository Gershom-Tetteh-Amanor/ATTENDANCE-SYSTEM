/* ============================================
   auth.js — Authentication for all roles
   ============================================ */
'use strict';

const AUTH = (() => {
  const saveSession  = u  => localStorage.setItem(CONFIG.KEYS.USER, JSON.stringify(u));
  const getSession   = () => { try { return JSON.parse(localStorage.getItem(CONFIG.KEYS.USER)); } catch { return null; } };
  const clearSession = () => localStorage.removeItem(CONFIG.KEYS.USER);

  /* ── Super admin setup (one-time only) ── */
  async function setupSuperAdmin() {
    const name=UI.Q('sa-name')?.value.trim(), email=UI.Q('sa-email')?.value.trim().toLowerCase();
    const pass=UI.Q('sa-pass')?.value, pass2=UI.Q('sa-pass2')?.value;
    UI.clrAlert('al-alert');
    if (!name||!email||!pass) return UI.setAlert('al-alert','All fields are required.');
    if (pass.length<8)         return UI.setAlert('al-alert','Password must be at least 8 characters.');
    if (pass!==pass2)          return UI.setAlert('al-alert','Passwords do not match.');
    UI.btnLoad('sa-btn',true);
    try {
      if (await DB.SA.exists()) { UI.btnLoad('sa-btn',false,'Create admin account'); return UI.setAlert('al-alert','An admin account already exists. Please sign in.'); }
      await DB.SA.set({ id:UI.makeToken(), name, email, pwHash:UI.hashPw(pass), createdAt:Date.now() });
      UI.btnLoad('sa-btn',false,'Create admin account');
      await MODAL.success('Admin account created!',`Welcome, ${name}. You can now sign in.`);
      APP._refreshAdminLogin(); /* hides setup form permanently */
    } catch(err) { UI.btnLoad('sa-btn',false,'Create admin account'); UI.setAlert('al-alert',err.message||'Something went wrong.'); }
  }

  /* ── Admin login (super admin + co-admin share one form) ── */
  async function adminLogin() {
    const email=UI.Q('al-email')?.value.trim().toLowerCase(), pass=UI.Q('al-pass')?.value;
    UI.clrAlert('al-alert');
    if (!email||!pass) return UI.setAlert('al-alert','Enter your email and password.');
    UI.btnLoad('al-btn',true);
    try {
      const hash=UI.hashPw(pass);
      const sa=await DB.SA.get();
      if (sa&&sa.email===email&&sa.pwHash===hash) { saveSession({...sa,role:'superAdmin'}); UI.btnLoad('al-btn',false,'Sign in'); await APP.activateAdmin({...sa,role:'superAdmin'}); return; }
      const cas=await DB.CA.getAll(), ca=cas.find(c=>c.email===email&&c.pwHash===hash);
      if (ca) {
        if (ca.status==='pending') { UI.btnLoad('al-btn',false,'Sign in'); return UI.setAlert('al-alert','Your application is pending approval.'); }
        if (ca.status==='revoked') { UI.btnLoad('al-btn',false,'Sign in'); return UI.setAlert('al-alert','Your access has been revoked.'); }
        saveSession({...ca,role:'coAdmin'}); UI.btnLoad('al-btn',false,'Sign in'); await APP.activateAdmin({...ca,role:'coAdmin'}); return;
      }
      UI.btnLoad('al-btn',false,'Sign in'); UI.setAlert('al-alert','Invalid email or password.');
    } catch(err) { UI.btnLoad('al-btn',false,'Sign in'); UI.setAlert('al-alert',err.message||'Login failed. Check your Firebase configuration.'); }
  }

  const adminLogout = () => { clearSession(); APP.goTo('landing'); };

  /* ── Co-admin application ── */
  async function coAdminApply() {
    const name=UI.Q('ca-name')?.value.trim(), email=UI.Q('ca-email')?.value.trim().toLowerCase();
    const dept=UI.Q('ca-dept')?.value, pass=UI.Q('ca-pass')?.value, pass2=UI.Q('ca-pass2')?.value;
    UI.clrAlert('ca-alert');
    if (!name||!email||!dept||!pass) return UI.setAlert('ca-alert','All fields are required.');
    if (pass.length<8) return UI.setAlert('ca-alert','Password must be at least 8 characters.');
    if (pass!==pass2)  return UI.setAlert('ca-alert','Passwords do not match.');
    UI.btnLoad('ca-btn',true);
    try {
      if (await DB.CA.byEmail(email)) { UI.btnLoad('ca-btn',false,'Submit application'); return UI.setAlert('ca-alert','An application with this email already exists.'); }
      const id=UI.makeToken();
      await DB.CA.set(id,{id,name,email,department:dept,pwHash:UI.hashPw(pass),status:'pending',createdAt:Date.now()});
      UI.btnLoad('ca-btn',false,'Submit application');
      await MODAL.success('Application submitted!','The administrator will review your request. You can sign in once approved.');
      APP.goTo('admin-login');
    } catch(err) { UI.btnLoad('ca-btn',false,'Submit application'); UI.setAlert('ca-alert',err.message||'Submission failed.'); }
  }

  /* ── Lecturer login ── */
  async function lecLogin() {
    const email=UI.Q('ll-email')?.value.trim().toLowerCase(), pass=UI.Q('ll-pass')?.value;
    UI.clrAlert('ll-alert');
    if (!email||!pass)       return UI.setAlert('ll-alert','Enter your email and password.');
    if (!UI.isLecEmail(email)) return UI.setAlert('ll-alert','Email must end with .ug.edu.gh');
    UI.btnLoad('ll-btn',true);
    try {
      const lec=await DB.LEC.byEmail(email);
      if (!lec||lec.pwHash!==UI.hashPw(pass)) { UI.btnLoad('ll-btn',false,'Sign in'); return UI.setAlert('ll-alert','Invalid email or password.'); }
      saveSession({...lec,role:'lecturer'}); UI.btnLoad('ll-btn',false,'Sign in'); await APP.activateLecturer({...lec,role:'lecturer'});
    } catch(err) { UI.btnLoad('ll-btn',false,'Sign in'); UI.setAlert('ll-alert',err.message||'Login failed.'); }
  }

  /* ── Lecturer signup (no institution — UG only) ── */
  async function lecSignup() {
    const uid=UI.Q('ls-uid')?.value.trim().toUpperCase(), name=UI.Q('ls-name')?.value.trim();
    const email=UI.Q('ls-email')?.value.trim().toLowerCase(), dept=UI.Q('ls-dept')?.value;
    const pass=UI.Q('ls-pass')?.value, pass2=UI.Q('ls-pass2')?.value;
    UI.clrAlert('ls-alert');
    if (!uid||!name||!email||!dept||!pass) return UI.setAlert('ls-alert','All fields are required.');
    if (!UI.isLecEmail(email)) return UI.setAlert('ls-alert','Email must end with .ug.edu.gh (e.g. name@dept.ug.edu.gh)');
    if (pass.length<8) return UI.setAlert('ls-alert','Password must be at least 8 characters.');
    if (pass!==pass2)  return UI.setAlert('ls-alert','Passwords do not match.');
    UI.btnLoad('ls-btn',true);
    try {
      const uidData=await DB.UID.get(uid);
      if (!uidData||uidData.status!=='available') { UI.btnLoad('ls-btn',false,'Create account'); return UI.setAlert('ls-alert','Invalid, already used, or revoked Unique ID. Ask your admin for a new one.'); }
      if (await DB.LEC.byEmail(email)) { UI.btnLoad('ls-btn',false,'Create account'); return UI.setAlert('ls-alert','An account with this email already exists. Sign in instead.'); }
      const fbId=UI.makeToken();
      await DB.UID.update(uid,{status:'assigned',assignedTo:email,assignedAt:Date.now()});
      const lec={id:fbId,lecId:uid,name,email,department:dept,pwHash:UI.hashPw(pass),createdAt:Date.now()};
      await DB.LEC.set(fbId,lec); saveSession({...lec,role:'lecturer'}); UI.btnLoad('ls-btn',false,'Create account');
      await MODAL.success('Account created!',`Welcome, ${name}. Your Lecturer ID: <strong>${uid}</strong>`);
      await APP.activateLecturer({...lec,role:'lecturer'});
    } catch(err) { UI.btnLoad('ls-btn',false,'Create account'); UI.setAlert('ls-alert',err.message||'Registration failed.'); }
  }

  const lecLogout = () => { LEC.stopTimers(); clearSession(); APP.goTo('landing'); };

  /* ── TA login ── */
  async function taLogin() {
    const email=UI.Q('tl-email')?.value.trim().toLowerCase(), pass=UI.Q('tl-pass')?.value;
    UI.clrAlert('tl-alert');
    if (!email||!pass)      return UI.setAlert('tl-alert','Enter your email and password.');
    if (!UI.isTAEmail(email)) return UI.setAlert('tl-alert','Email must end with @st.ug.edu.gh');
    UI.btnLoad('tl-btn',true);
    try {
      const ta=await DB.TA.byEmail(email);
      if (!ta||ta.pwHash!==UI.hashPw(pass)) { UI.btnLoad('tl-btn',false,'Sign in'); return UI.setAlert('tl-alert','Invalid email or password.'); }
      if (ta.status!=='active') { UI.btnLoad('tl-btn',false,'Sign in'); return UI.setAlert('tl-alert','TA account is not active. Contact your lecturer.'); }
      saveSession({...ta,role:'ta'}); UI.btnLoad('tl-btn',false,'Sign in'); await APP.activateLecturer({...ta,role:'ta'});
    } catch(err) { UI.btnLoad('tl-btn',false,'Sign in'); UI.setAlert('tl-alert',err.message||'Login failed.'); }
  }

  /* ── TA signup (invite code flow) ── */
  async function taSignup() {
    const code=UI.Q('ts-code')?.value.trim().toUpperCase(), name=UI.Q('ts-name')?.value.trim();
    const email=UI.Q('ts-email')?.value.trim().toLowerCase(), pass=UI.Q('ts-pass')?.value, pass2=UI.Q('ts-pass2')?.value;
    UI.clrAlert('ts-alert');
    if (!code||!name||!email||!pass) return UI.setAlert('ts-alert','All fields are required.');
    if (!UI.isTAEmail(email))         return UI.setAlert('ts-alert','Email must end with @st.ug.edu.gh');
    if (pass.length<8)                return UI.setAlert('ts-alert','Password must be at least 8 characters.');
    if (pass!==pass2)                 return UI.setAlert('ts-alert','Passwords do not match.');
    UI.btnLoad('ts-btn',true);
    try {
      const entry=await DB.TA.inviteByCode(code);
      if (!entry) { UI.btnLoad('ts-btn',false,'Create TA account'); return UI.setAlert('ts-alert','Invalid invite code.'); }
      const [invKey,inv]=entry;
      if (inv.usedAt)              { UI.btnLoad('ts-btn',false,'Create TA account'); return UI.setAlert('ts-alert','This invite code has already been used.'); }
      if (inv.expiresAt<Date.now()){ UI.btnLoad('ts-btn',false,'Create TA account'); return UI.setAlert('ts-alert','Code expired. Ask your lecturer to send a new invite.'); }
      if (inv.toEmail.toLowerCase()!==email){ UI.btnLoad('ts-btn',false,'Create TA account'); return UI.setAlert('ts-alert','This code was issued for a different email.'); }
      const existing=await DB.TA.byEmail(email); let uid;
      if (existing) { uid=existing.id; const lecs=existing.lecturers||[]; if(!lecs.includes(inv.lecturerId)) await DB.TA.update(uid,{lecturers:[...lecs,inv.lecturerId]}); }
      else { uid=UI.makeToken(); await DB.TA.set(uid,{id:uid,name,email,pwHash:UI.hashPw(pass),lecturers:[inv.lecturerId],status:'active',createdAt:Date.now()}); }
      await DB.TA.updateInvite(invKey,{usedAt:Date.now(),taId:uid});
      const ta=await DB.TA.get(uid); saveSession({...ta,id:uid,role:'ta'}); UI.btnLoad('ts-btn',false,'Create TA account');
      await MODAL.success('TA account created!',`Welcome, ${name}!`);
      await APP.activateLecturer({...ta,id:uid,role:'ta'});
    } catch(err) { UI.btnLoad('ts-btn',false,'Create TA account'); UI.setAlert('ts-alert',err.message||'Registration failed.'); }
  }

  return { setupSuperAdmin, adminLogin, adminLogout, coAdminApply, lecLogin, lecSignup, lecLogout, taLogin, taSignup, getSession, saveSession, clearSession };
})();
