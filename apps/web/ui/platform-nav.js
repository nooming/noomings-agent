(function (global) {
  function renderHeader(activeRole) {
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
    <nav class="platform-role-switch" aria-label="角色切换">
      <a class="platform-role-btn ${activeRole === 'teacher' ? 'is-active' : ''}" href="/teacher.html">教师端</a>
      <a class="platform-role-btn is-student ${activeRole === 'student' ? 'is-active' : ''}" href="/student.html">学生端</a>
    </nav>
  </div>
</header>`;
  }

  global.PlatformNav = { renderHeader };
})(window);
