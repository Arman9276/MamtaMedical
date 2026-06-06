(function () {
      var html = document.documentElement;
      var themeBtn = document.getElementById('themeBtn');
      var themeIcon = document.getElementById('themeIcon');
      var metaTheme = document.getElementById('themeColor');
      var menuBtn = document.getElementById('menuBtn');
      var mobileMenu = document.getElementById('mobileMenu');
      var nav = document.getElementById('mainNav');

      /* ── Theme ── */
      function setTheme(t) {
        html.setAttribute('data-theme', t);
        themeIcon.textContent = t === 'dark' ? '☀️' : '🌙';
        metaTheme.setAttribute('content', t === 'dark' ? '#060f1e' : '#f0f5f0');
        try { localStorage.setItem('mm-theme', t) } catch (e) { }
      }
      var saved = '';
      try { saved = localStorage.getItem('mm-theme') } catch (e) { }
      setTheme(saved || (window.matchMedia('(prefers-color-scheme:light)').matches ? 'light' : 'dark'));
      themeBtn.addEventListener('click', function () {
        setTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
      });

      /* ── Nav scroll shadow ── */
      window.addEventListener('scroll', function () {
        nav.classList.toggle('scrolled', window.scrollY > 20);
      }, { passive: true });

      /* ── Hide float-wa when footer visible ── */
      var floatWa = document.querySelector('.float-wa');
      var footer = document.querySelector('.footer');
      if (floatWa && footer && 'IntersectionObserver' in window) {
        new IntersectionObserver(function (e) {
          floatWa.classList.toggle('hidden', e[0].isIntersecting);
        }, { threshold: 0.05 }).observe(footer);
      }

      /* ── Hamburger ── */
      function closeMenu() {
        mobileMenu.classList.remove('open');
        menuBtn.classList.remove('open');
        menuBtn.setAttribute('aria-expanded', 'false');
      }
      menuBtn.addEventListener('click', function () {
        var o = mobileMenu.classList.toggle('open');
        menuBtn.classList.toggle('open', o);
        menuBtn.setAttribute('aria-expanded', String(o));
      });
      mobileMenu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu) });
      document.addEventListener('click', function (e) {
        if (!mobileMenu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
      });

      /* ── Scroll-reveal ── */
      var revealEls = document.querySelectorAll('.reveal,.reveal-left,.reveal-right,.reveal-scale,.stagger');
      if ('IntersectionObserver' in window) {
        var ro = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add('visible'); ro.unobserve(e.target) }
          });
        }, { threshold: 0.12 });
        revealEls.forEach(function (el) { ro.observe(el) });
      } else {
        revealEls.forEach(function (el) { el.classList.add('visible') });
      }

      /* ── Animated counter ── */
      function animCount(el, target, suffix) {
        var start = 0, dur = 1600, startTime = null;
        function step(ts) {
          if (!startTime) startTime = ts;
          var p = Math.min((ts - startTime) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.floor(eased * target) + (suffix || '');
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      }
      var countEls = document.querySelectorAll('[data-count]');
      if ('IntersectionObserver' in window) {
        var co = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            if (e.isIntersecting) {
              var el = e.target;
              animCount(el, parseInt(el.dataset.count), el.dataset.suffix || '');
              co.unobserve(el);
            }
          });
        }, { threshold: 0.5 });
        countEls.forEach(function (el) { co.observe(el) });
      }

    })();
