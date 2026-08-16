/* Språkväxling för de juridiska sidorna.
   Båda språkversionerna ligger i HTML:en – knappen visar/döljer bara.
   Valet ligger kvar i localStorage och kan djuplänkas med ?lang=en. */
(function () {
  'use strict';

  var docs = document.querySelectorAll('[data-doc]');
  var buttons = document.querySelectorAll('.langswitch button');
  if (!docs.length || !buttons.length) return;

  var FOOT = {
    sv: { terms: 'Användarvillkor', privacy: 'Integritetspolicy', start: 'Start' },
    en: { terms: 'Terms of Service', privacy: 'Privacy Policy', start: 'Home' }
  };

  function apply(lang, push) {
    if (lang !== 'en') lang = 'sv';

    for (var i = 0; i < docs.length; i++) {
      docs[i].hidden = docs[i].getAttribute('data-doc') !== lang;
    }
    for (var j = 0; j < buttons.length; j++) {
      var on = buttons[j].getAttribute('data-lang') === lang;
      buttons[j].classList.toggle('on', on);
      buttons[j].setAttribute('aria-pressed', String(on));
    }

    document.documentElement.lang = lang;

    var links = document.querySelectorAll('.foot-links a');
    for (var k = 0; k < links.length; k++) {
      var href = links[k].getAttribute('href');
      if (href === '../') links[k].textContent = FOOT[lang].start;
      else if (href === '../terms/') links[k].textContent = FOOT[lang].terms;
      else if (href === '../privacy/') links[k].textContent = FOOT[lang].privacy;
    }

    try { localStorage.setItem('arbixit-lang', lang); } catch (e) { /* privat läge */ }

    if (push && window.history && history.replaceState) {
      var url = location.pathname + (lang === 'en' ? '?lang=en' : '') + location.hash;
      history.replaceState(null, '', url);
    }
  }

  function initial() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'sv' || q === 'en') return q;
    try {
      var saved = localStorage.getItem('arbixit-lang');
      if (saved === 'sv' || saved === 'en') return saved;
    } catch (e) { /* privat läge */ }
    return (navigator.language || '').toLowerCase().indexOf('sv') === 0 ? 'sv' : 'en';
  }

  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', function () {
      apply(this.getAttribute('data-lang'), true);
    });
  }

  apply(initial(), false);
})();
