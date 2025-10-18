// Simple JS-only i18n runtime (no libraries)
// - Uses global TRANSLATIONS object from js/translations.js
// - Detects language via ?lang=, #lang=, localStorage, navigator
// - Applies translations to elements with data-i18n="section.key"
// - Updates <title>, meta[name=description], meta[name=keywords]
// - Manages a top-right language selector in #lang-selector

(function() {
  var SUPPORTED = ['en', 'ru', 'de'];
  var STORAGE_KEY = 'siteLanguage';

  function getQueryParam(name) {
    var params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function getHashLang() {
    var m = window.location.hash.match(/lang=([a-z]{2})/i);
    return m ? m[1].toLowerCase() : null;
  }

  function detectLang() {
    var fromQuery = (getQueryParam('lang') || '').toLowerCase();
    if (SUPPORTED.indexOf(fromQuery) !== -1) return fromQuery;

    var fromHash = (getHashLang() || '').toLowerCase();
    if (SUPPORTED.indexOf(fromHash) !== -1) return fromHash;

    var fromStorage = (localStorage.getItem(STORAGE_KEY) || '').toLowerCase();
    if (SUPPORTED.indexOf(fromStorage) !== -1) return fromStorage;

    var nav = (navigator.language || navigator.userLanguage || 'en').slice(0,2).toLowerCase();
    if (SUPPORTED.indexOf(nav) !== -1) return nav;

    return 'en';
  }

  function setLangInUrl(lang) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      history.replaceState(null, '', url.toString());
    } catch (e) {
      // file:// fallback via hash
      var base = window.location.href.split('#')[0];
      window.location.replace(base + '#lang=' + lang);
    }
  }

  function applyMeta(trans) {
    if (!trans) return;
    if (trans.ui && trans.ui.title) {
      document.title = trans.ui.title;
    }
    var md = document.querySelector('meta[name="description"]');
    if (md && trans.keywords && trans.keywords.description) {
      md.setAttribute('content', trans.keywords.description);
    }
    var mk = document.querySelector('meta[name="keywords"]');
    if (mk && trans.keywords && trans.keywords.tags) {
      mk.setAttribute('content', trans.keywords.tags);
    }
  }

  function applyDom(trans) {
    if (!trans) return;
    var nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function(node) {
      var key = node.getAttribute('data-i18n');
      if (!key) return;
      var parts = key.split('.');
      var cur = trans;
      for (var i = 0; i < parts.length && cur; i++) {
        cur = cur[parts[i]];
      }
      if (typeof cur === 'string') {
        // Only set textContent to avoid breaking formulas/HTML
        node.textContent = cur;
      }
    });
  }

  function updateHreflangLinks(lang) {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    var heads = document.querySelectorAll('link[rel="alternate"][hreflang]');
    heads.forEach(function(link){
      var h = link.getAttribute('hreflang');
      if (SUPPORTED.indexOf(h) !== -1) {
        // keep relative for local testing
        link.setAttribute('href', path + '?lang=' + h);
      }
    });
  }

  function buildSelector(currentLang) {
    var host = document.getElementById('lang-selector');
    if (!host) return;
    host.innerHTML = '';
    var select = document.createElement('select');
    select.style.padding = '4px';
    select.style.fontSize = '14px';
    SUPPORTED.forEach(function(code){
      var opt = document.createElement('option');
      opt.value = code;
      opt.textContent = (code === 'en' ? 'EN' : code === 'ru' ? 'RU' : 'DE');
      if (code === currentLang) opt.selected = true;
      select.appendChild(opt);
    });
    select.addEventListener('change', function(){
      var lang = select.value;
      localStorage.setItem(STORAGE_KEY, lang);
      setLangInUrl(lang);
      // Re-apply immediately
      applyAll(lang);
    });
    host.appendChild(select);
  }

  function applyAll(lang) {
    var dict = (window.TRANSLATIONS && window.TRANSLATIONS[lang]) || null;
    applyMeta(dict);
    applyDom(dict);
    updateHreflangLinks(lang);
    buildSelector(lang);
  }

  document.addEventListener('DOMContentLoaded', function(){
    var lang = detectLang();
    localStorage.setItem(STORAGE_KEY, lang);
    applyAll(lang);
  });
})();


