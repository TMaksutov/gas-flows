// Multilingual handling: detection, first-visit redirect, persistence, link rewriting, fixed corner dropdown, canonical/alternates
(function() {
    var STORAGE_KEY = 'gas-flows-lang';

    function detectLangFromPath(pathname) {
        // When running via file://, the path will be like /C:/.../de/index.html
        // Detect language if the path contains a language segment anywhere
        if (window.location.protocol === 'file:') {
            var segments = pathname.split('/').filter(Boolean);
            for (var i = 0; i < segments.length; i++) {
                if (segments[i] === 'de') return 'de';
                if (segments[i] === 'ru') return 'ru';
            }
            return 'en';
        }
        if (pathname.indexOf('/de/') === 0) return 'de';
        if (pathname.indexOf('/ru/') === 0) return 'ru';
        return 'en';
    }

    function getStoredLang() {
        try { return localStorage.getItem(STORAGE_KEY) || null; } catch (_) { return null; }
    }
    function setStoredLang(lang) {
        try { localStorage.setItem(STORAGE_KEY, lang); } catch (_) {}
    }

    // Map short pretty paths to actual filenames
    function mapToFilename(segment) {
        if (!segment || segment === '/') return 'index.html';
        var name = segment.replace(/^\//, '');
        if (/\.[a-zA-Z0-9]+$/.test(name)) return name; // already a file
        var lower = name.toLowerCase();
        if (lower === 'index') return 'index.html';
        if (lower === 'aga8') return 'aga8.html';
        if (lower === 'aga8flow') return 'AGA8Flow.html';
        if (lower === 'pressures') return 'pressures.html';
        if (lower === 'simulator') return 'simulator.html';
        if (lower === 'contacts') return 'contacts.html';
        if (lower === 'help') return 'help.html';
        return name + '.html';
    }

    function getNormalizedFilenameFromPath(pathname) {
        var parts = pathname.split('/');
        if (parts.length && parts[0] === '') parts.shift();
        if (parts[0] === 'de' || parts[0] === 'ru') parts.shift();
        var last = parts.length ? parts[parts.length - 1] : '';
        if (!last || last === '') return 'index.html';
        return mapToFilename(last);
    }

    function buildTargetPath(currentPathname, targetLang) {
        var isFile = window.location.protocol === 'file:';
        var currentLang = detectLangFromPath(currentPathname);
        var filename = getNormalizedFilenameFromPath(currentPathname);
        if (isFile) {
            // For file://, construct proper relative paths based on presence of lang segment
            var parts = currentPathname.split('/').filter(Boolean);
            var hasLang = parts.indexOf('de') !== -1 || parts.indexOf('ru') !== -1;
            if (!hasLang) {
                // Currently at root (e.g., /C:/.../index.html)
                if (targetLang === 'en') return filename;
                return targetLang + '/' + filename;
            } else {
                // Currently in a lang folder (e.g., /C:/.../de/index.html)
                if (targetLang === 'en') return '../' + filename;
                // Switching between localized folders
                return '../' + targetLang + '/' + filename;
            }
        }
        if (targetLang === 'en') return '/' + filename;
        return '/' + targetLang + '/' + filename;
    }

    function ensureCanonicalAndAlternates() {
        var head = document.getElementsByTagName('head')[0];
        if (!head) return;
        var isFile = window.location.protocol === 'file:';
        var origin = isFile ? 'https://gas-flows.com' : (window.location.origin || (window.location.protocol + '//' + window.location.host));
        var pathname = window.location.pathname;
        var currentLang = detectLangFromPath(pathname);

        document.documentElement.setAttribute('lang', currentLang);

        var canonicalHref = origin + buildTargetPath(pathname, currentLang).replace(/^\./, '');
        var canonical = head.querySelector('link[rel="canonical"]');
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            head.appendChild(canonical);
        }
        canonical.setAttribute('href', canonicalHref);

        [].slice.call(head.querySelectorAll('link[rel="alternate"][hreflang]')).forEach(function(n) { head.removeChild(n); });

        ['en','de','ru'].forEach(function(lang) {
            var link = document.createElement('link');
            link.setAttribute('rel', 'alternate');
            link.setAttribute('hreflang', lang);
            link.setAttribute('href', origin + buildTargetPath(pathname, lang).replace(/^\./, ''));
            head.appendChild(link);
        });
        var xdef = document.createElement('link');
        xdef.setAttribute('rel', 'alternate');
        xdef.setAttribute('hreflang', 'x-default');
        xdef.setAttribute('href', origin + buildTargetPath(pathname, 'en').replace(/^\./, ''));
        head.appendChild(xdef);
    }

    function rewriteInternalLinks(currentLang) {
        // Do not rewrite links for file:// local browsing to preserve relative paths
        if (window.location.protocol === 'file:') return;
        var anchors = document.getElementsByTagName('a');
        var origin = window.location.origin;
        for (var i = 0; i < anchors.length; i++) {
            var a = anchors[i];
            var href = a.getAttribute('href');
            if (!href) continue;
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:') || href.startsWith('#')) continue;
            // Build URL relative to current location to normalize
            var url;
            try { url = new URL(href, window.location.href); } catch (_) { continue; }
            if (origin && url.origin && url.origin !== origin) continue; // external
            var targetFile = mapToFilename(url.pathname.split('/').pop());
            // Rewrite based on desired lang
            if (currentLang === 'en') {
                a.setAttribute('href', '/' + targetFile);
            } else {
                a.setAttribute('href', '/' + currentLang + '/' + targetFile);
            }
        }
    }

    function injectCornerDropdown(currentLang) {
        // Avoid duplicates
        if (document.getElementById('lang-switcher')) return;
        var wrap = document.createElement('div');
        wrap.id = 'lang-switcher';
        wrap.className = 'lang-switcher';
        var select = document.createElement('select');
        select.setAttribute('aria-label', 'Language');
        ;['en','de','ru'].forEach(function(code) {
            var o = document.createElement('option');
            o.value = code;
            o.textContent = code === 'en' ? 'EN' : code === 'de' ? 'DE' : 'RU';
            select.appendChild(o);
        });
        select.value = currentLang;
        select.addEventListener('change', function() {
            var lang = this.value;
            setStoredLang(lang);
            window.location.href = buildTargetPath(window.location.pathname, lang);
        });
        wrap.appendChild(select);
        document.body.appendChild(wrap);
    }

    function firstVisitRedirectIfNeeded(currentLang) {
        if (getStoredLang()) return; // user already chose
        var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        var want = nav.indexOf('de') === 0 ? 'de' : (nav.indexOf('ru') === 0 ? 'ru' : 'en');
        if (currentLang === 'en' && (want === 'de' || want === 'ru')) {
            setStoredLang(want);
            window.location.replace(buildTargetPath(window.location.pathname, want));
        }
    }

    // Init early for redirect (file:// safe)
    (function init() {
        var currentLang = detectLangFromPath(window.location.pathname);
        // If user has a stored preference different from current, respect it
        var stored = getStoredLang();
        if (stored && (stored === 'en' || stored === 'de' || stored === 'ru') && stored !== currentLang) {
            // For file:// ensure we navigate using relative path, not absolute
            var target = buildTargetPath(window.location.pathname, stored);
            if (window.location.protocol === 'file:') {
                window.location.href = target;
            } else {
                window.location.replace(target);
            }
            return;
        }
        // Only auto-redirect on first visit (no stored choice)
        firstVisitRedirectIfNeeded(currentLang);
    })();

    document.addEventListener('DOMContentLoaded', function() {
        var currentLang = detectLangFromPath(window.location.pathname);
        ensureCanonicalAndAlternates();
        injectCornerDropdown(currentLang);
        rewriteInternalLinks(currentLang);
    });
})();


