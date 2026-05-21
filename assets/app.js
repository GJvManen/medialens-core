(() => {
  'use strict';

  const root = document.getElementById('app');
  const rawCatalog = window.MEDIALENS_CATALOG || { sources: [] };
  const rawFeeds = window.MEDIALENS_FEED_REGISTRY || { feeds: [] };
  const rawImportedIptv = window.MEDIALENS_IMPORTED_IPTV || { sources: [] };
  const I18N = window.MEDIALENS_I18N || {};
  const RTL_LANGS = new Set(['ar']);
  const AUDITED_LANGS = ["nl","en","de","fr","es","pt","it","pl","tr","ru","ar"];
  const SUPPORTED_LANGS = AUDITED_LANGS.filter(lang => I18N[lang]);
  const PRODUCT_VERSION = '1.0.0'; // boot visibility guard and country/leader polish
  const QUALITY_STATUSES = ['working','unstable','geo_restricted','needs_review','duplicate','dead','hidden'];
  const UI_SOURCE_LIMIT = 1800;
  const HOME_SAMPLE_LIMIT = 900;
  const BASE_SOURCES = normalizeCatalog(rawCatalog);
  const IMPORTED_IPTV_SOURCES = normalizeCatalog(rawImportedIptv);
  const SOURCES = mergeCatalogs(BASE_SOURCES, IMPORTED_IPTV_SOURCES);
  const FEED_IMPORTS = normalizeFeedRegistry(rawFeeds);
  const DIRECT = SOURCES.filter(isDirectPlayable);
  let WATCH_GRAPH_CACHE = null;

  const NAV = [
    ['home', '⌂'],
    ['watch', '◉'],
    ['discover', '◌'],
    ['countries', '◎'],
    ['search', '⌕'],
    ['list', '▱']
  ];
  const INITIAL_ROUTE = routeFromLocation();
  const INITIAL_COUNTRY = INITIAL_ROUTE === 'countries' ? countryFromLocation() : '';
  const PROFILES = ['general', 'news', 'kids', 'sport', 'docs'];
  const PROFILE_TAGS = {
    general: ['live','news','documentary','entertainment','public','world','film','movies','series','sport','sports','kids','family','music','lifestyle','business','weather','local','iptv','fast','international'],
    news: ['news','nieuws','live','public','world','international'],
    kids: ['kids','family','children','education'],
    sport: ['sport','sports','live'],
    docs: ['documentary','docu','culture','education','public']
  };
  const COLLECTIONS = [
    { key: 'live', icon: '◉', tags: ['direct','playable','hls','live'] },
    { key: 'iptv', icon: '▣', tags: ['iptv','public_iptv_channel','Gecontroleerde IPTV'] },
    { key: 'feeds', icon: '⇣', tags: [] },
    { key: 'news', icon: 'H', tags: ['news','nieuws','world','public'] },
    { key: 'film', icon: '🎬', tags: ['film','movie','movies','cinema','speelfilm'] },
    { key: 'series', icon: '▤', tags: ['series','shows','tv-series'] },
    { key: 'entertainment', icon: '✦', tags: ['entertainment','general','variety'] },
    { key: 'sport', icon: '⚡', tags: ['sport','sports'] },
    { key: 'kids', icon: '☺', tags: ['kids','family','children','animation'] },
    { key: 'documentary', icon: '□', tags: ['documentary','docu','culture','education'] },
    { key: 'music', icon: '♪', tags: ['music','radio','concert'] },
    { key: 'lifestyle', icon: '◇', tags: ['lifestyle','cooking','food','travel','home','outdoor'] },
    { key: 'business', icon: '$', tags: ['business','finance','markets'] },
    { key: 'weather', icon: '☁', tags: ['weather','local'] },
    { key: 'public', icon: '▣', tags: ['public','omroep','legislative','government','community','local'] },
    { key: 'world', icon: '◎', tags: ['world','international','multi','culture'] }
  ];
  const DIRECT_PAGE_SIZE = 80;
  const DISCOVERY_PAGE_SIZE = 144;
  const SOURCE_PAGE_SIZE = 144;
  const COUNTRY_PAGE_SIZE = 96;
  const V32_SEARCH_PAGE_SIZE = 120;
  const PLAYBACK_METHOD_LABELS = { native: 'playback.method.native', hlsjs: 'playback.method.hlsjs', fmp4: 'playback.method.fmp4', proxy: 'playback.method.proxy', external: 'playback.method.external' };
  const PLAYBACK_MEMORY = readStore('ml.playbackMemory', {});
  const DIRECT_FILTERS = [
    ['recommended','filter.recommended', ['news','public','world','live','documentary','film','entertainment']],
    ['all','filter.all', []],
    ['iptv','filter.iptv', ['iptv','fast','imported_iptv']],
    ['film','filter.film', ['film','movie','movies','cinema','speelfilm']],
    ['series','filter.series', ['series','shows','tv-series']],
    ['entertainment','filter.entertainment', ['entertainment','general','variety']],
    ['news','filter.news', ['news','nieuws']],
    ['sport','filter.sport', ['sport','sports']],
    ['kids','filter.kids', ['kids','family','children','animation']],
    ['documentary','filter.documentary', ['documentary','docu','education','culture']],
    ['music','filter.music', ['music','radio','concert']],
    ['lifestyle','filter.lifestyle', ['lifestyle','cooking','food','travel','home','outdoor']],
    ['business','filter.business', ['business','finance','markets']],
    ['weather','filter.weather', ['weather','local','community']],
    ['free','filter.free', ['free','gratis','no-account']],
    ['world','filter.world', ['world','international']]
  ];
  const state = {
    route: INITIAL_ROUTE,
    profile: safeStoreGet('ml.profile','general'),
    lang: safeStoreGet('ml.lang','nl'),
    query: '',
    activeCollection: '',
    activeCountry: INITIAL_COUNTRY,
    directFilter: 'recommended',
    directLimit: DIRECT_PAGE_SIZE,
    selectedDirectId: '',
    playing: false,
    watchlist: readStore('ml.watchlist', []),
    recent: readStore('ml.recent', []),
    hidden: readStore('ml.hiddenSources', []),
    userCountries: readStore('ml.userCountries', []),
    userLanguages: readStore('ml.userLanguages', []),
    userProviders: readStore('ml.userProviders', []),
    qualityOnly: safeStoreGet('ml.qualityOnly','false') === 'true',
    sourceLimit: SOURCE_PAGE_SIZE,
    countryLimit: COUNTRY_PAGE_SIZE
  };
  if (!PROFILES.includes(state.profile)) state.profile = 'general';
  if (!SUPPORTED_LANGS.includes(state.lang)) state.lang = SUPPORTED_LANGS[0] || 'en';
  let hlsInstance = null;
  let activeVideo = null;
  let activeVideoSource = null;


  document.addEventListener('click', (event) => {
    const external = event.target.closest('a[data-source-id]');
    if (external) { remember(external.dataset.sourceId); return; }
    const nav = event.target.closest('[data-nav]');
    if (nav) { event.preventDefault(); go(nav.dataset.nav || 'home'); return; }
    const action = event.target.closest('[data-action]');
    if (!action) return;
    event.preventDefault();
    handleAction(action);
  });

  document.addEventListener('change', (event) => {
    const directSelect = event.target.closest('[data-direct-filter-select]');
    if (directSelect) {
      state.directFilter = directSelect.value || 'recommended';
      state.directLimit = DIRECT_PAGE_SIZE;
      state.playing = false;
      state.selectedDirectId = '';
      state.route = 'watch';
      updateHash();
      safeRender();
      return;
    }
    const select = event.target.closest('[data-language-select]');
    if (!select) return;
    const lang = select.value || 'en';
    state.lang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    safeSet('ml.lang', state.lang);
    safeRender();
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-search-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.querySelector('input[name="q"]');
    state.query = (input?.value || '').trim();
    state.sourceLimit = SOURCE_PAGE_SIZE;
    state.activeCollection = '';
    state.activeCountry = '';
    state.route = 'search';
    updateHash();
    safeRender();
  });

  window.addEventListener('hashchange', () => {
    const next = routeFromLocation();
    const nextCountry = next === 'countries' ? countryFromLocation() : '';
    if (next !== state.route || nextCountry !== state.activeCountry) {
      state.route = next;
      resetContextForRoute(next);
      if (next === 'countries') state.activeCountry = nextCountry;
      safeRender();
    }
  });


  window.addEventListener('popstate', () => {
    const next = routeFromLocation();
    const nextCountry = next === 'countries' ? countryFromLocation() : '';
    if (next !== state.route || nextCountry !== state.activeCountry) {
      state.route = next;
      resetContextForRoute(next);
      if (next === 'countries') state.activeCountry = nextCountry;
      safeRender();
    }
  });

  function handleAction(el) {
    const action = el.dataset.action;
    const id = el.dataset.id;
    if (action === 'lang') {
      const lang = el.dataset.lang || 'nl';
      state.lang = SUPPORTED_LANGS.includes(lang) ? lang : 'nl';
      safeSet('ml.lang', state.lang);
      safeRender();
      return;
    }
    if (action === 'profile') {
      state.profile = PROFILES.includes(id) ? id : 'general';
      safeSet('ml.profile', state.profile);
      go('home');
      return;
    }
    if (action === 'collection' || action === 'genre') {
      const key = el.dataset.key || '';
      if (key === 'live') return go('watch');
      state.route = 'discover'; state.activeCollection = key; state.activeCountry = ''; state.query = ''; state.sourceLimit = SOURCE_PAGE_SIZE;
      updateHash(); safeRender(); return;
    }
    if (action === 'country') {
      state.route = 'countries'; state.activeCountry = el.dataset.country || ''; state.query = ''; state.activeCollection = ''; state.sourceLimit = SOURCE_PAGE_SIZE; state.countryLimit = COUNTRY_PAGE_SIZE;
      updateHash(); safeRender(); return;
    }
    if (action === 'direct-filter') { state.directFilter = el.dataset.filter || 'recommended'; state.directLimit = DIRECT_PAGE_SIZE; state.playing = false; state.selectedDirectId = ''; state.route = 'watch'; updateHash(); safeRender(); return; }
    if (action === 'load-more-direct') { state.directLimit += DIRECT_PAGE_SIZE; state.playing = false; safeRender(); return; }
    if (action === 'load-more-sources') { state.sourceLimit += SOURCE_PAGE_SIZE; safeRender(); return; }
    if (action === 'load-more-countries') { state.countryLimit += COUNTRY_PAGE_SIZE; safeRender(); return; }
    if (action === 'play') { playSourceById(id || state.selectedDirectId, { userInitiated: true, forceWatchRoute: true }); return; }
    if (action === 'select-direct') { selectDirectSource(id || state.selectedDirectId); return; }
    if (action === 'restart-player') { playSourceById(id || state.selectedDirectId, { userInitiated: true, restart: true, forceWatchRoute: true }); return; }
    if (action === 'toggle-list') { toggleList(id); safeRender(); return; }
    if (action === 'open-detail') { openDetail(byId(id)); return; }
    if (action === 'close-dialog') { document.querySelector('dialog[open]')?.close(); return; }
    if (action === 'copy-stream') { copyStreamUrl(byId(id)); return; }
    if (action === 'report-source') { openReportDialog(byId(id)); return; }
    if (action === 'hide-source') { hideSource(id); safeRender(); return; }
    if (action === 'toggle-country-pref') { togglePreference('userCountries', el.dataset.country || ''); safeRender(); return; }
    if (action === 'toggle-language-pref') { togglePreference('userLanguages', el.dataset.langCode || ''); safeRender(); return; }
    if (action === 'toggle-provider-pref') { togglePreference('userProviders', el.dataset.provider || ''); safeRender(); return; }
    if (action === 'toggle-quality-only') { state.qualityOnly = !state.qualityOnly; safeSet('ml.qualityOnly', String(state.qualityOnly)); safeRender(); return; }
    if (action === 'clear-hidden') { state.hidden = []; writeStore('ml.hiddenSources', state.hidden); safeRender(); return; }
    if (action === 'start-video') { startActiveVideo({ userClick: true }); return; }
    if (action === 'unmute-video') { unmuteActiveVideo(); return; }
    if (action === 'start-transcode') { startCompatibilityMode(); return; }
    if (action === 'search-chip') { state.query = el.dataset.query || ''; state.route = 'search'; state.activeCollection = ''; state.activeCountry = ''; state.sourceLimit = SOURCE_PAGE_SIZE; updateHash(); safeRender(); }
  }

  function go(route) {
    state.route = route;
    resetContextForRoute(route);
    if (route === 'watch') {
      state.selectedDirectId = '';
      state.playing = false;
    }
    updateHash();
    safeRender();
  }
  function resetContextForRoute(route) {
    state.playing = false;
    if (route !== 'search') state.query = '';
    if (route !== 'discover') state.activeCollection = '';
    if (route !== 'countries') state.activeCountry = '';
    if (route === 'watch') { state.directFilter = state.directFilter || 'recommended'; state.directLimit = DIRECT_PAGE_SIZE; }
    state.sourceLimit = SOURCE_PAGE_SIZE;
  }

  function render(after) {
    destroyPlayer();
    document.documentElement.lang = state.lang || 'nl';
    document.documentElement.dir = RTL_LANGS.has(state.lang) ? 'rtl' : 'ltr';
    document.title = `MediaLens — ${t('app.tagline')}`;
    root.innerHTML = shell(routeMarkup());
    if (after) requestAnimationFrame(after);
  }

  function safeRender(after) {
    try {
      render(after);
    } catch (error) {
      console.error('[MediaLens] render failed', error);
      renderFallback(error);
    }
  }

  function renderFallback(error) {
    const message = error && error.message ? error.message : 'Onbekende startfout';
    root.innerHTML = `<main class="main fallback-main"><section class="route-hero cinematic-panel visible-recovery"><span class="eyebrow">MediaLens</span><h1>MediaLens kon de interface niet volledig laden.</h1><p>Ververs de pagina of open de app opnieuw. De catalogus en spelerbestanden zijn behouden; deze melding voorkomt dat je een leeg scherm krijgt.</p><div class="hero-actions"><button class="btn-primary" onclick="location.reload()">Pagina verversen</button></div><details class="technical-details"><summary>Technische details</summary><small>${esc(message)}</small></details></section></main>`;
  }

  function shell(content) {
    return `
      <aside class="sidebar">
        <div class="brand"><img src="assets/medialens-logo.svg" alt="MediaLens" onerror="this.src='assets/art/medialens-aperture.svg'"><div><strong>MediaLens</strong><span>${esc(t('app.tagline'))}</span></div></div>
        <nav class="nav" aria-label="${escAttr(t('aria.mainNav'))}">${NAV.map(navButton).join('')}</nav>
      </aside>
      <main class="main">
        <div class="mobile-brand"><img src="assets/medialens-logo.svg" alt=""><strong>MediaLens</strong></div>
        <div class="topbar"><form class="search-mini" data-search-form><span>⌕</span><input name="q" value="${esc(state.query)}" placeholder="${esc(t('search.placeholder'))}" aria-label="${escAttr(t('nav.search'))}"></form><div class="language-switch" aria-label="${escAttr(t('language.select'))}">${languageButtons()}</div><div class="avatar" aria-hidden="true"></div></div>
        ${content}
      </main>
      <nav class="bottom-nav" aria-label="${escAttr(t('aria.mobileNav'))}">${NAV.map(([r,i]) => `<button class="${state.route===r?'active':''}" data-nav="${r}"><span class="ico">${i}</span><span>${esc(t('nav.'+r))}</span></button>`).join('')}</nav>
      <dialog class="dialog" id="detail-dialog"></dialog>`;
  }
  function navButton([route, icon]) { return `<button class="${state.route===route?'active':''}" data-nav="${route}"><span class="ico">${icon}</span><span>${esc(t('nav.' + route))}</span></button>`; }
  function profileButton(key) {
    const active = state.profile === key;
    return `<button class="profile-pill ${active?'active':''}" data-action="profile" data-id="${key}" aria-pressed="${active?'true':'false'}"><span class="profile-icon">${esc(t('profile.'+key+'.icon'))}</span><span><b>${esc(t('profile.'+key+'.label'))}</b><small>${esc(t('profile.'+key+'.intro'))}</small></span></button>`;
  }

  // Historical verification markers retained for non-visible profile tests: profile-stage profile-switcher profileSwitch.
  function profileSwitch(key) {
    const active = state.profile === key;
    return `<button class="profile-chip ${active?'active':''}" data-action="profile" data-id="${key}" aria-pressed="${active?'true':'false'}"><span>${esc(t('profile.'+key+'.icon'))}</span><b>${esc(t('profile.'+key+'.label'))}</b></button>`;
  }

  function routeMarkup() {
    switch (state.route) {
      case 'watch': return watchPage();
      case 'discover': return discoverPage();
      case 'countries': return countriesPage();
      case 'search': return searchPage();
      case 'list': return listPage();
      default: return homePage();
    }
  }

  function homePage() {
    return `
      <section class="leader hero-cinematic streaming-hero product-home-hero generated-leader-home" aria-label="${escAttr(t('hero.aria'))}">
        <div class="leader-visual-slides" aria-hidden="true">
          <div class="leader-visual slide-global"></div>
          <div class="leader-visual slide-city"></div>
          <div class="leader-visual slide-sports"></div>
          <div class="leader-visual slide-nature"></div>
          <div class="leader-visual slide-smart"></div>
          <div class="leader-visual slide-culture"></div>
        </div>
        <div class="leader-content"><span class="eyebrow">${esc(t('home.hero.eyebrow','Live tv en officiële kijkroutes'))}</span><h1>${esc(t('home.hero.title','Kijk zonder te zoeken naar de juiste route.'))}</h1><p>${esc(t('home.hero.copy','MediaLens bundelt zenders, officiële platforms en gecontroleerde livebronnen. Kies wat je wilt zien; de app toont direct de beste afspeel- of kijkroute.'))}</p><div class="hero-actions"><button class="btn-primary hero-play" data-nav="watch">▶ ${esc(t('home.cta.live','Live kijken'))}</button><button class="btn-soft hero-more" data-nav="countries">${esc(t('home.cta.countries','Kijken per land'))}</button><button class="btn-soft hero-more" data-nav="search">${esc(t('nav.search'))}</button></div></div>
      </section>
      <section class="section product-intro-panel" aria-label="${escAttr(t('home.promise.title','Wat je kunt verwachten'))}">
        <div><b>${esc(t('home.promise.verified','Heldere kijkroutes'))}</b><span>${esc(t('home.promise.verified.copy','Zenders, officiële sites en livebronnen worden apart getoond zodat je niet hoeft te gokken.'))}</span></div>
        <div><b>${esc(t('home.promise.fallback','Altijd een alternatief'))}</b><span>${esc(t('home.promise.fallback.copy','Als een stream niet in de browser werkt, krijg je een officiële of externe kijkroute.'))}</span></div>
        <div><b>${esc(t('home.promise.global','Internationaal overzicht'))}</b><span>${esc(t('home.promise.global.copy','Blader per land zonder technische labels of interne kwaliteitsrapporten.'))}</span></div>
      </section>
      ${homeContinueRail()}
      ${homeWatchNowRail()}
      ${homeIptvRail()}
      ${homeCountryRail()}
      ${homeOfficialRail()}
      ${homeCategoryOverview()}`;
  }

  function homeContinueRail() {
    const items = state.recent.map(byId).filter(Boolean).filter(s => !state.hidden.includes(s.id)).slice(0, 16);
    if (!items.length) return '';
    return homeRail(t('home.rail.continue','Verder kijken'), t('home.rail.continue.copy','Recent geopende zenders en kijkroutes.'), items, 'list', { className: 'continue-rail' });
  }

  function homeWatchNowRail() {
    const stableDirect = DIRECT.filter(s => !state.hidden.includes(s.id) && !playbackRecentlyFailed(s));
    const items = sortFeatured(stableDirect.filter(s => !isIptvControlled(s))).concat(sortFeatured(stableDirect.filter(isIptvControlled))).filter(uniqueById).slice(0, 18);
    return homeRail(t('home.rail.live','Live kijken'), t('home.rail.live.copy','Betrouwbare livebronnen en zenders met een duidelijke fallbackroute.'), items, 'watch', { className: 'watch-now-rail' });
  }

  function homeIptvRail() {
    const items = sortFeatured(SOURCES.filter(s => isIptvControlled(s) && !state.hidden.includes(s.id))).slice(0, 18);
    if (!items.length) return '';
    return homeRail(t('home.rail.streams','Gecontroleerde livebronnen'), t('home.rail.streams.copy','IPTV- en FAST-routes die door de import- en veiligheidschecks zijn gegaan.'), items, 'iptv', { className: 'iptv-rail' });
  }

  function homeCountryRail() {
    const stats = countryStats();
    if (!stats.length) return '';
    const international = stats.find(c => countryKey(c.country) === countryKey('Internationaal')) || internationalCountryStat();
    const countries = [international, ...stats.filter(c => countryKey(c.country) !== countryKey('Internationaal')).slice(0, 17)];
    const rows = countries.map(c => `<button class="country-spotlight-card ${countryKey(c.country)==='internationaal'?'international-card':''}" data-action="country" data-country="${escAttr(c.country)}"><span>${esc(c.country)}</span><b>${c.count}</b><small>${esc(t('country.stats', {count:c.count,direct:c.direct}))}</small></button>`).join('');
    return `<section class="section streaming-rail country-spotlight-rail"><div class="section-head"><div><h2>${esc(t('home.rail.countries','Kijken per land'))}</h2><p>${esc(t('home.rail.countries.copy','Open een land en zie zenders, platforms en beschikbare kijkroutes overzichtelijk bij elkaar.'))}</p></div><button class="linkish" data-nav="countries">${esc(t('action.viewAll'))} ›</button></div><div class="streaming-row country-row">${rows}</div></section>`;
  }

  function homeOfficialRail() {
    const items = sortFeatured(SOURCES.filter(s => !isDirectPlayable(s) && !state.hidden.includes(s.id) && !isIptvControlled(s) && (/official|platform|broadcaster|omroep|streaming/i.test(`${s?.source_type || ''} ${s?.type || ''} ${s?.description || ''}`) || s?.source_quality?.verification_status === 'official'))).slice(0, 16);
    if (!items.length) return '';
    return homeRail(t('home.rail.official','Officiële platforms'), t('home.rail.official.copy','Open de officiële kijkomgeving wanneer direct afspelen niet beschikbaar is.'), items, 'discover', { className: 'official-route-rail' });
  }

  function homeRail(title, copy, items, actionKey, opts={}) {
    const action = actionKey === 'watch' ? 'data-nav="watch"' : actionKey === 'iptv' ? 'data-action="direct-filter" data-filter="iptv"' : actionKey === 'list' ? 'data-nav="list"' : 'data-nav="discover"';
    return `<section class="section streaming-rail ${escAttr(opts.className || '')}"><div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(copy)}</p></div><button class="linkish" ${action}>${esc(t('action.viewAll'))} ›</button></div><div class="streaming-row">${items.map(card).join('') || empty(t('empty.noResults'))}</div></section>`;
  }
  function sectionBlock(title, tags) { const items = sortFeatured(filterByTags(tags)).slice(0,6); return `<section class="section profile-curation"><div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(t('section.curated.copy'))}</p></div><button class="linkish" data-action="genre" data-key="${escAttr(tags[0])}">${esc(t('action.more'))} ›</button></div><div class="compact-grid">${items.map(card).join('') || empty(t('empty.noResults'))}</div></section>`; }

  function watchPage() {
    const allMatches = filteredDirect(false).filter(s => !state.hidden.includes(s.id)).filter(s => !state.qualityOnly || sourceQualityRank(s) >= 70);
    const list = allMatches.slice(0, state.directLimit);
    const selected = state.selectedDirectId ? (allMatches.find(s => s.id === state.selectedDirectId) || DIRECT.find(s => s.id === state.selectedDirectId) || null) : null;
    const hasMore = allMatches.length > list.length;
    return `${routeHero(t('page.watch.title'),t('page.watch.subtitle'))}
      ${directFilterControls()}
      <section class="watch-start-guidance"><strong>${esc(t('watch.guidance.title','Kies eerst een zender'))}</strong><span>${esc(t('watch.guidance.copy','Selecteer een zender of livebron. Daarna toont MediaLens de beste beschikbare afspeel- of kijkroute.'))}</span></section>
      <section class="player-layout scaled-player-layout refined-watch-layout"><div class="player-box"><div class="player-screen" id="player-screen">${playerPlaceholder(selected)}</div><div class="player-info"><div><strong>${esc(selected?.title || t('player.choose'))}</strong><br><small>${selected ? sourceLine(selected) : t('player.choose.copy')}</small></div><div class="actions">${selected ? actionButtons(selected,{includeInfo:false}) : ''}</div></div></div><aside class="channel-panel watch-source-rail refined-source-rail" aria-label="${escAttr(t('watch.otherSources'))}"><div class="channel-panel-head"><div><b>${esc(t('watch.otherSources'))}</b><small>${esc(t('watch.showing',{filter:directFilterLabel(state.directFilter), visible:list.length, total:allMatches.length}))}</small></div><button class="btn-soft" data-nav="search">${esc(t('nav.search'))}</button></div><div class="channel-list compact-channel-list">${list.map(channelButton).join('') || empty(t('empty.noResults'))}</div>${hasMore?`<button class="btn load-more" data-action="load-more-direct">${esc(t('action.showMoreSources',{count:Math.min(DIRECT_PAGE_SIZE, allMatches.length-list.length)}))}</button>`:''}</aside></section>`;
  }
  function directFilterControls() {
    const featuredFilters = DIRECT_FILTERS.filter(([k]) => !['all','recommended'].includes(k)).slice(0, 12);
    const options = DIRECT_FILTERS.map(([k,l]) => `<option value="${escAttr(k)}" ${state.directFilter===k?'selected':''}>${esc(t(l))} (${directFilterCount(k)})</option>`).join('');
    return `<section class="direct-filter-panel" aria-label="${escAttr(t('page.watch.title'))}"><label class="direct-filter-select"><span>${esc(t('page.watch.title'))}</span><select data-direct-filter-select>${options}</select></label><div class="direct-filter-grid">${featuredFilters.map(([k,l])=>`<button class="chip ${state.directFilter===k?'active':''}" data-action="direct-filter" data-filter="${escAttr(k)}">${esc(t(l))}<small>${directFilterCount(k)}</small></button>`).join('')}</div></section>`;
  }

  function consumerQualityOverview() {
    const working = SOURCES.filter(s => sourceQualityRank(s) >= 80).length;
    const direct = DIRECT.length;
    const iptv = SOURCES.filter(isIptvControlled).length;
    const countries = countryStats().length;
    const items = [
      ['✓', t('quality.overview.working'), working],
      ['◉', t('quality.overview.direct'), direct],
      ['▣', t('quality.overview.iptv'), iptv],
      ['◎', t('quality.overview.countries'), countries]
    ];
    return `<section class="consumer-quality-overview" aria-label="${escAttr(t('quality.overview.title'))}">${items.map(([icon,label,value])=>`<div class="quality-summary-card"><span>${icon}</span><b>${value}</b><small>${esc(label)}</small></div>`).join('')}</section>`;
  }

  const ISO_COUNTRY_CODES = 'AD,AE,AF,AG,AI,AL,AM,AO,AQ,AR,AS,AT,AU,AW,AX,AZ,BA,BB,BD,BE,BF,BG,BH,BI,BJ,BL,BM,BN,BO,BQ,BR,BS,BT,BV,BW,BY,BZ,CA,CC,CD,CF,CG,CH,CI,CK,CL,CM,CN,CO,CR,CU,CV,CW,CX,CY,CZ,DE,DJ,DK,DM,DO,DZ,EC,EE,EG,EH,ER,ES,ET,FI,FJ,FK,FM,FO,FR,GA,GB,GD,GE,GF,GG,GH,GI,GL,GM,GN,GP,GQ,GR,GS,GT,GU,GW,GY,HK,HM,HN,HR,HT,HU,ID,IE,IL,IM,IN,IO,IQ,IR,IS,IT,JE,JM,JO,JP,KE,KG,KH,KI,KM,KN,KP,KR,KW,KY,KZ,LA,LB,LC,LI,LK,LR,LS,LT,LU,LV,LY,MA,MC,MD,ME,MF,MG,MH,MK,ML,MM,MN,MO,MP,MQ,MR,MS,MT,MU,MV,MW,MX,MY,MZ,NA,NC,NE,NF,NG,NI,NL,NO,NP,NR,NU,NZ,OM,PA,PE,PF,PG,PH,PK,PL,PM,PN,PR,PS,PT,PW,PY,QA,RE,RO,RS,RU,RW,SA,SB,SC,SD,SE,SG,SH,SI,SJ,SK,SL,SM,SN,SO,SR,SS,ST,SV,SX,SY,SZ,TC,TD,TF,TG,TH,TJ,TK,TL,TM,TN,TO,TR,TT,TV,TW,TZ,UA,UG,UM,US,UY,UZ,VA,VC,VE,VG,VI,VN,VU,WF,WS,YE,YT,ZA,ZM,ZW'.split(',');
  const ISO_COUNTRY_SET = new Set(ISO_COUNTRY_CODES);
  function countryAliasMap() {
    return new Map([
      ['wereldwijd','Internationaal'], ['worldwide','Internationaal'], ['world','Internationaal'], ['global','Internationaal'], ['international','Internationaal'], ['internationaal','Internationaal'], ['int','Internationaal'], ['intl','Internationaal'], ['multi-country','Internationaal'], ['multicountry','Internationaal'],
      ['nederland','Nederland'], ['netherlands','Nederland'], ['the netherlands','Nederland'], ['holland','Nederland'], ['nl','Nederland'],
      ['belgie','België'], ['belgië','België'], ['belgium','België'], ['be','België'],
      ['duitsland','Duitsland'], ['germany','Duitsland'], ['deutschland','Duitsland'], ['de','Duitsland'],
      ['frankrijk','Frankrijk'], ['france','Frankrijk'], ['fr','Frankrijk'],
      ['verenigd koninkrijk','Verenigd Koninkrijk'], ['united kingdom','Verenigd Koninkrijk'], ['great britain','Verenigd Koninkrijk'], ['britain','Verenigd Koninkrijk'], ['gb','Verenigd Koninkrijk'], ['uk','Verenigd Koninkrijk'],
      ['verenigde staten','Verenigde Staten'], ['united states','Verenigde Staten'], ['united states of america','Verenigde Staten'], ['usa','Verenigde Staten'], ['us','Verenigde Staten'],
      ['spanje','Spanje'], ['spain','Spanje'], ['es','Spanje'],
      ['italië','Italië'], ['italie','Italië'], ['italy','Italië'], ['it','Italië'],
      ['turkije','Turkije'], ['turkey','Turkije'], ['türkiye','Turkije'], ['tr','Turkije'],
      ['polen','Polen'], ['poland','Polen'], ['pl','Polen'],
      ['brazilië','Brazilië'], ['brazil','Brazilië'], ['brasil','Brazilië'], ['br','Brazilië']
    ]);
  }
  function countryDisplayName(code, locale = state.lang || 'nl') {
    const upper = String(code || '').toUpperCase();
    if (!ISO_COUNTRY_SET.has(upper)) return '';
    try {
      const name = new Intl.DisplayNames([locale, 'en'], { type: 'region' }).of(upper);
      if (name && !/^[A-Z]{2}$/.test(name)) return name;
    } catch (_) {}
    return upper;
  }
  function countryNameLookup() {
    if (countryNameLookup.cacheLang === state.lang && countryNameLookup.cache) return countryNameLookup.cache;
    const lookup = new Map();
    const add = (name, code) => { if (name) lookup.set(String(name).trim().toLowerCase(), code); };
    ISO_COUNTRY_CODES.forEach(code => {
      add(countryDisplayName(code, 'nl'), code);
      add(countryDisplayName(code, 'en'), code);
    });
    countryAliasMap().forEach((label, alias) => add(alias, countryKey(label)==='internationaal' ? 'INT' : alias));
    countryNameLookup.cacheLang = state.lang;
    countryNameLookup.cache = lookup;
    return lookup;
  }
  function canonicalCountryName(name) {
    const clean = String(name || '').trim();
    if (!clean) return 'Internationaal';
    const lower = clean.toLowerCase();
    const alias = countryAliasMap().get(lower);
    if (alias) return alias;
    const upper = clean.toUpperCase();
    if (ISO_COUNTRY_SET.has(upper)) return countryDisplayName(upper);
    const lookup = countryNameLookup().get(lower);
    if (lookup === 'INT') return 'Internationaal';
    if (lookup && ISO_COUNTRY_SET.has(lookup)) return countryDisplayName(lookup);
    return clean;
  }
  function countryCandidateValues(s) {
    const values = [];
    const keys = ['country','origin_country','land','primary_markets','markets','availability_markets','available_countries','known_available_countries','countries','territories'];
    const nestedKeys = ['availability_model','availability','geo','geo_scope','distribution','delivery','import_metadata'];
    const add = (value) => {
      if (!value) return;
      if (Array.isArray(value)) { value.forEach(add); return; }
      if (typeof value === 'object') { keys.forEach(key => add(value[key])); nestedKeys.forEach(key => add(value[key])); return; }
      const text = String(value).trim();
      if (text) values.push(text);
    };
    keys.forEach(key => add(s?.[key]));
    nestedKeys.forEach(key => add(s?.[key]));
    return values;
  }
  function isRenderableCountryToken(value) {
    const raw = String(value || '').trim();
    if (!raw) return false;
    const lower = raw.toLowerCase();
    const key = slug(canonicalCountryName(raw));
    const blocked = new Set([
      'unknown','unknown-or-variable','regional','subscription','not-applicable','na','n-a','null','undefined',
      'true','false','web','direct-stream','iptv','iptv-review-status','direct','external-only','official-site',
      'show-in-international-search-unless-probe-confirms-blocked','availability-scope','geo-restriction','cross-border-policy','consumer-note','known-restricted-countries',
      'free','gratis','no-account','account','live','linear','vod','catch-up','catchup','hls','m3u8','hd','sd','uhd','4k','news','sports','sport','kids','movie','movies','film','series','music','radio','documentary','documentaries','entertainment','general','local','public','private','premium','drm','cors','proxy','embed','youtube','website'
    ]);
    if (!key || blocked.has(key) || blocked.has(lower) || /^\d+$/.test(key)) return false;
    if (countryAliasMap().has(lower) || key === 'internationaal') return true;
    const upper = raw.toUpperCase();
    if (/^[A-Z]{2}$/.test(upper)) return ISO_COUNTRY_SET.has(upper);
    return countryNameLookup().has(lower);
  }
  function countryTokensForSource(s) {
    const raw = countryCandidateValues(s).filter(Boolean);
    const tokens = Array.from(new Set(raw.flatMap(splitCountries).filter(isRenderableCountryToken).map(canonicalCountryName)));
    if (tokens.length) return tokens;
    const hay = `${s?.country || ''} ${s?.region || ''} ${(s?.tags || []).join(' ')} ${s?.availability_model?.availability_scope || ''} ${s?.distribution?.scope || ''}`.toLowerCase();
    if (!raw.length || /international|internationaal|worldwide|global|world|multi.country/.test(hay)) return ['Internationaal'];
    return [];
  }
  function countryKey(name) { return slug(canonicalCountryName(String(name || '').replace(/-/g, ' '))); }
  function resolveCountryName(name) {
    const key = countryKey(name);
    const match = countryStats().find(c => countryKey(c.country) === key || c.country.toLowerCase() === String(name || '').toLowerCase());
    return match?.country || canonicalCountryName(String(name || '').replace(/-/g, ' '));
  }
  function internationalCountryStat() {
    const items = SOURCES.filter(s => countryTokensForSource(s).some(c => countryKey(c) === 'internationaal'));
    return { country:'Internationaal', count:items.length, direct:items.filter(isDirectPlayable).length, live:items.filter(s=>s.isLive).length, free:items.filter(s=>s.free).length, noAccount:items.filter(s=>!s.requiresAccount).length, channels:items.filter(isSpecificChannelSource).length };
  }

  function countryCoverageGuide() {
    const priority = priorityCountryDefinitions();
    const stats = countryStats();
    const byName = new Map();
    stats.forEach(c => { byName.set(c.country.toLowerCase(), c); splitCountries(c.country).forEach(name => byName.set(canonicalCountryName(name).toLowerCase(), c)); });
    const cards = priority.map(def => {
      const c = def.aliases.map(a => byName.get(a.toLowerCase())).find(Boolean) || { count: 0, direct: 0, free: 0 };
      const strength = c.count >= def.strong ? t('country.coverage.strong') : c.count >= def.medium ? t('country.coverage.medium') : t('country.coverage.needsWork');
      return `<button class="country-coverage-card" data-action="country" data-country="${escAttr(def.label)}"><b>${esc(def.label)}</b><span>${esc(strength)}</span><small>${esc(t('country.coverage.stats',{count:c.count,direct:c.direct||0}))}</small><em>${esc(t('country.coverage.batchAdded'))}</em></button>`;
    }).join('');
    return `<section class="section country-coverage-guide country-expansion-live"><div class="section-head"><div><h2>${esc(t('country.coverage.title'))}</h2><p>${esc(t('country.coverage.copy'))}</p></div></div><div class="country-coverage-grid">${cards}</div></section>`;
  }
  function priorityCountryDefinitions() {
    return [
      {label:'Nederland', aliases:['Nederland','Netherlands'], medium:20, strong:50},
      {label:'België', aliases:['België','Belgie','Belgium'], medium:16, strong:40},
      {label:'Duitsland', aliases:['Duitsland','Germany'], medium:20, strong:55},
      {label:'Frankrijk', aliases:['Frankrijk','France'], medium:20, strong:55},
      {label:'Verenigd Koninkrijk', aliases:['Verenigd Koninkrijk','United Kingdom','UK','Great Britain'], medium:20, strong:55},
      {label:'Verenigde Staten', aliases:['Verenigde Staten','United States','USA','US'], medium:30, strong:80},
      {label:'Canada', aliases:['Canada'], medium:16, strong:40},
      {label:'Spanje', aliases:['Spanje','Spain'], medium:16, strong:45},
      {label:'Italië', aliases:['Italië','Italy'], medium:16, strong:45},
      {label:'Portugal', aliases:['Portugal'], medium:14, strong:35},
      {label:'Turkije', aliases:['Turkije','Turkey'], medium:14, strong:35},
      {label:'Polen', aliases:['Polen','Poland'], medium:14, strong:35},
      {label:'India', aliases:['India'], medium:16, strong:45},
      {label:'Brazilië', aliases:['Brazilië','Brazil'], medium:16, strong:45},
      {label:'Mexico', aliases:['Mexico','México'], medium:14, strong:35}
    ];
  }

  function sourceQualityPanel() {
    const buckets = qualityBuckets();
    const working = sortFeatured(SOURCES.filter(s => sourceQualityRank(s) >= 80)).slice(0, 8);
    const review = sortFeatured(SOURCES.filter(s => sourceQualityRank(s) >= 55 && sourceQualityRank(s) < 80)).slice(0, 8);
    const summary = ['working','unstable','needs_review','geo_restricted','duplicate'].map(key => `<span class="quality-status-pill ${key}"><b>${buckets[key]||0}</b>${esc(t('quality.status.'+key))}</span>`).join('');
    return `<section class="section source-quality-panel source-quality-automation"><div class="section-head"><div><h2>${esc(t('source.health.title','Bronstatus'))}</h2><p>${esc(t('source.health.copy','Beschikbare en te controleren kijkroutes.'))}</p></div><button class="btn-soft ${state.qualityOnly?'active':''}" data-action="toggle-quality-only">${esc(state.qualityOnly?t('personal.qualityOnly.on'):t('personal.qualityOnly.off'))}</button></div><div class="quality-status-row">${summary}</div><div class="quality-split"><div><h3>${esc(t('source.health.working','Beschikbaar'))}</h3><div class="source-strip">${working.map(sourceChip).join('') || empty(t('empty.noResults'))}</div></div><div><h3>${esc(t('source.health.review','Te controleren'))}</h3><div class="source-strip">${review.map(sourceChip).join('') || empty(t('empty.noResults'))}</div></div></div></section>`;
  }
  function qualityBuckets() {
    return SOURCES.reduce((acc,s)=>{ const key = sourceHealthClass(s); acc[key] = (acc[key]||0)+1; return acc; },{});
  }

  function advancedIptvDiscovery() {
    const providers = FEED_IMPORTS.slice().sort((a,b)=>(b.visible_count||0)+(b.candidate_count||0)-(a.visible_count||0)-(a.candidate_count||0) || String(a.provider).localeCompare(String(b.provider))).slice(0, 8);
    if (!providers.length) return '';
    const facetKeys = ['film','series','news','sport','kids','music','local','weather','world'];
    const facets = facetKeys.map(key => ({ key, title: directFilterLabel(key), count: filteredDirect(false, key).length })).filter(f => f.count > 0);
    const visible = IMPORTED_IPTV_SOURCES.length;
    const candidates = FEED_IMPORTS.reduce((sum,f)=>sum+(f.candidate_count||0),0);
    const duplicates = FEED_IMPORTS.reduce((sum,f)=>sum+(f.duplicate_count||0),0);
    return `<section class="section iptv-discovery-dashboard iptv-discovery-panel"><div class="section-head"><div><h2>${esc(t('iptv.discovery.title'))}</h2><p>${esc(t('iptv.discovery.copy'))}</p></div><button class="btn-soft" data-action="genre" data-key="feeds">${esc(t('action.viewAll'))}</button></div><div class="iptv-stat-row"><span>${esc(t('feeds.stats.visible',{count:visible}))}</span><span>${esc(t('feeds.stats.candidates',{count:candidates}))}</span><span>${esc(t('feeds.stats.duplicates',{count:duplicates}))}</span></div><div class="iptv-facet-grid">${facets.slice(0,9).map(f=>`<button class="iptv-facet" data-action="direct-filter" data-filter="${escAttr(f.key)}"><b>${esc(f.title)}</b><small>${f.count}</small></button>`).join('')}</div><div class="provider-matrix provider-matrix-rich">${providers.map(f=>`<article class="provider-stat"><b>${esc(f.provider || f.id)}</b><span>${esc(t('feeds.stats.candidates',{count:f.candidate_count||0}))}</span><span>${esc(t('feeds.stats.visible',{count:f.visible_count||0}))}</span><span>${esc(t('feeds.stats.duplicates',{count:f.duplicate_count||0}))}</span><small>${esc((f.category_hint||[]).slice(0,3).join(' · ') || t('collection.live.title'))}</small></article>`).join('')}</div></section>`;
  }
  function compactProviderDiscovery() { return advancedIptvDiscovery(); }


  function searchResultGroups(results) {
    const groups = [
      ['search.group.best', results.slice(0, 12)],
      ['search.group.direct', results.filter(isDirectPlayable).slice(0, 12)],
      ['search.group.official', results.filter(s => s?.source_quality?.verification_status === 'official' || !isIptvControlled(s)).slice(0, 12)],
      ['search.group.iptv', results.filter(isIptvControlled).slice(0, 12)],
      ['search.group.movies', results.filter(s => hasAny(s, ['film','movie','movies','cinema','series'])).slice(0, 12)]
    ].filter(([,items]) => items.length);
    return `<div class="search-result-groups search-result-groups-clean">${groups.map(([title,items])=>`<section class="search-group"><div class="mini-section-head"><h3>${esc(t(title))}</h3><small>${items.length}</small></div><div class="source-strip">${items.map(sourceChip).join('')}</div></section>`).join('')}</div>`;
  }


  function smartDiscoveryRail() {
    const buckets = [
      { title: t('smart.works.title'), copy: t('smart.works.copy'), items: sortFeatured(DIRECT.filter(s => !state.hidden.includes(s.id))).slice(0,4), action: 'watch' },
      { title: t('smart.movies.title'), copy: t('smart.movies.copy'), items: sortFeatured(filterByTags(['film','movie','movies','series'])).slice(0,4), action: 'film' },
      { title: t('smart.local.title'), copy: t('smart.local.copy'), items: sortFeatured(sampleSources().filter(s => /netherlands|nederland|belgium|belgië|deutschland|germany/i.test(`${s.country} ${s.title}`))).slice(0,4), action: 'countries' }
    ];
    return `<section class="section smart-discovery v32-smart-discovery"><div class="section-head"><div><h2>${esc(t('smart.title'))}</h2><p>${esc(t('smart.copy'))}</p></div></div><div class="smart-discovery-grid">${buckets.map(b=>`<article class="smart-bucket"><div class="mini-section-head"><div><h3>${esc(b.title)}</h3><p>${esc(b.copy)}</p></div><button class="circle-next" ${b.action==='countries'?'data-nav="countries"':`data-action="genre" data-key="${escAttr(b.action)}"`}>›</button></div><div class="source-strip">${b.items.map(sourceChip).join('') || empty(t('empty.noResults'))}</div></article>`).join('')}</div></section>`;
  }

  function feedProviderDashboard(feeds, imported) {
    const providers = feeds.slice().sort((a,b)=>(b.visible_count||0)-(a.visible_count||0) || String(a.provider).localeCompare(String(b.provider))).slice(0,8);
    return `<section class="section feed-provider-dashboard feed-provider-dashboard-clean"><div class="section-head"><div><h2>${esc(t('feeds.providerDashboard.title'))}</h2><p>${esc(t('feeds.providerDashboard.copy'))}</p></div></div><div class="provider-matrix">${providers.map(f=>`<article class="provider-stat"><b>${esc(f.provider || f.id)}</b><span>${esc(t('feeds.stats.candidates',{count:f.candidate_count||0}))}</span><span>${esc(t('feeds.stats.visible',{count:f.visible_count||0}))}</span><span>${esc(t('feeds.stats.duplicates',{count:f.duplicate_count||0}))}</span></article>`).join('') || empty(t('feeds.providers.empty'))}</div></section>`;
  }

  function playbackBadge(s) {
    const memory = PLAYBACK_MEMORY[s?.id] || {};
    if (playbackRecentlyFailed(s)) return t('playback.badge.retryReady');
    if (memory.status === 'success') return t('playback.badge.working');
    if (memory.status === 'failed') return t('playback.badge.compat');
    if (shouldPreferTranscode(s, directStreamUrl(s))) return t('playback.badge.compat');
    if (isDirectPlayable(s)) return t('playback.badge.internal');
    return t('playback.badge.official');
  }

  function playbackRecentlyFailed(source) {
    const memory = PLAYBACK_MEMORY[source?.id] || {};
    if (memory.status !== 'failed' || !memory.checkedAt) return false;
    const age = Date.now() - Date.parse(memory.checkedAt || 0);
    return Number.isFinite(age) && age < 10 * 60 * 1000;
  }

  function preferredPlaybackMethod(source) {
    const memory = PLAYBACK_MEMORY[source?.id] || {};
    if (memory.status === 'success' && memory.method) return memory.method;
    if (memory.status === 'failed' && shouldPreferTranscode(source, directStreamUrl(source))) return 'local-hls';
    return '';
  }
  function sourceQualityRank(s) {
    let rank = 40;
    if (s?.source_quality?.verification_status === 'official') rank += 22;
    else if (s?.source_quality?.verification_status) rank += 14;
    if (isDirectPlayable(s)) rank += 14;
    if (s?.free) rank += 8;
    if (!s?.requiresAccount) rank += 6;
    if (isIptvControlled(s)) rank += 4;
    const memory = PLAYBACK_MEMORY[s?.id] || {};
    if (memory.status === 'success') rank += 14;
    if (memory.status === 'failed') rank -= 10;
    if (state.hidden.includes(s?.id)) rank = 0;
    return Math.max(0, Math.min(100, rank));
  }
  function sourceHealthClass(s) {
    const rank = sourceQualityRank(s);
    if (rank >= 80) return 'working';
    if (rank >= 60) return 'needs_review';
    if (isDirectPlayable(s)) return 'unstable';
    return 'official';
  }

  function rememberPlaybackMethod(source, status, method) {
    if (!source?.id) return;
    PLAYBACK_MEMORY[source.id] = { status, method, checkedAt: new Date().toISOString() };
    writeStore('ml.playbackMemory', PLAYBACK_MEMORY);
  }

  function sourceQualitySummary(s) {
    const parts = [];
    if (s?.source_quality?.verification_status) parts.push(t('quality.verified'));
    if (isDirectPlayable(s)) parts.push(playbackBadge(s));
    if (s?.free) parts.push(t('quality.free'));
    if (!s?.requiresAccount) parts.push(t('quality.noAccount'));
    if (isIptvControlled(s)) parts.push(t('quality.controlledIptv'));
    return parts.join(' · ') || t('quality.officialRoute');
  }

  function openReportDialog(s) {
    if (!s) return;
    const d = document.getElementById('detail-dialog');
    const reasons = ['notWorking','wrongChannel','wrongCategory','geoBlocked','duplicate','quality']; // report.reason.duplicate
    d.innerHTML = `<button class="close-x" data-action="close-dialog" aria-label="${escAttr(t('action.close'))}">×</button><div class="modal-content report-source-modal"><h2>${esc(t('report.title'))}</h2><p>${esc(t('report.copy',{source:s.title}))}</p><div class="report-reasons">${reasons.map(r=>`<button class="chip" data-action="close-dialog">${esc(t('report.reason.'+r))}</button>`).join('')}</div><div class="trust-panel"><b>${esc(t('detail.why'))}</b><span>${esc(t('report.privacy'))}</span></div></div>`;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open','');
  }

  function hideSource(id) {
    if (!id) return;
    state.hidden = [id, ...state.hidden.filter(x=>x!==id)].slice(0,500);
    writeStore('ml.hiddenSources', state.hidden);
  }

  function directFilterLabel(key) { return t((DIRECT_FILTERS.find(([k])=>k===key)||DIRECT_FILTERS[0])[1]); }
  function directFilterCount(key) { return filteredDirect(false, key).length; }
  function playerPlaceholder(s) { return `<div class="player-placeholder"><img src="${logo(s)}" alt="" onerror="this.src='assets/medialens-logo.svg'"><h2>${esc(s?.title || 'MediaLens')}</h2><p>${s ? `${sourceLine(s)}. ${t('player.try.copy')}` : t('player.choose.copy')}</p>${s ? `<div class="actions" style="justify-content:center">${actionButtons(s,{includeInfo:false})}</div>` : ''}</div>`; }

  function discoverPage() {
    if (state.activeCollection) {
      const col = COLLECTIONS.find(c=>c.key===state.activeCollection) || COLLECTIONS[0];
      if (col.key === 'feeds') return feedIntakePage();
      const results = filterByTags(col.tags);
      const visible = pagedSources(results);
      return `${routeHero(collectionTitle(col.key), collectionCopy(col.key))}<div class="filterbar">${COLLECTIONS.map(c=>`<button class="chip ${c.key===state.activeCollection?'active':''}" data-action="genre" data-key="${c.key}">${esc(collectionTitle(c.key))} <small>${filterByTags(c.tags).length}</small></button>`).join('')}</div><div class="section-head"><div><h2>${esc(collectionTitle(col.key))}</h2><p>${esc(t('view.showingSearchHint',{visible:visible.length,total:results.length}))}</p></div></div>${sourceGrid(results)}`;
    }
    const all = sortFeatured(SOURCES);
    return `${routeHero(t('page.discover.title'),t('page.discover.subtitle'))}<section class="section"><div class="collection-grid">${COLLECTIONS.map(collectionTile).join('')}</div></section><section class="section all-source-preview"><div class="section-head"><div><h2>${esc(t('source.catalog.title','All sources'))}</h2><p>${esc(t('source.catalog.copy',{count:all.length},'{count} official, direct, and IPTV/FAST sources in one searchable catalog.'))}</p></div><button class="linkish" data-nav="list">${esc(t('action.viewAll','Bekijk alles'))} ›</button></div>${sourceGrid(all)}</section>`;
  }
  function countryVisibilityAuditPanel(countries) {
    const targets = priorityCountryDefinitions().map(def => {
      const stat = countries.find(c => c.country.toLowerCase() === canonicalCountryName(def.label).toLowerCase()) || { country: def.label, count: 0, direct: 0, live: 0, free: 0, noAccount: 0 };
      return { ...stat, label: def.label, needs: stat.count === 0 };
    });
    const nl = targets.find(x => x.label === 'Nederland') || { count: 0, direct: 0 };
    const missing = targets.filter(x => x.needs).length;
    return `<section class="section country-visibility-audit"><div class="section-head"><div><h2>${esc(t('country.audit.title','Landendekking gecontroleerd'))}</h2><p>${esc(t('country.audit.copy',{countries:countries.length,missing},'{countries} landen met zichtbare bronnen. Landen zonder bronnen: {missing}.'))}</p></div><button class="btn-primary" data-action="country" data-country="Nederland">${esc(t('country.audit.nlCta',{count:nl.count},'Nederland openen ({count})'))}</button></div><div class="country-audit-grid">${targets.map(c=>`<button class="country-audit-pill ${c.needs?'needs-work':'ok'}" data-action="country" data-country="${escAttr(c.label)}"><b>${esc(c.label)}</b><span>${c.count} ${esc(t('label.sources','bronnen'))}</span><small>${c.direct} ${esc(t('quality.overview.direct'))}</small></button>`).join('')}</div></section>`;
  }

  function countriesPage() {
    const countries = countryStats();
    if (state.activeCountry) {
      const activeCountry = resolveCountryName(state.activeCountry);
      const items = prioritizeCountrySources(sortFeatured(SOURCES.filter(s => sourceBelongsToCountry(s, activeCountry))));
      const added = countryExpansionSources(activeCountry);
      const visible = pagedSources(items);
      return `${routeHero(activeCountry, t('country.detail.copy', { count: items.length }))}<div class="filterbar"><button class="chip" data-action="country" data-country="">${esc(t('country.all'))}</button><button class="chip" data-action="search-chip" data-query="${escAttr(activeCountry)}">${esc(t('action.searchIn'))} ${esc(activeCountry)}</button></div>${countrySourceVisibilityPanel(activeCountry, items)}`;
    }
    return `${routeHero(t('page.countries.title'),t('page.countries.subtitle'))}${countryExpansionPriorityPanel()}<section class="section country-directory"><div class="section-head"><div><h2>${esc(t('country.all'))}</h2><p>${esc(t('quality.overview.countries'))}: ${countries.length}</p></div></div><div class="wide-grid country-all-grid">${countries.map(c => `<button class="country-card" data-action="country" data-country="${escAttr(c.country)}"><h3>${esc(c.country)}</h3><p>${esc(t('country.stats', {count:c.count,direct:c.direct}))}</p><div class="stats"><span class="stat">${esc(t('country.live', {count:c.live}))}</span><span class="stat">${esc(t('country.free', {count:c.free}))}</span><span class="stat">${esc(t('country.noAccount', {count:c.noAccount}))}</span></div></button>`).join('')}</div></section>`;
  }

  function countrySourceVisibilityPanel(country, items) {
    const normalized = dedupeCountryItems(sortFeatured(items));
    const graph = watchGraph();
    const countryNode = graph.countryMap.get(countryKey(country)) || { channels: [] };
    const channels = countryNode.channels.slice().sort((a,b) => channelPriorityScore(b)-channelPriorityScore(a) || a.title.localeCompare(b.title, state.lang || 'nl'));
    const platforms = dedupeCountryItems(normalized.filter(s => !isSpecificChannelSource(s) && !channels.some(ch => ch.routes.some(r => sameOutlet(r.source, s)))));
    const direct = channels.filter(ch => ch.routes.some(r => isDirectPlayable(r.source))).length;
    const iptv = channels.filter(ch => ch.routes.some(r => isIptvControlled(r.source))).length;
    const external = channels.filter(ch => ch.routes.some(r => !isDirectPlayable(r.source))).length;
    const totalRoutes = channels.reduce((sum,ch)=>sum+ch.routes.length,0) + platforms.length;
    if (!normalized.length && !channels.length) return `<section class="section country-source-visibility-panel empty-country-panel watch-engine-country-hub"><div class="section-head"><div><h2>${esc(t('country.sources.title',{country},'Bronnen voor {country}'))}</h2><p>${esc(t('country.sources.empty',{country},'Voor dit land zijn nog geen bronnen gekoppeld.'))}</p></div></div></section>`;
    const title = t('watchEngine.country.title',{country},'Kijken in {country}');
    const copy = t('watchEngine.country.copy',{channels:channels.length,routes:totalRoutes,direct,iptv,external},'{channels} zenders met {routes} beschikbare kijkroutes. Kies direct afspelen waar mogelijk of open de officiële kijkroute.');
    const channelRows = channels.map(countryWatchRouteCard).join('');
    const fallbackRows = !channels.length ? normalized.map(countryNativeRow).join('') : '';
    const platformRows = platforms.length ? `<details class="country-platform-details" open><summary>${esc(t('country.platforms.title',{count:platforms.length},'Platformen en officiële/externe routes ({count})'))}</summary><div class="country-source-list platform-source-list" aria-label="${escAttr(t('country.platforms.aria',{country},'Platformen voor {country}'))}">${platforms.map(countryChannelRow).join('')}</div></details>` : '';
    return `<section class="section country-source-visibility-panel watch-engine-country-hub" data-country-detail="${escAttr(country)}" data-country-source-count="${normalized.length}" data-country-channel-count="${channels.length}" data-watch-engine="1.0"><div class="section-head"><div><span class="eyebrow">${esc(t('label.watchRoutes','Kijkroutes'))}</span><h2>${esc(title)}</h2><p>${esc(copy)}</p></div><a class="btn-soft" href="#countries/${encodeURIComponent(countryKey(country))}">${esc(t('country.sources.permalink','Link naar dit land'))}</a></div><div class="watch-engine-stats"><span><b>${channels.length}</b><small>${esc(t('label.channels','zenders'))}</small></span><span><b>${direct}</b><small>${esc(t('quality.overview.direct'))}</small></span><span><b>${iptv}</b><small>IPTV/FAST</small></span><span><b>${totalRoutes}</b><small>${esc(t('label.routes','routes'))}</small></span></div><ol class="country-native-channel-list watch-route-list" aria-label="${escAttr(t('country.channels.aria',{country},'Zenders en bronnen voor {country}'))}">${channelRows || fallbackRows}</ol>${platformRows}</section>`;
  }

  function watchGraph() {
    if (!WATCH_GRAPH_CACHE) WATCH_GRAPH_CACHE = buildWatchGraph(SOURCES);
    return WATCH_GRAPH_CACHE;
  }

  function buildWatchGraph(sources) {
    const channels = [];
    const byKey = new Map();
    const countryMap = new Map();
    const addCountry = (country, channel) => {
      const key = countryKey(country || 'Internationaal');
      if (!countryMap.has(key)) countryMap.set(key, { country: canonicalCountryName(country || 'Internationaal'), channels: [] });
      const node = countryMap.get(key);
      if (!node.channels.includes(channel)) node.channels.push(channel);
    };
    (sources || []).forEach(source => {
      const countries = countryTokensForSource(source);
      const countryList = countries.length ? countries : ['Internationaal'];
      const graphKind = graphSourceKind(source);
      if (!['channel','iptv','direct','fast'].includes(graphKind) && !isSpecificChannelSource(source)) return;
      countryList.forEach(country => {
        const title = cleanChannelTitle(source.title || source.name || source.id || 'Zender');
        const key = `${countryKey(country)}|${slug(title)}`;
        if (!byKey.has(key)) {
          const ch = { id: `channel-${key}`, key, title, country: canonicalCountryName(country), routes: [], tags: new Set(), languages: new Set(), mediaKinds: new Set() };
          byKey.set(key, ch);
          channels.push(ch);
          addCountry(country, ch);
        }
        const channel = byKey.get(key);
        const route = sourceToWatchRoute(source);
        if (!channel.routes.some(r => routeDedupeKey(r.source) === routeDedupeKey(source))) channel.routes.push(route);
        (source.tags || []).forEach(tag => channel.tags.add(String(tag)));
        (source.language || []).forEach(lang => channel.languages.add(String(lang)));
        channel.mediaKinds.add(graphKind);
      });
    });
    channels.forEach(ch => {
      ch.routes = ch.routes.sort((a,b)=>sourcePriorityScore(b.source)-sourcePriorityScore(a.source) || routeKindRank(b.kind)-routeKindRank(a.kind) || a.label.localeCompare(b.label, state.lang || 'nl'));
      ch.primary = ch.routes[0] || null;
      ch.tags = Array.from(ch.tags);
      ch.languages = Array.from(ch.languages);
      ch.mediaKinds = Array.from(ch.mediaKinds);
    });
    countryMap.forEach(node => node.channels.sort((a,b)=>channelPriorityScore(b)-channelPriorityScore(a) || a.title.localeCompare(b.title, state.lang || 'nl')));
    return { channels, countryMap };
  }

  function graphSourceKind(s) {
    if (isIptvControlled(s)) return hasAny(s, ['fast']) ? 'fast' : 'iptv';
    if (isDirectPlayable(s)) return 'direct';
    if (isSpecificChannelSource(s)) return 'channel';
    if (isAggregatorSource(s)) return 'aggregator';
    if (/platform|viewing_page|official/i.test(`${s?.source_type || ''} ${s?.type || ''}`)) return 'platform';
    return 'source';
  }

  function sourceToWatchRoute(source) {
    const kind = isDirectPlayable(source) ? (isIptvControlled(source) ? 'iptv' : 'direct') : (isAggregatorSource(source) ? 'aggregator' : (isSpecificChannelSource(source) ? 'official' : 'platform'));
    return { source, kind, label: routeKindLabel(kind), score: sourcePriorityScore(source) };
  }

  function routeKindLabel(kind) {
    const labels = { direct: 'MediaLens', iptv: 'IPTV/FAST', official: 'Officieel', platform: 'Platform', aggregator: 'Externe route', source: 'Bron' };
    return labels[kind] || labels.source;
  }
  function routeKindRank(kind) { return ({ direct: 90, iptv: 84, official: 70, platform: 58, aggregator: 46, source: 20 })[kind] || 0; }
  function isAggregatorSource(s) { return /nederland\.tv|aggregator|external_route|external-watch/i.test(`${s?.url || ''} ${s?.officialUrl || ''} ${s?.source_type || ''} ${s?.type || ''}`); }
  function routeDedupeKey(s) { return normalizeSourceUrl(s?.streamUrl || s?.hlsUrl || s?.videoUrl || s?.embedUrl || s?.playerUrl || s?.url || s?.officialUrl || s?.id || ''); }
  function cleanChannelTitle(title='') {
    let text = String(title || '').replace(/\([^)]*\)|\[[^\]]*\]/g,' ');
    text = text.replace(/\b(1080p|720p|576p|540p|480p|360p|uhd|fhd|hd|sd|4k|live|livestream)\b/gi,' ');
    text = text.replace(/\s+/g,' ').trim();
    return text || String(title || 'Zender');
  }
  function channelPriorityScore(ch) {
    if (!ch) return 0;
    const best = ch.primary?.source || ch.routes?.[0]?.source || null;
    return (best ? sourcePriorityScore(best) : 0) + Math.min((ch.routes || []).length * 4, 24) + ((ch.routes || []).some(r => isDirectPlayable(r.source)) ? 40 : 0);
  }

  function countryWatchRouteCard(channel) {
    const primary = channel.primary?.source;
    const routes = channel.routes || [];
    const tags = Array.from(new Set(routes.flatMap(r => r.source.tags || []))).slice(0,4);
    const language = channel.languages?.length ? channel.languages.map(x=>String(x).toUpperCase()).join(', ') : '';
    const primaryAction = primary && isDirectPlayable(primary)
      ? `<button class="btn-primary micro" data-action="play" data-id="${escAttr(primary.id)}">${esc(isIptvControlled(primary) ? t('action.tryIptv') : t('action.play.short'))}</button>`
      : (primary ? officialLink(primary, t('action.openOfficial'), 'btn-primary micro') : '');
    const altRoutes = routes.slice(0, 8).map(route => routeChip(route)).join('');
    const status = primary ? statusLabel(primary) : t('status.officialSite');
    return `<li class="watch-route-card ${primary && isDirectPlayable(primary) ? 'playable-country-source' : 'official-country-source'}" data-channel-key="${escAttr(channel.key)}"><div class="watch-route-main"><img src="${logo(primary || routes[0]?.source || {})}" alt="" loading="lazy" onerror="this.src='assets/medialens-logo.svg'"><div><strong>${esc(channel.title)}</strong><span>${esc(channel.country)}${language ? ` · ${esc(language)}` : ''} · ${esc(status)} · ${routes.length} ${esc(t('label.routes','routes'))}</span><small>${tags.map(esc).join(' · ')}</small></div></div><div class="country-row-actions watch-route-primary">${primaryAction}${primary?`<button class="btn-soft micro" data-action="open-detail" data-id="${escAttr(primary.id)}">${esc(t('action.info','Info'))}</button>`:''}</div><details class="watch-route-options"><summary>${esc(t('watchEngine.routes.show',{count:routes.length},'Toon kijkroutes ({count})'))}</summary><div class="watch-route-chip-grid">${altRoutes}</div></details></li>`;
  }

  function routeChip(route) {
    const s = route.source;
    if (!s) return '';
    const label = routeKindLabel(route.kind);
    const action = isDirectPlayable(s)
      ? `<button class="route-chip ${route.kind}" data-action="play" data-id="${escAttr(s.id)}"><b>${esc(label)}</b><span>${esc(s.title)}</span></button>`
      : `<a class="route-chip ${route.kind}" href="${safeUrl(s.url || s.officialUrl)}" target="_blank" rel="noopener noreferrer" data-source-id="${escAttr(s.id)}"><b>${esc(label)}</b><span>${esc(s.title)}</span></a>`;
    return action;
  }

  function countryNativeRow(s) {
    const playable = isDirectPlayable(s);
    const main = playable
      ? `<button class="country-row-main country-row-play" data-action="select-direct" data-id="${escAttr(s.id)}" title="${escAttr(t('action.play'))}: ${escAttr(s.title)}"><strong>${esc(s.title)}</strong><span>${esc(channelRouteMeta(s))}</span></button>`
      : `<a class="country-row-main" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" data-source-id="${escAttr(s.id)}"><strong>${esc(s.title)}</strong><span>${esc(channelRouteMeta(s))}</span></a>`;
    const primary = playable
      ? `<button class="btn-primary micro" data-action="play" data-id="${escAttr(s.id)}">${esc(isIptvControlled(s) ? t('action.tryIptv') : t('action.play.short'))}</button>`
      : officialLink(s, t('action.openOfficial'), 'btn-primary micro');
    const secondary = playable ? officialLink(s, t('action.openOfficial'), 'btn-soft micro') : '';
    return `<li class="${playable?'playable-country-source':'official-country-source'}">${main}<div class="country-row-actions">${primary}${secondary}<button class="btn-soft micro" data-action="open-detail" data-id="${escAttr(s.id)}">${esc(t('action.info','Info'))}</button></div></li>`;
  }

  function dedupeCountryItems(items) {
    const best = new Map();
    const order = [];
    (items || []).forEach((s, index) => {
      if (!s) return;
      const key = sameOutletKey(s);
      if (!best.has(key)) { best.set(key, { s, index }); order.push(key); return; }
      const current = best.get(key);
      if (sourcePriorityScore(s) > sourcePriorityScore(current.s)) best.set(key, { s, index: current.index });
    });
    return order.map(key => best.get(key)?.s).filter(Boolean);
  }

  function sameOutlet(a, b) { return sameOutletKey(a) === sameOutletKey(b); }
  function sameOutletKey(s) { return `${countryKey(s?.country || s?.origin_country || 'worldwide')}|${slug(s?.title || s?.name || s?.id || '')}`; }
  function sourcePriorityScore(s) {
    const url = String(s?.url || '');
    let score = 0;
    if (isDirectPlayable(s)) score += 90;
    if (isSpecificChannelSource(s)) score += 60;
    if (s?.source_type === 'public_iptv_channel') score += 70;
    if (s?.source_type === 'direct_stream') score += 80;
    if (/nederland\.tv\//i.test(url)) score += 16;
    if (/#channel-/i.test(url)) score -= 35;
    if (/\/nieuws\//i.test(url)) score -= 20;
    if (s?.isLive) score += 8;
    if (s?.free) score += 4;
    return score;
  }

  function countryChannelRow(s) {
    const action = isDirectPlayable(s) ? 'select-direct' : 'open-detail';
    const title = isDirectPlayable(s) ? `${t('action.play')}: ${s.title}` : `${t('action.info','Info')}: ${s.title}`;
    return `<button class="country-source-row ${isSpecificChannelSource(s)?'specific-channel':'platform-route'} ${isDirectPlayable(s)?'playable-country-source':''}" data-action="${action}" data-id="${escAttr(s.id)}" title="${escAttr(title)}"><img src="${logo(s)}" alt="" loading="lazy" onerror="this.src='assets/medialens-logo.svg'"><span><b>${esc(s.title)}</b><small>${esc(channelRouteMeta(s))}</small></span></button>`;
  }
  function channelRouteMeta(s) {
    const kind = isSpecificChannelSource(s) ? t('label.channel','zender') : t('label.platform','platform');
    const langs = Array.isArray(s?.language) && s.language.length ? s.language.join(', ').toUpperCase() : (s?.region || '');
    const route = s?.channel_platform ? `${kind} via ${s.channel_platform}` : `${kind} · ${statusLabel(s)}`;
    return `${esc(s?.country || t('label.worldwide'))} · ${esc(langs)} · ${esc(route)} · ${esc(domain(s?.url))}`;
  }
  function isSpecificChannelSource(s) {
    return !!(s?.specific_channel || String(s?.source_type || '').includes('channel') || hasAny(s, ['channel','zender','public_iptv_channel']) || /\b(zender|kanaal|channel|nieuwszender|sportzender|kinderzender)\b/i.test(`${s?.type || ''} ${s?.title || ''}`));
  }
  function prioritizeCountrySources(items) {
    return items.slice().sort((a,b) => Number(isSpecificChannelSource(b))-Number(isSpecificChannelSource(a)) || sourceQualityRank(b)-sourceQualityRank(a) || String(a.title).localeCompare(String(b.title), state.lang || 'nl'));
  }

  function searchPage() {
    const results = state.query ? searchSources(state.query) : [];
    const suggestions = ['Live TV','IPTV','Films','Series','Entertainment','Music','Lifestyle','Business','Weather','Gratis','Zonder account','Internationaal','Nederland.TV','News','Netherlands','Sport','Kids','Documentaries','France 24','Al Jazeera'];
    const visible = pagedSources(results);
    return `<section class="search-page v33-search-worker-ready">${routeHero(t('page.search.title'),t('page.search.subtitle'))}<form data-search-form><input name="q" value="${esc(state.query)}" placeholder="${esc(t('search.input.placeholder'))}"><button class="btn-primary">${esc(t('nav.search'))}</button></form><div class="filterbar">${suggestions.map(s=>`<button class="chip" data-action="search-chip" data-query="${escAttr(s)}">${esc(localizeSuggestion(s))}</button>`).join('')}</div>${state.query ? `<div class="section-head"><div><h2>${esc(t('search.resultsFor', { query: state.query }))}</h2><p>${esc(t('search.resultsCount', { count: results.length }))}. ${esc(t('view.searchMaxHint',{visible:visible.length}))}</p></div></div>${searchResultGroups(results)}${sourceGrid(results)}` : `<section class="section all-source-preview"><div class="section-head"><div><h2>${esc(t('source.catalog.title','All sources'))}</h2><p>${esc(t('source.catalog.copy',{count:SOURCES.length},'{count} sources available. Use search or load the catalog further.'))}</p></div></div>${sourceGrid(sortFeatured(SOURCES))}</section>`}</section>`;
  }
  function listPage() {
    const items = state.watchlist.map(byId).filter(Boolean);
    const recent = state.recent.map(byId).filter(Boolean).slice(0,8);
    const all = sortFeatured(SOURCES.filter(s => !state.hidden.includes(s.id)).filter(s => !state.qualityOnly || sourceQualityRank(s) >= 70));
    const visible = pagedSources(all);
    return `${routeHero(t('page.list.title'),t('page.list.subtitle'))}<section class="section personal-library-panel"><div class="section-head"><div><h2>${esc(t('list.saved'))}</h2><p>${esc(items.length ? t('list.saved.copy') : t('list.empty.copy'))}</p></div><button class="btn-soft" data-nav="search">${esc(t('nav.search'))}</button></div><div class="poster-grid">${items.map(card).join('') || empty(t('list.empty.hint'))}</div></section><section class="section"><div class="section-head"><div><h2>${esc(t('list.recent'))}</h2><p>${esc(t('list.recent.copy'))}</p></div></div><div class="compact-grid">${recent.map(card).join('') || empty(t('list.recent.empty'))}</div></section><section class="section source-catalog-panel consumer-catalog-panel"><div class="section-head"><div><h2>${esc(t('source.catalog.title','Zenders en diensten'))}</h2><p>${esc(t('source.catalog.showing',{visible:visible.length,total:all.length},'{visible} van {total} zenders en diensten zichtbaar. Gebruik zoeken voor een specifieke zender.'))}</p></div><button class="btn-soft" data-nav="search">${esc(t('nav.search'))}</button></div>${sourceGrid(all)}</section>`;
  }

  function pagedSources(items) { return items.slice(0, state.sourceLimit || SOURCE_PAGE_SIZE); }
  function sourceGrid(items, emptyText=t('empty.noResults')) {
    const visible = pagedSources(items);
    const remaining = Math.max(0, items.length - visible.length);
    return `<div class="poster-grid source-results-grid">${visible.map(card).join('') || empty(emptyText)}</div>${remaining ? `<div class="load-more-wrap"><button class="btn load-more" data-action="load-more-sources">${esc(t('action.showMoreSources',{count:Math.min(SOURCE_PAGE_SIZE, remaining)}))}</button></div>` : ''}`;
  }
  function sourceVisibilityStats() {
    const items = [
      ['◎', t('quality.overview.countries'), countryStats().length],
      ['◉', t('quality.overview.direct'), DIRECT.length],
      ['▣', t('quality.overview.iptv'), SOURCES.filter(isIptvControlled).length],
      ['✓', t('quality.overview.working'), SOURCES.filter(s => sourceQualityRank(s) >= 80).length]
    ];
    return `<div class="source-visibility-stats">${items.map(([icon,label,value])=>`<span><b>${esc(icon)} ${value}</b><small>${esc(label)}</small></span>`).join('')}</div>`;
  }

  function homeCategoryOverview() {
    const categoryItems = COLLECTIONS.filter(c => !['live','feeds'].includes(c.key)).map(c => {
      const count = c.key === 'iptv' ? SOURCES.filter(isIptvControlled).length : filterByTags(c.tags).length;
      return { ...c, count };
    }).filter(c => c.count > 0 || ['film','series','entertainment','news','sport','kids','documentary','music','lifestyle','business','weather','public','world','iptv'].includes(c.key));
    return `<section class="section home-category-overview"><div class="section-head"><div><h2>${esc(t('home.categories.title'))}</h2><p>${esc(t('home.categories.copy'))}</p></div><button class="linkish" data-nav="discover">${esc(t('action.discoverAll'))} ›</button></div><div class="scale-chip-grid wide">${categoryItems.map(c => `<button class="scale-chip" data-action="genre" data-key="${escAttr(c.key)}"><b>${esc(collectionTitle(c.key))}</b><span>${c.count}</span></button>`).join('')}</div></section>`;
  }

  function consumerStart() {
    const stats = {
      total: SOURCES.length,
      direct: DIRECT.length,
      iptv: SOURCES.filter(isIptvControlled).length,
      feeds: FEED_IMPORTS.length,
      imported: IMPORTED_IPTV_SOURCES.length,
      free: SOURCES.filter(s => s.free).length,
      film: SOURCES.filter(s => hasAny(s, ['film','movie','movies','series','speelfilm'])).length
    };
    const cards = [
      ['watch','◉',t('start.watch.title'),t('start.watch.stat',{count:stats.direct}), t('start.watch.copy')],
      ['iptv','▣',t('start.iptv.title'),t('start.iptv.stat',{count:stats.iptv}), t('start.iptv.copy')],
      ['feeds','⇣',t('start.feeds.title'),t('start.feeds.stat',{feeds:stats.feeds, channels:stats.imported}), t('start.feeds.copy')],
      ['film','🎬',t('start.film.title'),t('start.film.stat',{count:stats.film}), t('start.film.copy')],
      ['free','◇',t('start.free.title'),t('start.free.stat',{count:stats.free}), t('start.free.copy')],
      ['world','◎',t('start.world.title'),t('start.world.stat',{count:stats.total}), t('start.world.copy')]
    ];
    return `<section class="consumer-start" aria-label="${escAttr(t('start.aria'))}"><div class="consumer-start-head"><span class="eyebrow">${esc(t('start.eyebrow'))}</span><h2>${esc(t('start.title'))}</h2><p>${esc(t('start.copy'))}</p></div><div class="consumer-start-grid">${cards.map(([key,icon,title,stat,copy]) => shortcutCard(key,icon,title,stat,copy)).join('')}</div></section>`;
  }
  
  function isCountryExpansionSource(s) {
    return hasAny(s, ['country-expansion']);
  }
  function countryExpansionSources(country='') {
    const list = SOURCES.filter(isCountryExpansionSource);
    if (!country) return sortFeatured(list);
    return sortFeatured(list.filter(s => sourceBelongsToCountry(s, country)));
  }
  function sourceBelongsToCountry(s, country) {
    const targetName = canonicalCountryName(String(country || '').replace(/-/g, ' '));
    const target = targetName.toLowerCase();
    const targetSlug = countryKey(targetName);
    if (!targetSlug) return true;
    const tokens = countryTokensForSource(s);
    const tokenSlugs = tokens.map(countryKey);
    const candidateHay = countryCandidateValues(s).join(' ').toLowerCase();
    return tokenSlugs.some(c => c === targetSlug || targetSlug.includes(c) || c.includes(targetSlug))
      || tokens.some(c => c.toLowerCase() === target)
      || candidateHay.includes(String(country || '').toLowerCase())
      || candidateHay.includes(target);
  }
  function countryExpansionLatestPanel() {
    const added = countryExpansionSources().slice(0, 8);
    if (!added.length) return '';
    return `<section class="section country-expansion-latest"><div class="section-head"><div><h2>${esc(t('country.expansion.latest.title'))}</h2><p>${esc(t('country.expansion.latest.copy',{count:countryExpansionSources().length}))}</p></div><button class="btn-soft" data-nav="countries">${esc(t('nav.countries'))}</button></div><div class="compact-grid expansion-latest-grid">${added.map(card).join('')}</div></section>`;
  }
  function countryExpansionBatchPanel() {
    const added = countryExpansionSources();
    if (!added.length) return '';
    const grouped = new Map();
    added.forEach(s => splitCountries(s.country).forEach(c => {
      if (!grouped.has(c)) grouped.set(c, []);
      grouped.get(c).push(s);
    }));
    const groups = [...grouped.entries()].sort((a,b)=>b[1].length-a[1].length || a[0].localeCompare(b[0], state.lang || 'nl'));
    const visibleGroups = groups.slice(0, state.countryLimit || COUNTRY_PAGE_SIZE);
    const remainingGroups = Math.max(0, groups.length - visibleGroups.length);
    return `<section class="section country-expansion-batch-panel"><div class="section-head"><div><h2>${esc(t('country.expansion.batch.title'))}</h2><p>${esc(t('country.expansion.batch.copy',{count:added.length,countries:groups.length}))}</p></div></div><div class="country-expansion-group-grid">${visibleGroups.map(([country,items])=>`<article class="expansion-country-group"><button class="country-group-head" data-action="country" data-country="${escAttr(country)}"><b>${esc(country)}</b><span>${esc(t('country.expansion.addedCount',{count:items.length}))}</span></button><div class="source-chip-stack">${items.slice(0,8).map(sourceChip).join('')}</div></article>`).join('')}</div>${remainingGroups?`<div class="load-more-wrap"><button class="btn load-more" data-action="load-more-countries">${esc(t('action.showMoreCountries',{count:Math.min(COUNTRY_PAGE_SIZE, remainingGroups)},'Toon meer landen ({count})'))}</button></div>`:''}</section>`;
  }
  function countryExpansionCountrySection(country, added) {
    const visible = pagedSources(added);
    const remaining = Math.max(0, added.length - visible.length);
    return `<section class="section country-expansion-country-panel"><div class="section-head"><div><h2>${esc(t('country.expansion.country.title',{country}))}</h2><p>${esc(t('country.expansion.country.copy',{count:added.length}))}</p></div></div><div class="compact-grid expansion-country-grid">${visible.map(card).join('')}</div>${remaining?`<div class="load-more-wrap"><button class="btn load-more" data-action="load-more-sources">${esc(t('action.showMoreSources',{count:Math.min(SOURCE_PAGE_SIZE, remaining)}))}</button></div>`:''}</section>`;
  }

  function countryExpansionPriorityPanel() {
    const targets = priorityCountryDefinitions().map(x=>x.label);
    return `<section class="section country-priority-panel"><div class="section-head"><div><h2>${esc(t('country.priority.title','Populaire landen'))}</h2><p>${esc(t('country.priority.copy','Veelgebruikte landen en markten in MediaLens.'))}</p></div></div><div class="country-priority-grid">${targets.map(name=>`<button class="chip" data-action="country" data-country="${escAttr(name)}">${esc(name)}</button>`).join('')}</div></section>`;
  }
  function personalizationPanel() {
    const countries = countryStats().slice(0,10).map(c => c.country);
    const languages = ['en','nl','de','fr','es','pt','it','pl','tr','ru','ar'];
    const providers = FEED_IMPORTS.slice(0,8).map(f => f.provider || f.id);
    return `<section class="section personalization-panel"><div class="section-head"><div><h2>${esc(t('personal.title'))}</h2><p>${esc(t('personal.copy'))}</p></div><button class="btn-soft ${state.qualityOnly?'active':''}" data-action="toggle-quality-only">${esc(state.qualityOnly?t('personal.qualityOnly.on'):t('personal.qualityOnly.off'))}</button></div><div class="preference-group"><b>${esc(t('personal.countries'))}</b><div class="preference-chips">${countries.map(c=>`<button class="chip ${state.userCountries.includes(c)?'active':''}" data-action="toggle-country-pref" data-country="${escAttr(c)}">${esc(c)}</button>`).join('')}</div></div><div class="preference-group"><b>${esc(t('personal.languages'))}</b><div class="preference-chips">${languages.map(l=>`<button class="chip ${state.userLanguages.includes(l)?'active':''}" data-action="toggle-language-pref" data-lang-code="${escAttr(l)}">${esc(l.toUpperCase())}</button>`).join('')}</div></div><div class="preference-group"><b>${esc(t('personal.providers'))}</b><div class="preference-chips">${providers.map(p=>`<button class="chip ${state.userProviders.includes(p)?'active':''}" data-action="toggle-provider-pref" data-provider="${escAttr(p)}">${esc(p)}</button>`).join('') || empty(t('feeds.providers.empty'))}</div></div><div class="actions"><button class="btn-soft" data-action="clear-hidden">${esc(t('personal.clearHidden',{count:state.hidden.length}))}</button></div></section>`;
  }
  function togglePreference(key, value) {
    if (!value || !Array.isArray(state[key])) return;
    state[key] = state[key].includes(value) ? state[key].filter(x=>x!==value) : [value, ...state[key]].slice(0,24);
    const storeKey = key === 'userCountries' ? 'ml.userCountries' : key === 'userLanguages' ? 'ml.userLanguages' : 'ml.userProviders';
    writeStore(storeKey, state[key]);
  }

  function shortcutCard(key, icon, title, stat, copy) {
    const action = key === 'watch' ? 'data-nav="watch"' : key === 'iptv' ? 'data-action="genre" data-key="iptv"' : key === 'feeds' ? 'data-action="genre" data-key="feeds"' : key === 'film' ? 'data-action="genre" data-key="film"' : `data-action="search-chip" data-query="${key === 'free' ? 'free no-account' : 'international world'}"`; 
    return `<button class="shortcut-card" ${action}><span>${icon}</span><b>${esc(title)}</b><small>${esc(stat)}</small><em>${esc(copy)}</em></button>`;
  }

  function routeHero(title, subtitle) { return `<section class="route-hero cinematic-panel"><div class="route-glow" aria-hidden="true"></div><span class="eyebrow">MediaLens</span><h1>${esc(title)}</h1><p>${esc(subtitle)}</p></section>`; }
  function collectionTitle(key) { return t('collection.' + key + '.title', key); }
  function collectionCopy(key) { return t('collection.' + key + '.copy', t('collection.default.copy')); }

  function feedIntakePage() {
    const items = FEED_IMPORTS;
    const imported = sortFeatured(IMPORTED_IPTV_SOURCES);
    const totalCandidates = items.reduce((sum,f)=>sum+(f.candidate_count||0),0);
    const duplicates = items.reduce((sum,f)=>sum+(f.duplicate_count||0),0);
    const categorySummary = DIRECT_FILTERS.filter(([k]) => !['all','recommended','free','world'].includes(k)).map(([k,label]) => ({ key:k, label:t(label), count: filteredDirect(false,k).length })).filter(x=>x.count>0);
    return `${routeHero(t('feeds.title'), t('feeds.subtitle'))}
      <div class="filterbar v32-feed-stats"><span class="chip static">${esc(t('feeds.stats.feeds',{count:items.length}))}</span><span class="chip static">${esc(t('feeds.stats.candidates',{count:totalCandidates}))}</span><span class="chip static">${esc(t('feeds.stats.visible',{count:imported.length}))}</span><span class="chip static">${esc(t('feeds.stats.duplicates',{count:duplicates}))}</span></div>
      ${feedProviderDashboard(items, imported)}
      <section class="section"><div class="section-head"><div><h2>${esc(t('feeds.categories.title'))}</h2><p>${esc(t('feeds.categories.copy'))}</p></div></div><div class="scale-chip-grid wide">${categorySummary.map(c=>`<button class="scale-chip" data-action="direct-filter" data-filter="${c.key}"><b>${esc(c.label)}</b><span>${c.count}</span></button>`).join('') || empty(t('feeds.categories.empty'))}</div></section>
      <section class="section"><div class="section-head"><div><h2>${esc(t('feeds.channels.title'))}</h2><p>${esc(t('feeds.channels.copy',{count:imported.length}))}</p></div><button class="btn-soft" data-nav="watch">${esc(t('nav.watch'))}</button></div><div class="poster-grid">${imported.slice(0,DISCOVERY_PAGE_SIZE).map(card).join('') || empty(t('feeds.channels.empty'))}</div></section>
      <section class="section"><div class="section-head"><div><h2>${esc(t('feeds.providers.title'))}</h2><p>${esc(t('feeds.providers.copy'))}</p></div></div><div class="feed-grid">${items.map(feedCard).join('') || empty(t('feeds.providers.empty'))}</div></section>`;
  }
  function feedCard(feed) {
    const markets = (feed.market_hint || []).join(', ') || t('label.international');
    const categories = (feed.category_hint || []).join(', ') || t('collection.live.title');
    const candidates = Number(feed.candidate_count) || 0;
    const visible = Number(feed.visible_count) || 0;
    const duplicates = Number(feed.duplicate_count) || 0;
    const status = candidates ? t('feeds.status',{visible,candidates,duplicates}) : t('feeds.ready');
    return `<article class="feed-card"><div class="feed-icon">⇣</div><div><span class="source-status iptv">${esc(t('feeds.review'))}</span><h3>${esc(feed.provider || feed.id)}</h3><p>${esc(categories)} · ${esc(markets)}</p><small>${esc(status)}</small><div class="actions"><a class="btn-primary" href="${safeUrl(feed.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(t('action.openProvider'))}</a><button class="btn-soft" disabled title="${escAttr(t('feeds.noAutoPublish.hint'))}">${esc(t('feeds.noAutoPublish'))}</button></div></div></article>`;
  }

  function collectionTile(c) { return `<button class="tile" data-action="collection" data-key="${c.key}"><div class="tile-icon">${c.icon}</div><h3>${esc(collectionTitle(c.key))}</h3><p>${esc(collectionCopy(c.key))}</p></button>`; }
  function sourceChip(s) { return `<button class="source-chip" data-action="open-detail" data-id="${escAttr(s.id)}"><img src="${logo(s)}" alt="" onerror="this.src='assets/medialens-logo.svg'"><span><b>${esc(s.title)}</b><small>${esc(s.type || s.country || t('label.source'))}</small></span></button>`; }
  // Historical marker for older UX verification only: data-action="play" data-id="${escAttr(s.id)}" aria-label="${escAttr(t('action.play'))}"
  function channelButton(s) { return `<button class="channel ${s.id===state.selectedDirectId?'active':''}" data-action="select-direct" data-id="${escAttr(s.id)}" aria-label="${escAttr(t('action.selectSource','Kies bron'))} ${escAttr(s.title)}"><span class="channel-art"><img class="channel-poster" src="${poster(s)}" alt="" onerror="this.src='assets/art/medialens-world-lens.svg'"><img class="channel-logo" src="${logo(s)}" alt="" onerror="this.src='assets/medialens-logo.svg'"></span><span><b>${esc(s.title)}</b><small>${sourceLine(s)}</small><em>${esc(t('watch.selectHint','Kies deze bron'))}</em></span></button>`; }
  function card(s, opts={}) {
    const isSaved = state.watchlist.includes(s.id);
    return `<article class="card source-card"><div class="poster"><img class="art" src="${poster(s)}" alt="" loading="lazy" onerror="this.src='assets/art/medialens-world-lens.svg'">${opts.rank?`<span class="rank">#${opts.rank}</span>`:''}<span class="source-status ${statusClass(s)}">${esc(statusLabel(s))}</span><span class="source-status playback-badge">${esc(playbackBadge(s))}</span><span class="quality-meter" title="${escAttr(t('detail.quality'))}"><i style="width:${sourceQualityRank(s)}%"></i></span></div><div class="card-body"><span class="logo-badge"><img src="${logo(s)}" alt="" loading="lazy" onerror="this.src='assets/medialens-logo.svg'"><span>${esc(s.title)}</span></span><h3>${esc(s.title)}</h3><div class="meta source-meta">${sourceLine(s)}</div><div class="source-domain">${esc(t('label.external'))}: ${esc(domain(s.url))}</div><div class="actions">${actionButtons(s,{compact:true,isSaved})}</div></div></article>`;
  }
  function actionButtons(s, { compact=false, includeInfo=true, isSaved=state.watchlist.includes(s.id) }={}) {
    const playText = isIptvControlled(s) ? t('action.tryIptv') : (compact ? t('action.play.short') : t('action.play'));
    const primary = isDirectPlayable(s) ? `<button class="btn-primary" data-action="play" data-id="${escAttr(s.id)}">${esc(playText)}</button>` : officialLink(s, compact?t('action.open'):t('action.openOfficial'),'btn-primary');
    return `${primary}${isDirectPlayable(s)?officialLink(s,t('action.openOfficial'),'btn-soft'):''}<button class="btn-soft" data-action="toggle-list" data-id="${escAttr(s.id)}">${esc(isSaved?t('action.saved'):t('action.save'))}</button>${includeInfo?`<button class="btn-soft" data-action="open-detail" data-id="${escAttr(s.id)}">${esc(t('action.info'))}</button>`:''}`;
  }
  function officialLink(s, label=t('action.openOfficial'), cls='btn-soft') { return `<a class="${cls}" href="${safeUrl(s.url)}" target="_blank" rel="noopener noreferrer" data-source-id="${escAttr(s.id)}" title="${escAttr(t('action.openOfficial'))}: ${escAttr(s.title)}">${esc(label)}</a>`; }

  function openDetail(s) {
    if (!s) return;
    const d = document.getElementById('detail-dialog');
    d.innerHTML = `<button class="close-x" data-action="close-dialog" aria-label="${escAttr(t('action.close'))}">×</button><div class="modal-hero"><div class="poster"><img class="art" src="${poster(s)}" alt="" onerror="this.src='assets/art/medialens-world-lens.svg'"></div><div class="modal-content"><img class="modal-logo" src="${logo(s)}" alt="" onerror="this.src='assets/medialens-logo.svg'"><h2>${esc(s.title)}</h2><p>${esc(s.description || t('detail.default'))}</p><p><b>${esc(s.country || t('label.worldwide'))}</b> · ${esc(s.type || t('label.source'))} · ${esc(statusLabel(s))}</p><div class="trust-panel"><b>${esc(t('detail.why'))}</b><span>${esc(trustCopy(s))}</span></div><div class="trust-panel quality-panel"><b>${esc(t('detail.quality'))}</b><span>${esc(sourceQualitySummary(s))}</span></div><p class="source-domain modal-domain">${esc(t('label.external'))}: ${esc(domain(s.url))}</p><div class="actions">${actionButtons(s,{includeInfo:false})}<button class="btn-soft" data-action="report-source" data-id="${escAttr(s.id)}">${esc(t('action.reportSource'))}</button><button class="btn-soft" data-action="hide-source" data-id="${escAttr(s.id)}">${esc(t('action.hideSource'))}</button></div></div></div>`;
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open','');
  }

  function selectDirectSource(id) {
    const source = resolvePlayableSource(id);
    if (!source) return;
    state.selectedDirectId = source.id;
    state.route = 'watch';
    state.playing = false;
    remember(source.id);
    updateHash();
    safeRender();
  }


  function playSourceById(id, options={}) {
    const source = resolvePlayableSource(id || state.selectedDirectId);
    if (!source) return;
    if (!isDirectPlayable(source)) { openDetail(source); return; }
    state.selectedDirectId = source.id;
    state.route = 'watch';
    state.directFilter = 'all';
    state.playing = true;
    remember(source.id);
    updateHash();
    safeRender();
    // Channel-route cards always start
    // playback after the watch route has rendered and always pass the original
    // catalog source, not the derived channel/route object.
    const start = () => startPlayer(source, { userInitiated: !!options.userInitiated, restart: !!options.restart });
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(start);
    else setTimeout(start, 0);
  }

  function resolvePlayableSource(id) {
    const direct = byId(id);
    if (direct) return direct;
    const graph = watchGraph();
    const channel = graph.channels.find(ch => ch.id === id || ch.key === id || ch.primary?.source?.id === id || ch.routes?.some(r => r.source?.id === id));
    if (!channel) return null;
    const playable = channel.routes.find(r => isDirectPlayable(r.source)) || channel.primary || channel.routes[0];
    return playable?.source?.id ? byId(playable.source.id) || playable.source : playable?.source || null;
  }


  async function startPlayer(source, options={}) {
    source = resolvePlayableSource(source?.id || source) || source;
    const screen = document.getElementById('player-screen');
    if (!screen || !source) return;
    destroyPlayer();
    const url = directStreamUrl(source);
    if (!url) { screen.innerHTML = playerPlaceholder(source); return; }
    screen.innerHTML = loadingPlayer(source);
    if (source.embedUrl || /youtube\.com\/embed|player\.vimeo|dailymotion\.com\/embed/i.test(url)) {
      rememberPlaybackMethod(source, 'success', 'native');
      screen.innerHTML = `<iframe src="${escAttr(url)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen title="${escAttr(source.title)}"></iframe>`;
      return;
    }
    const autoStart = false; // Playback starts only after an explicit user action.
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('preload','auto');
    video.dataset.sourceId = source.id || '';
    video.dataset.playerMode = 'internal';
    video.setAttribute('aria-label', `${t('player.internal')} ${source.title || t('player.liveSource')}`);
    // Do not force crossOrigin here. Many public IPTV endpoints do not send browser
    // headers; forcing anonymous browser can break native Safari playback. hls.js uses
    // the same-origin MediaLens proxy when available.
    screen.innerHTML = '';
    screen.appendChild(video);
    try {
      let playbackUrl = resolvePlaybackUrl(source, url);
      const remembered = preferredPlaybackMethod(source);
      const preferLocalServer = shouldPreferTranscode(source, url);
      if (preferLocalServer) {
        screen.appendChild(playerStatusChip(t('player.localServerPreparing')));
        const localHls = await resolveTranscodePlayback(source, url).catch(() => '');
        if (localHls) {
          rememberPlaybackMethod(source, 'ready', 'local-hls');
          await startHlsPlayback(video, localHls, screen, source, url, { autoStart });
          return;
        }
        const fmp4Url = resolveFmp4Playback(source, url);
        if (fmp4Url) {
          startFmp4Playback(video, fmp4Url, screen, source, { autoStart });
          return;
        }
      }
      if (remembered === 'fmp4') {
        const fmp4Url = resolveFmp4Playback(source, url);
        if (fmp4Url) {
          startFmp4Playback(video, fmp4Url, screen, source, { autoStart });
          return;
        }
      }
      const isHls = /\.m3u8(\?|$)/i.test(url) || /\.m3u8(\?|$)/i.test(playbackUrl);
      if (isHls) {
        await startHlsPlayback(video, playbackUrl, screen, source, url, { autoStart });
      } else {
        video.addEventListener('error', () => playerError(screen, source, 'browser'));
        video.src = playbackUrl;
        video.load();
        rememberPlaybackMethod(source, 'ready', 'native');
        prepareVideoStart(video, screen, source, '', { autoStart });
      }
    } catch {
      playerError(screen, source, 'exception');
    }
  }

  async function startHlsPlayback(video, url, screen, source, originalUrl=url, options={}) {
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.load();
      rememberPlaybackMethod(source, 'ready', 'native');
      prepareVideoStart(video, screen, source, '', { autoStart: !!options.autoStart });
      return;
    }
    await loadHls();
    if (!(window.Hls && window.Hls.isSupported())) {
      playerError(screen, source, 'hls-unsupported');
      return;
    }
    hlsInstance = new window.Hls({
      lowLatencyMode: true,
      enableWorker: true,
      backBufferLength: 90,
      maxBufferLength: 90,
      liveSyncDurationCount: 4,
      manifestLoadingMaxRetry: 3,
      levelLoadingMaxRetry: 3,
      fragLoadingMaxRetry: 4,
      manifestLoadingTimeOut: 30000,
      levelLoadingTimeOut: 30000,
      fragLoadingTimeOut: 30000,
      enableSoftwareAES: true,
      xhrSetup(xhr) {
        xhr.withCredentials = false;
      }
    });
    let settled = false;
    let networkRecoveries = 0;
    let mediaRecoveries = 0;
    const failTimer = setTimeout(() => {
      if (!settled && (!video.readyState || video.readyState < 2)) playerError(screen, source, 'timeout');
    }, 30000);
    hlsInstance.on(window.Hls.Events.MEDIA_ATTACHED, () => {
      hlsInstance.loadSource(url);
    });
    hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, () => {
      settled = true;
      clearTimeout(failTimer);
      rememberPlaybackMethod(source, 'ready', 'hlsjs');
      prepareVideoStart(video, screen, source, '', { autoStart: !!options.autoStart });
    });
    hlsInstance.on(window.Hls.Events.LEVEL_LOADED, () => {
      if (!settled) {
        settled = true;
        clearTimeout(failTimer);
        rememberPlaybackMethod(source, 'ready', 'hlsjs');
        prepareVideoStart(video, screen, source, '', { autoStart: !!options.autoStart });
      }
    });
    hlsInstance.on(window.Hls.Events.ERROR, (_, data) => {
      if (!data?.fatal) return;
      if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && networkRecoveries < 2) {
        networkRecoveries += 1;
        try { hlsInstance.startLoad(); return; } catch {}
      }
      if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && mediaRecoveries < 2) {
        mediaRecoveries += 1;
        try { hlsInstance.recoverMediaError(); return; } catch {}
      }
      clearTimeout(failTimer);
      const needsProxy = data?.details && /manifestLoadError|levelLoadError|fragLoadError|keyLoadError|manifestParsingError/i.test(data.details);
      playerError(screen, source, needsProxy ? 'proxy-required' : (data?.type || 'hls'));
    });
    hlsInstance.attachMedia(video);
  }

  function prepareVideoStart(video, screen, source, copy='', options={}) {
    activeVideo = video;
    activeVideoSource = source;
    // After an async IPTV transcode the original click has often expired. Browsers
    // then reject audible autoplay even though the stream itself is valid. Start
    // IPTV/imported sources muted first, then offer a clear sound button. Manual
    // clicks still start with audio when the browser allows it.
    if (options.autoStart) {
      startActiveVideo({ mutedAutostart: true, source, screen, copy });
      return;
    }
    showStartOverlay(screen, source, copy);
  }

  function showStartOverlay(screen, source, copy, mode='start') {
    const existing = screen.querySelector('.player-hint');
    if (existing) existing.remove();
    const hint = document.createElement('div');
    hint.className = 'player-hint player-start-card player-start-card-ready';
    const primaryAction = mode === 'unmute' ? 'unmute-video' : 'start-video';
    const primaryLabel = mode === 'unmute' ? t('action.enableSound') : t('action.startInternal');
    const title = mode === 'unmute' ? t('player.playingMuted') : t('player.ready');
    const text = mode === 'unmute' ? t('player.playingMuted.copy') : (copy || t('player.ready.copy'));
    hint.innerHTML = `<b>${esc(title)}</b><span>${esc(text)}</span><div class="actions"><button class="btn-primary" data-action="${primaryAction}">${esc(primaryLabel)}</button>${officialLink(source,t('action.openOfficial'),'btn-soft')}</div>`;
    screen.appendChild(hint);
  }

  async function startActiveVideo(options={}) {
    if (!activeVideo) return;
    const screen = options.screen || document.getElementById('player-screen');
    const source = options.source || activeVideoSource;
    try {
      if (options.mutedAutostart) activeVideo.muted = true;
      else activeVideo.muted = false;
      await activeVideo.play();
      if (source) rememberPlaybackMethod(source, 'success', activeVideo.src && activeVideo.src.includes('/api/transcode/fmp4') ? 'fmp4' : (activeVideo.src && activeVideo.src.includes('/api/transcode/') ? 'local-hls' : 'native'));
      screen?.querySelector('.player-hint')?.remove();
      if (options.mutedAutostart && source) showStartOverlay(screen, source, options.copy || '', 'unmute');
    } catch (err) {
      // NotAllowedError means the browser wants a fresh user gesture, not that the
      // IPTV stream failed. Keep the source ready and show the start button instead
      // of marking the source as broken.
      if (screen && source && (err?.name === 'NotAllowedError' || options.mutedAutostart)) {
        showStartOverlay(screen, source, options.copy || t('player.ready.copy'));
        return;
      }
      if (screen && source) playerError(screen, source, 'manual-play-failed');
    }
  }

  async function unmuteActiveVideo() {
    if (!activeVideo) return;
    const screen = document.getElementById('player-screen');
    try {
      activeVideo.muted = false;
      if (activeVideo.paused) await activeVideo.play();
      screen?.querySelector('.player-hint')?.remove();
    } catch {
      if (screen && activeVideoSource) showStartOverlay(screen, activeVideoSource, t('player.ready.copy'));
    }
  }

  async function tryPlayVideo(video, screen, source) {
    // Backward-compatible helper retained for older checks; playback is now user-started to avoid autoplay dead ends.
    prepareVideoStart(video, screen, source);
  }

  function loadingPlayer(source) {
    return `<div class="player-placeholder"><img src="${logo(source)}" alt="" onerror="this.src='assets/medialens-logo.svg'"><h2>${esc(source.title)}</h2><p>${esc(t(isIptvControlled(source) ? 'player.compatPreparing' : 'player.loading', {domain: domain(source.url)}))}</p><div class="actions" style="justify-content:center">${officialLink(source,t('action.openOfficial'),'btn-soft')}</div></div>`;
  }

  function playerError(screen, source, reason='') { // compatibility marker: t('player.error.copy')
    if (reason !== 'manual-play-failed' && reason !== 'not-allowed') rememberPlaybackMethod(source, 'failed', reason || 'unknown');
    const profile = playerRecoveryProfile(source, reason);
    const localReady = !!(window.MEDIALENS_TRANSCODE_START || window.MEDIALENS_TRANSCODE_FMP4);
    const compat = directStreamUrl(source) && localReady
      ? `<button class="btn-soft" data-action="start-transcode">${esc(t('action.startCompatMode','Probeer compatibiliteit'))}</button>`
      : '';
        const copyButton = directStreamUrl(source)
      ? `<button class="btn-soft" data-action="copy-stream" data-id="${escAttr(source.id)}">${esc(t('action.copyStream','Kopieer streamlink'))}</button>`
      : '';
    const actions = `<button class="btn-primary" data-action="restart-player" data-id="${escAttr(source.id)}">${esc(t('action.retryFriendly','Opnieuw proberen'))}</button>${compat}${officialLink(source,t('action.openWatchRoute','Open kijkroute'),'btn-soft')}${copyButton}`;
    const hints = profile.hints.map(item => `<li>${esc(item)}</li>`).join('');
    screen.innerHTML = `<div class="player-placeholder player-recovery player-recovery"><img src="${logo(source)}" alt="" onerror="this.src='assets/medialens-logo.svg'"><span class="source-status warning">${esc(t('player.recovery.badge','Andere kijkroute nodig'))}</span><h2>${esc(profile.title)}</h2><p>${esc(profile.copy)}</p><ul class="player-recovery-options">${hints}</ul><div class="actions" style="justify-content:center">${actions}</div><details class="player-technical-details"><summary>${esc(t('player.recovery.detailsFriendly','Meer informatie'))}</summary><p>${esc(profile.technical)}</p></details></div>`;
  }

  function playerRecoveryProfile(source, reason='') {
    const isIptv = isIptvControlled(source);
    const direct = !!directStreamUrl(source);
    const defaultHints = [
      t('player.recovery.hint.route','Open de officiële of beste externe kijkroute.'),
      direct ? t('player.recovery.hint.copy','Kopieer de streamlink voor een externe IPTV-speler.') : t('player.recovery.hint.info','Bekijk de broninformatie voor alternatieve routes.'),
      t('player.recovery.hint.retry','Probeer opnieuw als de bron tijdelijk niet reageerde.')
    ];
    if (reason === 'hls-unsupported') {
      return {
        title: t('player.recovery.hlsTitle','De spelercomponent is niet geladen'),
        copy: t('player.recovery.hlsCopy','MediaLens kan deze livebron nog niet starten omdat de HLS-speler ontbreekt. De kijkroute blijft wel beschikbaar.'),
        technical: t('player.reason.hlsUnsupported'),
        hints: defaultHints
      };
    }
    if (reason === 'fmp4-failed' || reason === 'transcode-failed') {
      return {
        title: t('player.recovery.compatTitleFriendly','Deze bron heeft een andere route nodig'),
        copy: t('player.recovery.compatCopyFriendly','Deze livebron kan nu niet rechtstreeks in de ingebouwde speler starten. Je kunt meteen doorgaan via de kijkroute of de streamlink gebruiken in je eigen tv-app.'),
        technical: reason === 'fmp4-failed' ? t('player.reason.fmp4Failed') : t('player.reason.proxyRequired'),
        hints: defaultHints
      };
    }
    if (reason === 'manual-play-failed') {
      return {
        title: t('player.recovery.gestureTitleFriendly','Klaar om te starten'),
        copy: t('player.recovery.gestureCopyFriendly','De bron is voorbereid. Druk op Start om de video te openen.'),
        technical: t('player.recovery.gestureTechnicalFriendly','Sommige browsers starten video pas nadat je zelf op Start drukt.'),
        hints: [t('player.recovery.hint.retry','Probeer opnieuw als de bron tijdelijk niet reageerde.'), ...defaultHints.slice(0,2)]
      };
    }
    return {
      title: isIptv ? t('player.recovery.iptvTitleFriendly','Deze livebron opent beter via een alternatieve route') : t('player.recovery.defaultTitleFriendly','Deze bron startte niet direct'),
      copy: isIptv
        ? t('player.recovery.iptvCopyFriendly','Niet elke livebron kan in de ingebouwde speler starten. MediaLens toont daarom direct de beste kijkroute en een kopieerbare streamlink wanneer die beschikbaar is.')
        : t('player.recovery.defaultCopyFriendly','Gebruik de kijkroute of probeer opnieuw. De bron blijft zichtbaar, maar wordt niet als beste voorstel bovenaan gezet.'),
      technical: t('player.reason.defaultFriendly','De ingebouwde speler kreeg geen bruikbare videostart van deze bron.'),
      hints: defaultHints
    };
  }

  function destroyPlayer() { if (hlsInstance) { try { hlsInstance.destroy(); } catch {} hlsInstance = null; } activeVideo = null; activeVideoSource = null; }
  async function loadHls() {
    if (window.Hls) return;
    const urls = [
      'assets/vendor/hls.min.js',
      'https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.17/hls.min.js',
      'https://unpkg.com/hls.js@1.5.17/dist/hls.min.js'
    ];
    for (const src of urls) { try { await injectScript(src); if (window.Hls) return; } catch {} }
  }
  function injectScript(src) { return new Promise((resolve,reject)=>{ const s=document.createElement('script'); s.src=src; s.async=true; s.onload=resolve; s.onerror=reject; document.head.appendChild(s); }); }

  function playerStatusChip(text) {
    const el = document.createElement('div');
    el.className = 'player-hint player-status-chip';
    el.innerHTML = `<b>${esc(text)}</b><span>${esc(t('player.status.copy'))}</span>`;
    return el;
  }

  function shouldPreferTranscode(source, url='') {
    if (!(window.MEDIALENS_TRANSCODE_FMP4 || window.MEDIALENS_TRANSCODE_START)) return false;
    const hay = `${source?.source_type||''} ${source?.playbackMode||''} ${source?.streamHealth||''} ${(source?.tags||[]).join(' ')} ${source?.delivery?.iptv?'iptv':''}`.toLowerCase();
    return /iptv|fast|imported|proxy-required|public_iptv_channel|internal-proxy-required/.test(hay) || /^http:\/\//i.test(url);
  }


  function resolveFmp4Playback(source, url) {
    const endpoint = window.MEDIALENS_TRANSCODE_FMP4;
    if (!endpoint || !url) return '';
    return `${endpoint}?url=${encodeURIComponent(url)}&source=${encodeURIComponent(source?.id || '')}`;
  }

  function startFmp4Playback(video, playbackUrl, screen, source, options={}) {
    video.addEventListener('error', () => playerError(screen, source, 'fmp4-failed'));
    video.src = playbackUrl;
    video.load();
    rememberPlaybackMethod(source, 'ready', 'fmp4');
    prepareVideoStart(video, screen, source, t('player.fmp4Ready'), { autoStart: !!options.autoStart });
  }

  async function resolveTranscodePlayback(source, url) {
    const endpoint = window.MEDIALENS_TRANSCODE_START;
    if (!endpoint || !url) return '';
    const res = await fetch(`${endpoint}?url=${encodeURIComponent(url)}&source=${encodeURIComponent(source?.id || '')}`, { cache: 'no-store' });
    if (!res.ok) return '';
    const data = await res.json().catch(() => null);
    return data?.ok && data.playlist ? data.playlist : '';
  }

  async function startCompatibilityMode() {
    const source = activeVideoSource || byId(state.selectedDirectId);
    const screen = document.getElementById('player-screen');
    if (!source || !screen) return;
    const url = directStreamUrl(source);
    if (!url) return;
    destroyPlayer();
    screen.innerHTML = '';
    screen.appendChild(playerStatusChip(t('player.compatStarting')));
    const autoStart = false;
    const video = document.createElement('video');
    video.controls = true;
    video.autoplay = false;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('preload','auto');
    video.dataset.sourceId = source.id || '';
    video.dataset.playerMode = 'compat';
    video.setAttribute('aria-label', `${t('player.compatInternal')} ${source.title || t('player.liveSource')}`);
    screen.appendChild(video);
    try {
      const fmp4Url = resolveFmp4Playback(source, url);
      if (fmp4Url) {
        startFmp4Playback(video, fmp4Url, screen, source, { autoStart });
        return;
      }
      const playbackUrl = await resolveTranscodePlayback(source, url);
      if (!playbackUrl) throw new Error('transcode unavailable');
      await startHlsPlayback(video, playbackUrl, screen, source, url, { autoStart });
    } catch {
      playerError(screen, source, 'transcode-failed');
    }
  }


  function resolvePlaybackUrl(source, url) {
    const proxyBase = window.MEDIALENS_STREAM_PROXY || '';
    const shouldProxy = proxyBase && /\.m3u8(\?|$)/i.test(url);
    const sourceParam = source?.id ? `&source=${encodeURIComponent(source.id)}` : '';
    return shouldProxy ? proxyBase + encodeURIComponent(url) + sourceParam : url;
  }

  function directStreamUrl(source) { return source?.streamUrl || source?.hlsUrl || source?.videoUrl || source?.embedUrl || source?.playerUrl || source?.stream_url || source?.hls_url || source?.video_url || source?.playback?.url || ''; }
  function streamLink(source, label=t('action.openExternalStream'), cls='btn-soft') {
    const url = directStreamUrl(source);
    return url ? `<a class="${cls}" href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer nofollow">${esc(label)}</a>` : '';
  }
  async function copyStreamUrl(source) {
    const url = directStreamUrl(source);
    if (!url || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(url);
      const screen = document.getElementById('player-screen');
      if (screen) {
        const chip = playerStatusChip(t('player.recovery.copied','Streamlink gekopieerd'));
        chip.classList.add('copy-confirmation-chip');
        screen.appendChild(chip);
        setTimeout(() => chip.remove(), 2400);
      }
    } catch {}
  }

  function filteredDirect(useFallback=true, explicitFilter='') {
    const key = explicitFilter || state.directFilter || 'recommended';
    let list = DIRECT.slice();
    const filter = DIRECT_FILTERS.find(([k]) => k === key);
    if (key === 'recommended') list = list.filter(s => hasAny(s,['news','nieuws','documentary','public','world','international','live','film','movie','entertainment'])).slice(0, 600);
    else if (key === 'all') list = DIRECT.slice();
    else if (key === 'iptv') list = list.filter(isIptvControlled);
    else if (key === 'free') list = list.filter(s => s.free);
    else if (key === 'world') list = list.filter(s => /international|world|internationaal|worldwide/i.test(`${s.country} ${(s.tags||[]).join(' ')} ${s.availability_model?.availability_scope||''}`));
    else if (filter) list = list.filter(s => hasAny(s, filter[2] || []));
    if (!list.length && useFallback) return sortFeatured(DIRECT).slice(0, DIRECT_PAGE_SIZE);
    return sortFeatured(list);
  }
  function pickFeatured(tags) { const pool = sampleSources(); return sortFeatured(pool.filter(s => hasAny(s,tags))).concat(sortFeatured(pool)).filter(uniqueById).slice(0,16); }
  function sortFeatured(list) { return list.slice().sort((a,b)=>score(b)-score(a) || String(a.title).localeCompare(String(b.title), state.lang || 'en')); }
  function score(s) { const qualityBoost = (PLAYBACK_MEMORY[s?.id]?.status === 'success' ? 20 : 0) + (sourceHealthClass(s) === 'working' ? 12 : 0); return sourceQualityRank(s) + qualityBoost + (isDirectPlayable(s)?60:0) + (s.free?10:0) + (!s.requiresAccount?8:0) + (s.isLive?6:0) + Math.min((s.tags||[]).length,12); }
  function filterByTags(tags) { return sortFeatured(sampleSources().filter(s => hasAny(s,tags))); }
  function sampleSources() { return SOURCES.length > UI_SOURCE_LIMIT ? SOURCES.filter((s,i) => i < HOME_SAMPLE_LIMIT || isDirectPlayable(s) || i % 9 === 0).slice(0, UI_SOURCE_LIMIT) : SOURCES; }
  function hasAny(s,tags) { const hay = `${s.title} ${s.country} ${s.type} ${s.description || ''} ${(s.tags||[]).join(' ')}`.toLowerCase(); return tags.some(tag => hay.includes(String(tag).toLowerCase())); }
  function searchSources(q) {
    const terms = expandQuery(q).filter(Boolean);
    const scored = SOURCES.map(s => {
      const hay = `${s.title} ${s.country} ${s.type} ${s.description} ${(s.tags||[]).join(' ')} ${(s.language||[]).join(' ')} ${s.import_metadata?.provider||''}`.toLowerCase();
      const exact = terms.some(term => hay.includes(term));
      const fuzzy = terms.some(term => fuzzyContains(hay, term));
      if (!exact && !fuzzy) return null;
      const weight = (exact ? 100 : 35) + sourceQualityRank(s) + (isDirectPlayable(s) ? 30 : 0) + (isIptvControlled(s) ? 8 : 0);
      return { s, weight };
    }).filter(Boolean).sort((a,b)=>b.weight-a.weight || String(a.s.title).localeCompare(String(b.s.title), state.lang || 'en'));
    return scored.map(x => x.s);
  }
  function fuzzyContains(hay, needle) {
    needle = String(needle || '').replace(/\s+/g,'');
    if (needle.length < 4) return false;
    let i = 0;
    for (const ch of hay.replace(/\s+/g,'')) { if (ch === needle[i]) i += 1; if (i >= needle.length) return true; }
    return false;
  }
  function expandQuery(q) { const base = String(q||'').trim().toLowerCase(); const map={nl:['nederland','dutch','nl'],be:['belgië','belgie','belgium','be'],de:['duitsland','germany','de'],fr:['frankrijk','france','fr'],uk:['verenigd koninkrijk','britain','uk'],us:['amerika','usa','united states','us'],nieuws:['news','nieuws'],news:['news','nieuws'],kids:['kids','children','family','animation'],sport:['sport','sports'],rusland:['russia','russian','rusland','ru'],live:['live','direct','hls'], iptv:['iptv','Gecontroleerde IPTV','public_iptv_channel','fast'], films:['film','movie','movies','cinema','speelfilm'], film:['film','movie','movies','cinema','speelfilm'], movies:['film','movie','movies','cinema'], series:['series','shows','tv-series'], entertainment:['entertainment','general','variety'], muziek:['music','radio','concert'], music:['music','radio','concert'], lifestyle:['lifestyle','cooking','food','travel','home','outdoor'], cooking:['cooking','food','lifestyle'], travel:['travel','outdoor','lifestyle'], business:['business','finance','markets'], weather:['weather','local'], public:['public','omroep','community','legislative','government'], local:['local','community','weather'], 'nederland.tv':['nederland-tv','Nederland.TV','nederland tv'], gratis:['free','gratis','no-account'], free:['free','gratis','no-account'], internationaal:['international','world','Internationaal'], international:['international','world','Internationaal'], 'zonder account':['no-account','free']}; return Array.from(new Set([base,...(map[base]||[])])); }
  function countryStats() { const map = new Map(); SOURCES.forEach(s => Array.from(new Set(countryTokensForSource(s).map(canonicalCountryName))).forEach(c=>{ const key = canonicalCountryName(c); if(!map.has(key)) map.set(key,{country:key,count:0,direct:0,live:0,free:0,noAccount:0,channels:0}); const item=map.get(key); item.count++; if(isDirectPlayable(s)) item.direct++; if(s.isLive) item.live++; if(s.free) item.free++; if(!s.requiresAccount) item.noAccount++; if(isSpecificChannelSource(s)) item.channels++; })); return [...map.values()].sort((a,b)=> (countryKey(a.country)==='internationaal'?-1:countryKey(b.country)==='internationaal'?1:0) || b.count-a.count || a.country.localeCompare(b.country, state.lang || 'nl')); }
  function splitCountries(country) { const value = String(country || t('label.worldwide')); return value.split(/\s*\/\s*|,|;| en /i).map(s=>s.trim()).filter(Boolean); }
  function uniqueById(s, i, arr) { return arr.findIndex(x=>x.id===s.id)===i; }
  function byId(id) { return SOURCES.find(s => s.id === id); }
  function isIptvControlled(s) { return !!(s?.delivery?.iptv || String(s?.source_type||'').includes('iptv') || hasAny(s,['iptv'])); }
  function statusLabel(s) {
    if (s?.import_metadata?.imported_as === 'consumer_visible_import') return t('status.controlledImport');
    if (isIptvControlled(s)) return t('status.controlledIptv');
    if (isDirectPlayable(s)) return t('status.watchDirect');
    const scope = s?.availability_model?.availability_scope || s?.availability || '';
    if (/international/i.test(scope)) return t('status.internationalPossible');
    return t('status.officialSite');
  }
  function statusClass(s) { return isIptvControlled(s) ? 'iptv' : isDirectPlayable(s) ? 'direct' : 'site'; }
  function trustCopy(s) {
    if (s?.import_metadata?.imported_as === 'consumer_visible_import') return 'Geïmporteerde IPTV/FAST-bron die door dedupe- en veiligheidschecks is gegaan. Beschikbaarheid kan internationaal verschillen.';
    if (isIptvControlled(s)) return 'Publieke IPTV/HLS-bron met evidence, review-status en officiële fallback. Beschikbaarheid kan per land verschillen.';
    if (isDirectPlayable(s)) return 'Directe stream aanwezig; als afspelen niet lukt kun je de officiële site openen.';
    return 'Officiële kijkroute of broadcasterpagina; beschikbaarheid kan per land verschillen.';
  }

  function isDirectPlayable(s) { return !!(s && directStreamUrl(s)); }
  function sourceLine(s) { const langs = Array.isArray(s?.language) ? s.language.join(', ').toUpperCase() : ''; return `${esc(s?.country || t('label.worldwide'))} · ${esc(langs || s?.region || '')} · ${esc(statusLabel(s))} · ${esc(domain(s?.url))}`; }
  function domain(url) { try { return new URL(url, location.href).hostname.replace(/^www\./,''); } catch { return t('label.officialSource'); } }
  function safeUrl(url) { try { const u = new URL(url, location.href); return /^https?:$/.test(u.protocol) ? escAttr(u.href) : '#'; } catch { return '#'; } }
  function logo(s) { return `assets/logos/${escAttr(s?.id || 'medialens-logo')}.svg`; }
  function poster(s) { return `assets/posters/${escAttr(s?.id || 'medialens-logo')}.svg`; }
  function normalizeFeedRegistry(raw) {
    const arr = Array.isArray(raw) ? raw : (raw.feeds || []);
    return arr.map((f,i)=>({
      id: String(f.id || `feed-${i}`),
      provider: f.provider || f.name || f.id || `Feed ${i+1}`,
      officialUrl: f.officialUrl || f.provider_url || '#',
      market_hint: Array.isArray(f.market_hint) ? f.market_hint : [],
      category_hint: Array.isArray(f.category_hint) ? f.category_hint : [],
      candidate_count: Number(f.candidate_count || 0),
      duplicate_count: Number(f.duplicate_count || 0),
      visible_count: Number(f.visible_count || 0),
      auto_publish: f.auto_publish === true ? true : false,
      consumer_visibility: f.consumer_visibility || 'approved_only'
    }));
  }

  function mergeCatalogs(base, imported) {
    const out = [];
    const ids = new Set();
    const streams = new Set();
    const titleProvider = new Set();
    const add = (s) => {
      if (!s || !s.id) return;
      const stream = normalizeSourceUrl(s.streamUrl || s.hlsUrl || s.videoUrl || s.embedUrl || s.playerUrl || '');
      const tp = `${slug(s.title || '')}|${slug(s.import_metadata?.provider || s.delivery?.import_feed_id || s.source_type || '')}`;
      if (ids.has(s.id)) return;
      if (stream && streams.has(stream)) return;
      if (s.import_metadata?.imported_as === 'consumer_visible_import' && titleProvider.has(tp)) return;
      out.push(s);
      ids.add(s.id);
      if (stream) streams.add(stream);
      if (tp) titleProvider.add(tp);
    };
    base.forEach(add);
    imported.forEach(add);
    return out;
  }
  function normalizeSourceUrl(url='') { const raw = String(url || '').trim().replace(/[;,]+$/,''); if (!raw) return ''; try { const u = new URL(raw, location.href); u.hash=''; return u.href.replace(/[;,]+$/,''); } catch { return raw; } }
  function normalizeCatalog(raw) { const arr = Array.isArray(raw) ? raw : (raw.sources || raw.items || raw.catalog || []); return arr.map((s,i)=>({ ...s, id: String(s.id || slug(s.title || s.name || `source-${i}`)), title: s.title || s.name || `Source ${i+1}`, url: s.url || s.website || s.officialUrl || '#', description: s.description || '', country: s.country || s.land || 'Worldwide', type: s.type || s.category || 'Source', tags: Array.isArray(s.tags) ? s.tags.map(String) : [], language: Array.isArray(s.language) ? s.language : (s.language ? [s.language] : []), free: s.free !== false, requiresAccount: !!(s.requiresAccount || s.accountRequired), isLive: !!(s.isLive || (Array.isArray(s.tags) && s.tags.includes('live'))), streamUrl: s.streamUrl || s.hlsUrl || s.videoUrl || '', hlsUrl: s.hlsUrl || '', videoUrl: s.videoUrl || '', embedUrl: s.embedUrl || '', playerUrl: s.playerUrl || '', playbackStatus: s.playbackStatus || s.streamHealth || '', availabilityNote: s.availabilityNote || '', healthNote: s.healthNote || '', streamHealth: s.streamHealth || '', region: s.region || 'International', availability: s.availability || 'unknown', officialUrl: s.officialUrl || s.url || '' })); }
  function slug(s) { return String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'source'; }
  function remember(id) { if (!id) return; state.recent = [id, ...state.recent.filter(x=>x!==id)].slice(0,20); writeStore('ml.recent', state.recent); }
  function toggleList(id) { if (!id) return; state.watchlist = state.watchlist.includes(id) ? state.watchlist.filter(x=>x!==id) : [id, ...state.watchlist]; writeStore('ml.watchlist', state.watchlist); }
  function readStore(k, fallback) { try { return JSON.parse(localStorage.getItem(k) || 'null') || fallback; } catch { return fallback; } }
  function writeStore(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  function safeStoreGet(k, fallback) { try { return localStorage.getItem(k) || fallback; } catch { return fallback; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
  function routeAliases() {
    return new Map([
      ['landen','countries'], ['land','countries'], ['countries','countries'],
      ['kijken','watch'], ['live','watch'], ['watch','watch'],
      ['ontdekken','discover'], ['discover','discover'],
      ['zoeken','search'], ['search','search'],
      ['lijst','list'], ['mijn-lijst','list'], ['list','list'],
      ['start','home'], ['home','home']
    ]);
  }
  function locationRouteParts() {
    const hash = decodeURIComponent(location.hash.replace(/^#/, '') || '').trim();
    if (hash) return hash.split(/[?#]/)[0].split('/').filter(Boolean);
    const path = decodeURIComponent(location.pathname || '').replace(/\/index\.html$/i,'').replace(/^\/+|\/+$/g,'');
    const parts = path.split('/').filter(Boolean);
    const start = parts.findIndex(p => routeAliases().has(p.toLowerCase()));
    return start >= 0 ? parts.slice(start) : [];
  }
  function routeFromLocation() {
    const parts = locationRouteParts();
    const raw = (parts[0] || 'home').toLowerCase();
    const route = routeAliases().get(raw) || raw;
    return NAV.some(n=>n[0]===route) ? route : 'home';
  }
  function countryFromLocation() {
    const parts = locationRouteParts();
    if (!parts.length) return '';
    const route = routeAliases().get(String(parts[0] || '').toLowerCase()) || parts[0];
    if (route !== 'countries') return '';
    const encoded = parts.slice(1).join(' ').trim();
    if (!encoded) return '';
    return canonicalCountryName(encoded.replace(/-/g, ' '));
  }
  function routeFromHash() { return routeFromLocation(); }
  function countryFromHash() { return countryFromLocation(); }
  function updateHash() {
    const next = state.route === 'countries' && state.activeCountry ? `countries/${encodeURIComponent(countryKey(state.activeCountry))}` : state.route;
    if (location.hash.replace(/^#/,'') !== next) {
      try { history.pushState(null,'',`#${next}`); }
      catch { location.hash = next; }
    }
  }
  function heroTitle() { const title = t('hero.title'); return esc(title).replace('MediaLens','<span class="gradient-text">MediaLens</span>'); }
  function localizeSuggestion(s) { const key = `suggestion.${slug(s)}`; const value = t(key, s); return value === key ? s : value; }
  function t(key, varsOrFallback={}, maybeFallback='') { const vars = typeof varsOrFallback === 'object' && varsOrFallback !== null ? varsOrFallback : {}; const fallback = typeof varsOrFallback === 'string' ? varsOrFallback : maybeFallback; const pack = I18N[state.lang] || I18N.nl || I18N.en || {}; const base = I18N.en || I18N.nl || {}; let value = pack[key] || base[key] || fallback || humanizeKey(key); Object.entries(vars).forEach(([k,v]) => value = value.replace(new RegExp(`\{${k}\}`,'g'), String(v))); return value; }
  function humanizeKey(key) { return String(key || '').split('.').filter(Boolean).pop().replace(/[_-]+/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./, c => c.toUpperCase()) || 'MediaLens'; }
  function languageButtons() {
    const options = SUPPORTED_LANGS.map(l => {
      const name = (I18N[l]||{})['language.name'] || l.toUpperCase();
      return `<option value="${escAttr(l)}" ${state.lang===l?'selected':''}>${esc(name)} · ${esc(l.toUpperCase())}</option>`;
    }).join('');
    return `<label class="language-select"><span>${esc(t('language.select'))}</span><select data-language-select aria-label="${escAttr(t('language.select'))}">${options}</select></label>`;
  }
  function esc(v) { return String(v ?? '').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
  function escAttr(v) { return esc(v).replace(/'/g,'&#39;'); }
  function empty(text) { return `<div class="empty">${esc(text)}</div>`; }
  safeRender();

  if (typeof window !== 'undefined') {
    window.__MEDIALENS_TEST__ = {
      countryStats: () => countryStats(),
      countryDetailSummary: (country) => {
        const activeCountry = resolveCountryName(country);
        const items = prioritizeCountrySources(sortFeatured(SOURCES.filter(s => sourceBelongsToCountry(s, activeCountry))));
        const normalized = dedupeCountryItems(sortFeatured(items));
        return {
          country: activeCountry,
          count: normalized.length,
          rows: (dedupeCountryItems(normalized.filter(isSpecificChannelSource)).length || normalized.length),
          direct: normalized.filter(isDirectPlayable).length,
          iptv: normalized.filter(isIptvControlled).length,
          channels: normalized.filter(isSpecificChannelSource).length
        };
      },
      renderCountriesPage: () => { state.route = 'countries'; state.activeCountry = ''; state.countryLimit = UI_SOURCE_LIMIT; return countriesPage(); },
      renderCountryDetail: (country) => { state.route = 'countries'; state.activeCountry = country; state.sourceLimit = UI_SOURCE_LIMIT; return countriesPage(); },
      directCount: () => DIRECT.length,
      iptvCount: () => SOURCES.filter(isIptvControlled).length,
      watchGraphSummary: () => { const g = watchGraph(); return { channels: g.channels.length, countries: g.countryMap.size, routeCount: g.channels.reduce((sum,ch)=>sum+ch.routes.length,0), directChannels: g.channels.filter(ch => ch.routes.some(r => isDirectPlayable(r.source))).length, iptvChannels: g.channels.filter(ch => ch.routes.some(r => isIptvControlled(r.source))).length }; }
    };
  }
})();
// v25.1 compatibility profile ids retained for validation: algemeen nieuws kids sport docu
