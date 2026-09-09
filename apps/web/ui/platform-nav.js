(function (global) {
  const TEACHER_TOKEN_KEY = 'platform-teacher-token';
  const STUDENT_ID_KEY = 'platform-student-id';
  const STUDENT_NAME_KEY = 'platform-student-name';
  const CLASS_CODE_KEY = 'platform-class-code';
  const STUDENT_SESSION_KEY = 'platform-student-session';
  const TASK_CODE_KEY = 'platform-task-code';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getStudentIdentity() {
    const id = (localStorage.getItem(STUDENT_ID_KEY) || '').trim();
    const name = (localStorage.getItem(STUDENT_NAME_KEY) || '').trim();
    const classCode = (localStorage.getItem(CLASS_CODE_KEY) || '').trim();
    const studentSession = (localStorage.getItem(STUDENT_SESSION_KEY) || '').trim();
    return { id, name, classCode, studentSession };
  }

  function clearTeacherSession() {
    sessionStorage.removeItem(TEACHER_TOKEN_KEY);
  }

  function clearStudentSession() {
    localStorage.removeItem(STUDENT_ID_KEY);
    localStorage.removeItem(STUDENT_NAME_KEY);
    localStorage.removeItem(CLASS_CODE_KEY);
    localStorage.removeItem(STUDENT_SESSION_KEY);
    localStorage.removeItem(TASK_CODE_KEY);
  }

  function requireTeacherSession() {
    if (!sessionStorage.getItem(TEACHER_TOKEN_KEY)) {
      location.replace('/teacher-login.html');
      return false;
    }
    return true;
  }

  function requireStudentSession() {
    const { id, name, classCode, studentSession } = getStudentIdentity();
    if (!id || !name || !classCode || !studentSession) {
      clearStudentSession();
      location.replace('/student-join.html');
      return false;
    }
    return true;
  }

  /** Attach Bearer token to teacher /api calls (incl. GET 学情只读). */
  function installTeacherFetchAuth() {
    if (global.__platformTeacherFetchInstalled) return;
    const token = sessionStorage.getItem(TEACHER_TOKEN_KEY);
    if (!token) return;
    const orig = global.fetch.bind(global);
    global.fetch = function platformTeacherFetch(input, init) {
      const opts = init ? { ...init } : {};
      const method = String(opts.method || 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (typeof url === 'string' && url.includes('/api/')) {
        const isSafeMethod = method === 'HEAD' || method === 'OPTIONS';
        const needsAuth = !isSafeMethod && (
          method !== 'GET'
          || url.includes('/api/platform/traces')
          || url.includes('/api/platform/class-config')
        );
        if (needsAuth) {
          const headers = new Headers(opts.headers || {});
          if (!headers.has('Authorization')) {
            headers.set('Authorization', 'Bearer ' + token);
          }
          opts.headers = headers;
        }
      }
      return orig(input, opts);
    };
    global.__platformTeacherFetchInstalled = true;
  }

  function renderHeader(activeRole) {
    let meta = '';
    if (activeRole === 'teacher') {
      meta = `
        <div class="platform-session-meta">
          <span class="platform-role-badge">教师</span>
          <button type="button" class="platform-session-link" data-platform-action="teacher-logout">退出登录</button>
        </div>`;
    } else if (activeRole === 'student') {
      const { id, name, classCode } = getStudentIdentity();
      const label = name ? `${name} · ${id}` : (id || '未签到');
      const classHint = classCode ? `课堂 ${classCode}` : '';
      meta = `
        <div class="platform-session-meta">
          <span class="platform-role-badge is-student">学生</span>
          <span class="platform-session-id" title="${esc(label)}${classHint ? ' · ' + esc(classHint) : ''}">${esc(label)}</span>
          <button type="button" class="platform-session-link" data-platform-action="student-logout">退出课堂</button>
        </div>`;
    } else {
      meta = `
        <nav class="platform-role-switch" aria-label="入口">
          <a class="platform-role-btn" href="/teacher-login.html">教师登录</a>
          <a class="platform-role-btn is-student" href="/student-join.html">学生进入课堂</a>
        </nav>`;
    }

    return `
<header class="platform-header">
  <div class="platform-header-inner">
    <a class="platform-brand" href="/">
      <span class="platform-brand-mark">PE</span>
      <span>
        <span class="platform-brand-text">物理探究教学平台</span>
        <span class="platform-brand-sub">Physics Inquiry Platform</span>
      </span>
    </a>
    ${meta}
  </div>
</header>`;
  }

  function bindHeaderActions(root) {
    const el = root || document;
    el.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-platform-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-platform-action');
      if (action === 'teacher-logout') {
        clearTeacherSession();
        location.replace('/teacher-login.html');
      } else if (action === 'student-logout' || action === 'student-rejoin') {
        clearStudentSession();
        location.replace('/student-join.html');
      }
    });
  }

  global.PlatformNav = {
    renderHeader,
    bindHeaderActions,
    requireTeacherSession,
    requireStudentSession,
    installTeacherFetchAuth,
    clearTeacherSession,
    clearStudentSession,
    getStudentIdentity,
    TEACHER_TOKEN_KEY,
    STUDENT_ID_KEY,
    STUDENT_NAME_KEY,
    CLASS_CODE_KEY,
    STUDENT_SESSION_KEY,
  };
})(window);
