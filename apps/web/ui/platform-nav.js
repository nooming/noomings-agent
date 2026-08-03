(function (global) {
  const TEACHER_TOKEN_KEY = 'platform-teacher-token';
  const STUDENT_ID_KEY = 'platform-student-id';
  const STUDENT_NAME_KEY = 'platform-student-name';
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
    return { id, name };
  }

  function clearTeacherSession() {
    sessionStorage.removeItem(TEACHER_TOKEN_KEY);
  }

  function clearStudentSession() {
    localStorage.removeItem(STUDENT_ID_KEY);
    localStorage.removeItem(STUDENT_NAME_KEY);
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
    const id = (localStorage.getItem(STUDENT_ID_KEY) || '').trim();
    if (!id) {
      location.replace('/student-join.html');
      return false;
    }
    return true;
  }

  /** Attach Bearer token to mutating /api requests from teacher pages. */
  function installTeacherFetchAuth() {
    if (global.__platformTeacherFetchInstalled) return;
    const token = sessionStorage.getItem(TEACHER_TOKEN_KEY);
    if (!token) return;
    const orig = global.fetch.bind(global);
    global.fetch = function platformTeacherFetch(input, init) {
      const opts = init ? { ...init } : {};
      const method = String(opts.method || 'GET').toUpperCase();
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS'
          && typeof url === 'string' && url.includes('/api/')) {
        const headers = new Headers(opts.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', 'Bearer ' + token);
        }
        opts.headers = headers;
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
      const { id, name } = getStudentIdentity();
      const label = name ? `${name} · ${id}` : (id || '未签到');
      meta = `
        <div class="platform-session-meta">
          <span class="platform-role-badge is-student">学生</span>
          <span class="platform-session-id" title="${esc(label)}">${esc(label)}</span>
          <button type="button" class="platform-session-link" data-platform-action="student-rejoin">更换身份</button>
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
      } else if (action === 'student-rejoin') {
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
  };
})(window);
