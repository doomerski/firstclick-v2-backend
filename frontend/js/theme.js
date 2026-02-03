(() => {
  const THEME_KEY = 'site_theme';
  const DARK = 'dark';
  const LIGHT = 'light';

  function getStoredTheme() {
    return localStorage.getItem(THEME_KEY) || LIGHT;
  }

  function applyTheme(theme) {
    const isDark = theme === DARK;
    document.documentElement.classList.toggle('theme-dark', isDark);
    document.documentElement.setAttribute('data-theme', isDark ? DARK : LIGHT);
  }

  function setTheme(theme) {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    updateButton();
  }

  function createToggle() {
    const label = document.createElement('label');
    label.className = 'theme-toggle';
    label.setAttribute('role', 'switch');

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'theme-toggle-input';
    input.addEventListener('change', () => {
      setTheme(input.checked ? DARK : LIGHT);
    });

    const slider = document.createElement('span');
    slider.className = 'theme-toggle-slider';

    const text = document.createElement('span');
    text.className = 'theme-toggle-text';

    label.appendChild(input);
    label.appendChild(slider);
    label.appendChild(text);
    return label;
  }

  function ensureFooterToggleContainer() {
    let footer = document.querySelector('.site-footer');
    if (!footer) {
      footer = document.createElement('footer');
      footer.className = 'site-footer';
      footer.innerHTML = `
        <div class="container footer-content">
          <span class="footer-text">© 2026 FirstClick</span>
          <div class="theme-toggle-slot"></div>
        </div>
      `;
      document.body.appendChild(footer);
    }
    let slot = footer.querySelector('.theme-toggle-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'theme-toggle-slot';
      const target = footer.querySelector('.footer-content') || footer;
      target.appendChild(slot);
    }
    return slot;
  }

  function ensureResponsiveMenuStyles() {
    if (document.getElementById('responsive-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'responsive-menu-styles';
    style.textContent = `
      .header-content { position: relative; }
      .menu-btn {
        display: none;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 0.75rem;
        border-radius: 0.75rem;
        border: 1px solid rgba(17, 24, 39, 0.12);
        background: rgba(17, 24, 39, 0.06);
        color: #111827;
        font-size: 0.85rem;
        font-weight: 700;
        cursor: pointer;
      }
      .nav-mobile {
        display: none;
        position: absolute;
        top: calc(100% + 0.5rem);
        right: 0;
        width: min(280px, calc(100vw - 2rem));
        background: #ffffff;
        border: 1px solid rgba(17, 24, 39, 0.12);
        border-radius: 0.9rem;
        overflow: hidden;
        box-shadow: 0 12px 24px rgba(0,0,0,0.12);
        z-index: 20;
      }
      .nav-mobile.is-open { display: block; }
      .nav-mobile a,
      .nav-mobile button {
        display: block;
        width: 100%;
        padding: 0.75rem 0.9rem;
        text-align: left;
        text-decoration: none;
        border: none;
        background: transparent;
        color: #111827;
        font-weight: 600;
        font-size: 0.9rem;
        cursor: pointer;
        border-top: 1px solid rgba(17, 24, 39, 0.08);
      }
      .nav-mobile a:first-child,
      .nav-mobile button:first-child {
        border-top: none;
      }
      .nav-mobile a:hover,
      .nav-mobile button:hover {
        background: rgba(17, 24, 39, 0.05);
      }
      .nav-mobile .theme-toggle {
        width: 100%;
        justify-content: space-between;
        border-radius: 0;
        border: none;
        background: transparent;
        padding: 0.75rem 0.9rem;
        border-top: 1px solid rgba(17, 24, 39, 0.08);
      }
      .nav-mobile .theme-toggle-text { font-size: 0.8rem; }
      @media (max-width: 768px) {
        .header .nav { display: none !important; }
        .header .header-actions,
        .header .header-content > .header-actions,
        .header .header-content .header-actions { display: none !important; }
        .header .header-content > .btn,
        .header .header-content .btn { display: none !important; }
        .header-content.has-admin-select .header-actions { display: flex !important; }
        .menu-btn { display: inline-flex; }
      }
      @media (min-width: 769px) {
        .nav-mobile { display: none !important; }
      }
      html.theme-dark .menu-btn {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.12);
        color: #f8fafc;
      }
      html.theme-dark .nav-mobile {
        background: #0b1220;
        border-color: rgba(255, 255, 255, 0.12);
      }
      html.theme-dark .nav-mobile a,
      html.theme-dark .nav-mobile button {
        color: #f8fafc;
        border-top-color: rgba(255, 255, 255, 0.08);
      }
      html.theme-dark .nav-mobile a:hover,
      html.theme-dark .nav-mobile button:hover {
        background: rgba(255, 255, 255, 0.06);
      }
      html.theme-dark .nav-mobile .theme-toggle {
        border-top-color: rgba(255, 255, 255, 0.08);
      }
    `;
    document.head.appendChild(style);
  }

  function findInsertTarget() {
    const slot = document.querySelector('.theme-toggle-slot');
    if (slot) return slot;
    return ensureFooterToggleContainer();
  }

  function updateButton() {
    const toggles = document.querySelectorAll('.theme-toggle');
    if (toggles.length === 0) return;
    const isDark = document.documentElement.classList.contains('theme-dark');
    toggles.forEach((toggle) => {
      const input = toggle.querySelector('.theme-toggle-input');
      const text = toggle.querySelector('.theme-toggle-text');
      if (input) {
        input.checked = isDark;
      }
      if (text) {
        text.textContent = isDark ? 'Dark' : 'Light';
      }
      toggle.setAttribute('aria-checked', String(isDark));
    });
  }

  function ensureButton() {
    if (document.querySelector('.theme-toggle')) return;
    const target = findInsertTarget();
    if (!target) return;
    const toggle = createToggle();
    target.appendChild(toggle);
  }

  function setupAdminPageSelect() {
    const selects = document.querySelectorAll('.admin-page-select');
    if (selects.length === 0) return;
    const current = window.location.pathname.split('/').pop();
    selects.forEach((select) => {
      const header = select.closest('.header-content');
      if (header) {
        header.classList.add('has-admin-select');
      }
      if (current) {
        const option = select.querySelector(`option[value="${current}"]`);
        if (option) {
          select.value = current;
        }
      }
      select.addEventListener('change', (event) => {
        const value = event.target.value;
        if (value) {
          window.location.href = value;
        }
      });
    });
  }

  function setupResponsiveHeaderMenu() {
    const headers = document.querySelectorAll('.header-content');
    headers.forEach((header, index) => {
      if (header.querySelector('.admin-page-select')) return;
      const nav = header.querySelector('.nav');
      const actions = header.querySelector('.header-actions');
      const source = nav || actions;
      if (!source) return;
      const items = source.querySelectorAll('a, button');
      if (items.length === 0) return;
      if (header.querySelector('.menu-btn')) return;

      const menuBtn = document.createElement('button');
      const menuId = `mobileMenu-${index + 1}`;
      menuBtn.type = 'button';
      menuBtn.className = 'menu-btn';
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.setAttribute('aria-controls', menuId);
      menuBtn.textContent = '☰ Menu';

      const mobileNav = document.createElement('nav');
      mobileNav.className = 'nav-mobile';
      mobileNav.id = menuId;
      mobileNav.setAttribute('aria-label', 'Mobile Primary');

      items.forEach((item) => {
        const clone = item.cloneNode(true);
        clone.classList.remove('nav-link', 'btn', 'btn-small', 'btn-primary', 'btn-secondary', 'btn-ghost');
        if (clone.tagName === 'BUTTON') {
          clone.type = 'button';
        }
        mobileNav.appendChild(clone);
      });

      header.appendChild(menuBtn);
      header.appendChild(mobileNav);

      menuBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        const isOpen = mobileNav.classList.toggle('is-open');
        menuBtn.setAttribute('aria-expanded', String(isOpen));
      });

      mobileNav.addEventListener('click', (event) => {
        if (event.target.closest('a')) {
          mobileNav.classList.remove('is-open');
          menuBtn.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('click', (event) => {
        if (!mobileNav.contains(event.target) && !menuBtn.contains(event.target)) {
          mobileNav.classList.remove('is-open');
          menuBtn.setAttribute('aria-expanded', 'false');
        }
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          mobileNav.classList.remove('is-open');
          menuBtn.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getStoredTheme());
    ensureButton();
    ensureResponsiveMenuStyles();
    setupAdminPageSelect();
    setupResponsiveHeaderMenu();
    updateButton();
  });
})();
