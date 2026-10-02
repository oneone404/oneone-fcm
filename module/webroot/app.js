    /* =========================================================================
     * Localization
     * Strings live in webroot/lang/<code>.json and lang/index.json lists what
     * ships, so adding a language is one file plus one line - no edit to this
     * page. The markup itself carries English, so the UI stays readable even
     * when the dictionaries cannot be fetched at all.
     * ====================================================================== */
    const LANG_KEY = 'fcm_ui_lang';
    const LANGS_KEY = 'fcm_ui_langs';
    const DEFAULT_LANG = 'en';
    let LANG = DEFAULT_LANG;
    let LANGS = (function() {
        try {
            const cached = restore(LANGS_KEY);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed) && parsed.length) return parsed;
            }
        } catch (e) {}
        return [
            { code: 'vi', name: 'Tiếng Việt' },
            { code: 'en', name: 'English' }
        ];
    })();
    const DICT = {};

    function store(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* storage may be unavailable */ }
    }

    function restore(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    async function loadJson(path) {
        const res = await fetch(path, { cache: 'no-cache' });
        if (!res.ok) throw new Error(path + ': HTTP ' + res.status);
        return res.json();
    }

    // Dictionaries are cached in memory and localStorage so UI is translated instantly (0ms)
    async function loadDict(code) {
        if (!code) return null;
        if (!DICT[code]) {
            const cached = restore('fcm_lang_' + code);
            if (cached) {
                try {
                    DICT[code] = JSON.parse(cached);
                } catch (e) {}
            }
        }
        try {
            const data = await loadJson('lang/' + code + '.json');
            DICT[code] = data;
            store('fcm_lang_' + code, JSON.stringify(data));
            return data;
        } catch (e) {
            if (DICT[code]) return DICT[code];
            console.warn('i18n: cannot load ' + code, e);
            return null;
        }
    }

    function initCachedI18n() {
        LANG = detectLang();
        ['en', LANG].forEach(code => {
            if (!code || DICT[code]) return;
            const cached = restore('fcm_lang_' + code);
            if (cached) {
                try { DICT[code] = JSON.parse(cached); } catch (e) {}
            }
        });
        renderLangOptions();
        applyI18n();
    }

    function t(key, vars) {
        const table = DICT[LANG] || {};
        const base = DICT[DEFAULT_LANG] || {};
        let str = (key in table) ? table[key] : ((key in base) ? base[key] : key);
        if (vars) {
            Object.keys(vars).forEach(k => {
                str = str.split('{' + k + '}').join(vars[k]);
            });
        }
        return str;
    }

    function detectLang() {
        const saved = restore(LANG_KEY);
        if (saved && (LANGS.some(l => l.code === saved) || restore('fcm_lang_' + saved))) return saved;
        const nav = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
        const exact = LANGS.find(l => nav === l.code.toLowerCase());
        const base = LANGS.find(l => nav.split('-')[0] === l.code.toLowerCase());
        return (exact || base || { code: DEFAULT_LANG }).code;
    }

    function renderLangOptions() {
        const sel = document.getElementById('langSelect');
        if (!sel) return;
        sel.innerHTML = LANGS.map(l =>
            '<option value="' + l.code + '">' + l.name + '</option>').join('');
        sel.value = LANG;
        const langSub = document.getElementById('langSubLabel');
        if (langSub) {
            const cur = LANGS.find(l => l.code === LANG);
            langSub.textContent = cur ? cur.name : (LANG === 'vi' ? 'Tiếng Việt' : 'English');
        }
    }

    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.getAttribute('data-i18n'));
        });
        document.querySelectorAll('[data-i18n-html]').forEach(el => {
            el.innerHTML = t(el.getAttribute('data-i18n-html'));
        });
        document.querySelectorAll('[data-i18n-ph]').forEach(el => {
            el.placeholder = t(el.getAttribute('data-i18n-ph'));
        });
        document.documentElement.lang = LANG;
        const sel = document.getElementById('langSelect');
        if (sel) sel.value = LANG;
        const langSub = document.getElementById('langSubLabel');
        if (langSub) {
            const cur = LANGS.find(l => l.code === LANG);
            langSub.textContent = cur ? cur.name : (LANG === 'vi' ? 'Tiếng Việt' : 'English');
        }
        updateThemeUI(restore(THEME_KEY) || 'system');
        document.documentElement.classList.remove('i18n-pending');
    }

    async function setLang(code) {
        LANG = code;
        store(LANG_KEY, code);
        // Instant 0ms apply from memory or localStorage cache if available
        if (!DICT[code]) {
            const cached = restore('fcm_lang_' + code);
            if (cached) {
                try { DICT[code] = JSON.parse(cached); } catch (e) {}
            }
        }
        if (DICT[code]) {
            applyI18n();
            updateModeUI();
            if (currentGmsParity) updateGmsParityUI(currentGmsParity);
            if (romState) renderRomStatus();
            if (installedApps.length) filterApps();
        }
        await loadDict(code);
        applyI18n();
        updateModeUI();
        if (currentGmsParity) updateGmsParityUI(currentGmsParity);
        if (installedApps.length) filterApps(); else loadStatus();
        renderRomStatus();
    }

    async function initI18n() {
        const fetchIndex = loadJson('lang/index.json').then(list => {
            if (Array.isArray(list) && list.length) {
                LANGS = list;
                store(LANGS_KEY, JSON.stringify(list));
                renderLangOptions();
            }
        }).catch(e => {
            console.warn('i18n: language index unavailable', e);
        });

        LANG = detectLang();
        renderLangOptions();

        const dictPromises = [loadDict(DEFAULT_LANG)];
        if (LANG !== DEFAULT_LANG) dictPromises.push(loadDict(LANG));

        await Promise.all([fetchIndex, ...dictPromises]);
        applyI18n();
    }

    /* =========================================================================
     * Theme Management (Follow system / Dark / Light)
     * ====================================================================== */
    const THEME_KEY = 'fcm_ui_theme';

    function initTheme() {
        const saved = restore(THEME_KEY) || 'system';
        applyTheme(saved);
    }

    function applyTheme(theme) {
        if (theme === 'dark' || theme === 'light') {
            document.documentElement.setAttribute('data-theme', theme);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateThemeUI(theme);
    }

    function setTheme(theme) {
        store(THEME_KEY, theme);
        applyTheme(theme);
    }

    function updateThemeUI(theme) {
        const sel = document.getElementById('themeSelect');
        if (sel) sel.value = theme;
        const sub = document.getElementById('themeSubLabel');
        if (sub) {
            sub.textContent = t(theme === 'dark' ? 'theme.dark' : (theme === 'light' ? 'theme.light' : 'theme.system'));
        }
    }

    /* =========================================================================
     * ReSukiSU Bottom Navigation Tabs
     * ====================================================================== */
    let currentTab = 'home';

    function switchTab(tabId) {
        currentTab = tabId;
        store('fcm_ui_tab', tabId);

        document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => btn.classList.remove('active'));
        const activeBtn = document.getElementById(
            tabId === 'home' ? 'navBtnHome' :
            tabId === 'apps' ? 'navBtnApps' :
            tabId === 'features' ? 'navBtnFeatures' :
            tabId === 'settings' ? 'navBtnSettings' : 'navBtnHome'
        );
        if (activeBtn) activeBtn.classList.add('active');

        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        const activePane = document.getElementById(
            tabId === 'home' ? 'paneHome' :
            tabId === 'apps' ? 'paneApps' :
            tabId === 'features' ? 'paneFeatures' :
            tabId === 'settings' ? 'paneSettings' : 'paneHome'
        );
        if (activePane) activePane.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'instant' });

        if (tabId === 'apps') filterApps();
    }

    function initTab() {
        const params = new URLSearchParams(window.location.search);
        const urlTab = params.get('tab');
        const savedTab = restore('fcm_ui_tab') || 'home';
        switchTab(urlTab || savedTab);
    }

    /* =========================================================================
     * Framework patch state (OTA guard)
     * ====================================================================== */
    let romState = null;

    function showRomSkeleton() {
        if (romState) {
            const badge = document.getElementById('romBadge');
            if (badge && romState.state === 'running') {
                badge.className = 'status-pill status-running';
                badge.textContent = t('rom.state.checking');
            }
            return;
        }
        const badge = document.getElementById('romBadge');
        const cur = document.getElementById('romCurrent');
        const stored = document.getElementById('romStored');
        const live = document.getElementById('romLive');
        const hint = document.getElementById('romHint');
        if (badge) {
            badge.className = 'status-pill status-running';
            badge.innerHTML = '<span class="skeleton skeleton-text" style="width: 55px; height: 11px;"></span>';
        }
        if (cur) cur.innerHTML = '<span class="skeleton skeleton-text" style="width: 110px;"></span>';
        if (stored) stored.innerHTML = '<span class="skeleton skeleton-text" style="width: 130px;"></span>';
        if (live) live.innerHTML = '<span class="skeleton skeleton-text" style="width: 85px;"></span>';
        if (hint) hint.innerHTML = '<span class="skeleton skeleton-text" style="width: 65%; height: 11px;"></span>';
    }

    async function refreshRomStatus() {
        showRomSkeleton();
        const res = await execAction('repatch_status');
        if (res.data && res.data.state) {
            romState = res.data;
            saveStateCache({ rom_state: romState });
        } else {
            romState = null;
        }
        renderRomStatus();
    }

    function renderRomStatus() {
        const badge = document.getElementById('romBadge');
        const hint = document.getElementById('romHint');
        const btn = document.getElementById('btnRepatch');
        if (!badge || !hint || !btn) return;

        if (!romState) {
            badge.textContent = t('rom.state.checking');
            badge.className = 'status-pill status-stopped';
            hint.innerHTML = t('rom.hint.unavailable');
            btn.style.display = 'none';
            return;
        }

        document.getElementById('romCurrent').textContent = romState.current || '—';
        document.getElementById('romStored').textContent = romState.stored || '—';
        document.getElementById('romLive').textContent =
            romState.active === 'yes' ? t('rom.live.patched') : t('rom.live.stock');

        const state = romState.state;
        badge.textContent = t('rom.state.' + state);
        badge.className = 'status-pill ' + (
            state === 'ok' ? 'status-running' :
            state === 'failed' ? 'status-stopped' : 'status-warn'
        );
        hint.innerHTML = t('rom.hint.' + state) + (
            state === 'failed' && romState.last ? '<br><code>' + romState.last + '</code>' : ''
        );

        if (state === 'reboot') {
            btn.style.display = '';
            btn.textContent = t('rom.reboot');
            btn.onclick = () => execAction('reboot');
        } else {
            btn.textContent = t('rom.repatch');
            btn.onclick = runRepatch;
            btn.style.display = (state === 'pending' || state === 'failed') ? '' : 'none';
        }
    }

    async function runRepatch() {
        const btn = document.getElementById('btnRepatch');
        btn.disabled = true;
        showToast(t('rom.toast.started'));
        if (romState) { romState.state = 'running'; renderRomStatus(); }

        const res = await execAction('repatch_run');
        const out = (res.data && res.data.output) || res.stdout || '';
        if (out.indexOf('RESULT=OK') !== -1) {
            showToast(t('rom.toast.ok'));
        } else if (out.indexOf('RESULT=BUSY') !== -1) {
            showToast(t('rom.toast.busy'));
        } else {
            showToast(t('rom.toast.fail'));
        }
        btn.disabled = false;
        refreshRomStatus();
    }

    let currentPkCtrl = 'unknown';
    let currentPkBoot = true;
    let currentV18Active = false;
    let currentGmsParity = null;

    function updateGmsParityUI(parity) {
        if (!parity) return;
        currentGmsParity = parity;
        const pkBadge = document.getElementById('badgePkGms');
        const parityBadge = document.getElementById('parityBadge');

        const pkCtrl = parity.powerkeeper_gms_control;
        currentPkCtrl = pkCtrl;
        const isPkDisarmed = pkCtrl === 'false';
        const isPkNA = pkCtrl === 'global_na';
        const isPkUnknown = pkCtrl === 'unknown';

        const switchPk = document.getElementById('switchPkGms');
        const lblSwitchPk = document.getElementById('lblSwitchPkGms');

        if (switchPk) {
            if (isPkNA || isPkUnknown) {
                switchPk.checked = false;
                switchPk.disabled = true;
                if (lblSwitchPk) {
                    lblSwitchPk.style.opacity = '0.35';
                    lblSwitchPk.style.pointerEvents = 'none';
                }
            } else {
                switchPk.checked = isPkDisarmed;
                switchPk.disabled = false;
                if (lblSwitchPk) {
                    lblSwitchPk.style.opacity = '1';
                    lblSwitchPk.style.pointerEvents = 'auto';
                }
            }
        }

        const switchPkBoot = document.getElementById('switchPkGmsBoot');
        const lblSwitchPkBoot = document.getElementById('lblSwitchPkGmsBoot');
        const isBootApply = parity.boot_apply !== undefined ? !!parity.boot_apply : true;
        currentPkBoot = isBootApply;

        if (switchPkBoot) {
            if (isPkNA || isPkUnknown) {
                switchPkBoot.checked = false;
                switchPkBoot.disabled = true;
                if (lblSwitchPkBoot) {
                    lblSwitchPkBoot.style.opacity = '0.35';
                    lblSwitchPkBoot.style.pointerEvents = 'none';
                }
            } else {
                switchPkBoot.checked = isBootApply;
                switchPkBoot.disabled = false;
                if (lblSwitchPkBoot) {
                    lblSwitchPkBoot.style.opacity = '1';
                    lblSwitchPkBoot.style.pointerEvents = 'auto';
                }
            }
        }

        if (pkBadge) {
            if (isPkDisarmed) {
                pkBadge.className = 'status-pill status-running';
                pkBadge.textContent = t('parity.disarmed');
            } else if (isPkNA) {
                pkBadge.className = 'status-pill status-running';
                pkBadge.textContent = t('parity.not_applicable');
            } else if (isPkUnknown) {
                pkBadge.className = 'status-pill status-stopped';
                pkBadge.textContent = t('parity.unknown');
            } else {
                pkBadge.className = 'status-pill status-stopped';
                pkBadge.textContent = t('parity.active');
            }
        }

        if (parityBadge) {
            const allParity = isPkDisarmed || isPkNA;
            parityBadge.className = `status-pill ${allParity ? 'status-running' : 'status-stopped'}`;
            parityBadge.textContent = allParity ? t('parity.badge.active') : t('parity.badge.partial');
        }
    }

    let pkGmsSaveInProgress = false;
    let pkGmsSavePending = false;

    async function onTogglePkGmsSwitch(isChecked) {
        const switchPk = document.getElementById('switchPkGms');
        const lblSwitchPk = document.getElementById('lblSwitchPkGms');
        const spinPk = document.getElementById('spinPkGms');
        const badgePk = document.getElementById('badgePkGms');

        if (currentPkCtrl === 'global_na' || currentPkCtrl === 'unknown') {
            showToast(currentPkCtrl === 'global_na'
                ? (t('parity.not_applicable') || 'Not applicable on Global ROM')
                : (t('parity.toast.error') || 'PowerKeeper state is unavailable'));
            if (switchPk) switchPk.checked = false;
            return;
        }

        pkGmsSavePending = true;
        if (pkGmsSaveInProgress) return;
        pkGmsSaveInProgress = true;

        // Show spinner and dim badge immediately
        if (spinPk) spinPk.style.display = 'inline-block';
        if (badgePk) badgePk.style.opacity = '0.5';
        if (lblSwitchPk) lblSwitchPk.style.opacity = '0.6';

        // Force browser to paint spinner BEFORE invoking root execution
        await new Promise(r => setTimeout(r, 50));

        try {
            while (pkGmsSavePending) {
                pkGmsSavePending = false;
                const targetState = switchPk ? (switchPk.checked ? 'false' : 'true') : (isChecked ? 'false' : 'true');
                const res = await execAction('set_pk_gms', targetState);

                if (res && res.success && res.data && res.data.powerkeeper_gms_control) {
                    currentPkCtrl = res.data.powerkeeper_gms_control;
                    updateGmsParityUI({
                        powerkeeper_gms_control: currentPkCtrl,
                        boot_apply: currentPkBoot,
                        v18_active: currentV18Active
                    });
                    saveStateCache();
                    if (currentPkCtrl === 'false') {
                        showToast(t('parity.toast.disarmed') || 'GMS Firewall disarmed ✓');
                    } else {
                        showToast(t('parity.toast.enabled') || 'GMS Firewall enabled');
                    }
                } else {
                    if (switchPk) switchPk.checked = (currentPkCtrl === 'false');
                    showToast(t('parity.toast.error') || 'Failed to update firewall state');
                }
            }
        } catch (e) {
            pkGmsSavePending = false;
            if (switchPk) switchPk.checked = (currentPkCtrl === 'false');
            showToast(t('parity.toast.error') || 'Failed to update firewall state');
        } finally {
            pkGmsSaveInProgress = false;
            if (spinPk) spinPk.style.display = 'none';
            if (badgePk) badgePk.style.opacity = '1';
            if (lblSwitchPk) lblSwitchPk.style.opacity = '1';
        }
    }

    let pkGmsBootSaveInProgress = false;

    async function onTogglePkGmsBoot(isChecked) {
        const switchPkBoot = document.getElementById('switchPkGmsBoot');
        const lblSwitchPkBoot = document.getElementById('lblSwitchPkGmsBoot');
        const spinPkBoot = document.getElementById('spinPkGmsBoot');

        if (currentPkCtrl === 'global_na' || currentPkCtrl === 'unknown') {
            showToast(currentPkCtrl === 'global_na'
                ? (t('parity.not_applicable') || 'Not applicable on Global ROM')
                : (t('parity.toast.error') || 'PowerKeeper state is unavailable'));
            if (switchPkBoot) switchPkBoot.checked = false;
            return;
        }

        if (pkGmsBootSaveInProgress) return;
        pkGmsBootSaveInProgress = true;

        if (spinPkBoot) spinPkBoot.style.display = 'inline-block';
        if (lblSwitchPkBoot) lblSwitchPkBoot.style.opacity = '0.6';

        // Yield to render loop so spinner/opacity changes are painted before the blocking fetch
        await new Promise(r => setTimeout(r, 50));

        try {
            const targetState = isChecked ? 'true' : 'false';
            const res = await execAction('set_pk_gms_boot', targetState);

            if (res && res.success && res.data && res.data.boot_apply !== undefined) {
                currentPkBoot = !!res.data.boot_apply;
                if (res.data.powerkeeper_gms_control) {
                    currentPkCtrl = res.data.powerkeeper_gms_control;
                }
                updateGmsParityUI({
                    powerkeeper_gms_control: currentPkCtrl,
                    boot_apply: currentPkBoot,
                    v18_active: currentV18Active
                });
                saveStateCache();
                if (currentPkBoot) {
                    showToast(t('parity.toast.boot_enabled') || 'Apply on boot enabled ✓');
                } else {
                    showToast(t('parity.toast.boot_disabled') || 'Apply on boot disabled');
                }
            } else {
                if (switchPkBoot) switchPkBoot.checked = currentPkBoot;
                showToast(t('parity.toast.error') || 'Failed to update boot apply state');
            }
        } catch (e) {
            if (switchPkBoot) switchPkBoot.checked = currentPkBoot;
            showToast(t('parity.toast.error') || 'Failed to update boot apply state');
        } finally {
            pkGmsBootSaveInProgress = false;
            if (spinPkBoot) spinPkBoot.style.display = 'none';
            if (lblSwitchPkBoot) lblSwitchPkBoot.style.opacity = '1';
        }
    }

    // KernelSU / APatch / Magisk Execution Bridge
    let cbCounter = 0;
    async function execAction(action, payload) {
        const ksuObj = (window.ksu || (typeof ksu !== 'undefined' ? ksu : null));
        if (!ksuObj || typeof ksuObj.exec !== 'function') {
            return { success: false, stderr: 'KernelSU bridge not available', data: null };
        }

        return new Promise((resolve) => {
            const cbName = 'fcm_cb_' + Date.now() + '_' + (cbCounter++);
            const jsonPayload = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '';
            const escapedPayload = jsonPayload.replace(/'/g, "'\\''");
            const cmd = `sh /data/adb/modules/oneone_fcm/webroot/cgi-bin/exec '${action}' '${escapedPayload}' 2>/dev/null`;

            window[cbName] = function(errno, stdout, stderr) {
                delete window[cbName];
                const outStr = (stdout || '').trim();
                let data = null;
                try {
                    const start = outStr.indexOf('{');
                    const end = outStr.lastIndexOf('}');
                    if (start !== -1 && end > start) {
                        data = JSON.parse(outStr.substring(start, end + 1));
                    }
                } catch (e) {}

                resolve({
                    errno: errno ?? 0,
                    stdout: outStr,
                    stderr: (stderr || '').trim(),
                    success: (errno === 0 && data && data.status === 'ok'),
                    data: data
                });
            };

            try {
                ksuObj.exec(cmd, '{}', cbName);
            } catch (e) {
                delete window[cbName];
                resolve({ success: false, stderr: e.message, data: null });
            }
        });
    }

    // Format package name for high readability
    const pkgFormatCache = new Map();
    function renderFormattedPkg(pkg) {
        if (pkgFormatCache.has(pkg)) return pkgFormatCache.get(pkg);
        const idx = pkg.lastIndexOf('.');
        let res;
        if (idx !== -1) {
            const prefix = pkg.substring(0, idx + 1);
            const name = pkg.substring(idx + 1);
            res = `<span class="app-pkg-prefix">${prefix}</span><span class="app-pkg-highlight">${name}</span>`;
        } else {
            res = `<span class="app-pkg-highlight">${pkg}</span>`;
        }
        pkgFormatCache.set(pkg, res);
        return res;
    }

    let currentMode = null;
    let savedMode = null;
    let hasLoadedStoppedStatus = false;
    let viewFilter = 'ALL'; // 'ALL' | 'ENABLED' | 'DISABLED' | 'ACTIVE' | 'STOPPED'
    let installedApps = [];
    let stoppedApps = new Set();
    let selectedApps = new Set();
    let savedApps = new Set();

    function checkDraftChanges() {
        let isDirty = false;
        if (currentMode !== savedMode) {
            isDirty = true;
        } else if (selectedApps.size !== savedApps.size) {
            isDirty = true;
        } else {
            for (const app of selectedApps) {
                if (!savedApps.has(app)) {
                    isDirty = true;
                    break;
                }
            }
        }

        const saveBar = document.getElementById('saveBar');
        if (saveBar) {
            if (isDirty) {
                saveBar.classList.add('visible');
            } else {
                saveBar.classList.remove('visible');
            }
        }
        return isDirty;
    }

    // Persistent State Cache (Instant 0ms UI Hydration)
    const CACHE_KEY = 'fcm_ui_cache_v2';

    function saveStateCache(extra) {
        try {
            const state = {
                mode: savedMode,
                packages: Array.from(savedApps),
                installed: installedApps,
                stopped: Array.from(stoppedApps),
                rom_state: romState,
                gms_parity: currentGmsParity,
                ts: Date.now()
            };
            if (extra) Object.assign(state, extra);
            store(CACHE_KEY, JSON.stringify(state));
        } catch (e) {}
    }

    function hydrateFromCache() {
        try {
            const raw = restore(CACHE_KEY);
            if (!raw) return;
            const cache = JSON.parse(raw);
            if (cache.mode) {
                savedMode = cache.mode;
                currentMode = cache.mode;
            }
            if (Array.isArray(cache.packages)) {
                savedApps = new Set(cache.packages);
                selectedApps = new Set(cache.packages);
            }
            if (Array.isArray(cache.installed) && cache.installed.length) {
                installedApps = cache.installed;
                isLoadingApps = false;
            }
            if (Array.isArray(cache.stopped) && cache.stopped.length) {
                stoppedApps = new Set(cache.stopped);
                hasLoadedStoppedStatus = true;
            }
            if (cache.rom_state) {
                romState = cache.rom_state;
            }
            if (cache.gms_parity) {
                currentGmsParity = cache.gms_parity;
                updateGmsParityUI(cache.gms_parity);
            }

            updateModeUI();
            if (romState) renderRomStatus();
            if (installedApps.length) filterApps();
            checkDraftChanges();
        } catch (e) {
            console.warn('Failed to hydrate state from cache:', e);
        }
    }

    // Lazy Rendering & Virtualization State
    let isLoadingApps = true;
    let filteredApps = [];
    let renderedCount = 0;
    const CHUNK_SIZE = 35;
    let searchDebounceTimer = null;
    let sentinelObserver = null;

    function getSkeletonAppListHtml(count = 6) {
        const widths = [
            { title: '62%', sub: '42%', badge: '42px' },
            { title: '78%', sub: '50%', badge: '46px' },
            { title: '55%', sub: '35%', badge: '40px' },
            { title: '84%', sub: '48%', badge: '44px' },
            { title: '68%', sub: '38%', badge: '42px' },
            { title: '50%', sub: '30%', badge: '40px' }
        ];
        let html = '';
        for (let i = 0; i < count; i++) {
            const w = widths[i % widths.length];
            html += `
                <div class="skeleton-app-item">
                    <div class="skeleton skeleton-icon"></div>
                    <div class="skeleton-app-info">
                        <span class="skeleton skeleton-text" style="width: ${w.title}; height: 13px;"></span>
                        <span class="skeleton skeleton-text" style="width: ${w.sub}; height: 9px;"></span>
                    </div>
                    <div class="skeleton-app-actions">
                        <span class="skeleton skeleton-pill" style="width: ${w.badge}; height: 16px;"></span>
                        <span class="skeleton skeleton-switch"></span>
                    </div>
                </div>
            `;
        }
        return html;
    }

    async function loadStatus() {
        try {
            const res = await execAction('load_status');
            if (!res.success || !res.data) {
                throw new Error(res.stderr || (res.data && res.data.message) || 'Status fetch failed');
            }

            const data = res.data;
            savedMode = (data.mode || 'ALL').toUpperCase();
            currentMode = savedMode;
            savedApps = new Set(data.packages || []);
            selectedApps = new Set(savedApps);
            installedApps = (data.installed || []).sort();
            isLoadingApps = false;

            updateModeUI();
            if (data.gms_parity) {
                updateGmsParityUI(data.gms_parity);
            }
            filterApps();
            checkDraftChanges();
            saveStateCache();

            // Background fetch for stopped state
            loadStoppedStatusAsync();
        } catch (e) {
            console.error('Failed to load status:', e);
            isLoadingApps = false;
            if (!installedApps.length) {
                document.getElementById('appList').innerHTML = 
                    `<div style="text-align: center; color: var(--accent-rose); padding: 16px; font-size: 0.75rem;">${t('bridge.fail')}<br><small>${e.message}</small></div>`;
            }
        }
    }

    async function loadStoppedStatusAsync() {
        try {
            const res = await execAction('stopped');
            if (res.success && res.data) {
                if (Array.isArray(res.data.stopped)) {
                    stoppedApps = new Set(res.data.stopped);
                    hasLoadedStoppedStatus = true;
                }
                updateCounts();
                updateStoppedBadgesInDOM();
                saveStateCache();
            }
        } catch (e) {
            console.warn('Background stopped state fetch skipped:', e);
            hasLoadedStoppedStatus = true;
            updateCounts();
            updateStoppedBadgesInDOM();
        }
    }


    function updateStoppedBadgesInDOM() {
        document.querySelectorAll('[data-badge-pkg]').forEach(badge => {
            const pkg = badge.getAttribute('data-badge-pkg');
            const isStopped = stoppedApps.has(pkg);
            badge.className = `status-pill ${isStopped ? 'status-stopped' : 'status-running'}`;
            badge.textContent = isStopped ? t('pill.stopped') : t('pill.active');
        });
    }

    function setMode(mode) {
        currentMode = mode;
        updateModeUI();
        // Update slider colors dynamically
        document.querySelectorAll('.slider').forEach(slider => {
            slider.className = 'slider ' + (currentMode === 'BLACKLIST' ? 'rose' : (currentMode === 'WHITELIST' ? 'cyan' : ''));
        });
        checkDraftChanges();
    }

    async function applyLiteDefaults() {
        if (!confirm(t('lite.confirm'))) return;
        const button = document.getElementById('btnRestoreLiteDefaults');
        if (button) button.disabled = true;
        try {
            const res = await execAction('apply_lite_defaults');
            if (!res || !res.success || !res.data || res.data.status !== 'ok') {
                throw new Error((res && res.data && res.data.message) || (res && res.stderr) || 'Restore failed');
            }
            await loadStatus();
            showToast(t('lite.restored'));
        } catch (e) {
            showToast(t('lite.failed') + e.message);
        } finally {
            if (button) button.disabled = false;
        }
    }

    function setViewFilter(filter) {
        viewFilter = filter;
        document.querySelectorAll('.filter-tab').forEach(el => el.classList.remove('active', 'enabled', 'disabled', 'active-app', 'stopped-app'));
        
        const tabEl = document.getElementById(
            filter === 'ALL' ? 'tabFilterAll' :
            filter === 'ENABLED' ? 'tabFilterEnabled' :
            filter === 'DISABLED' ? 'tabFilterDisabled' :
            filter === 'ACTIVE' ? 'tabFilterActive' :
            filter === 'STOPPED' ? 'tabFilterStopped' : 'tabFilterAll'
        );
        if (tabEl) {
            tabEl.classList.add('active');
            if (filter === 'ENABLED') tabEl.classList.add('enabled');
            if (filter === 'DISABLED') tabEl.classList.add('disabled');
            if (filter === 'ACTIVE') tabEl.classList.add('active-app');
            if (filter === 'STOPPED') tabEl.classList.add('stopped-app');
        }
        filterApps();
    }

    function updateModeUI() {
        if (!currentMode) return;
        const btnAll = document.getElementById('btnModeAll');
        const btnWhite = document.getElementById('btnModeWhitelist');
        const btnBlack = document.getElementById('btnModeBlacklist');
        const badge = document.getElementById('modeBadge');
        const desc = document.getElementById('modeDescription');
        const listTitle = document.getElementById('listTitle');

        btnAll.className = 'mode-btn' + (currentMode === 'ALL' ? ' active' : '');
        btnWhite.className = 'mode-btn' + (currentMode === 'WHITELIST' ? ' active whitelist' : '');
        btnBlack.className = 'mode-btn' + (currentMode === 'BLACKLIST' ? ' active blacklist' : '');

        if (currentMode === 'ALL') {
            badge.textContent = t('badge.all');
            badge.className = 'status-pill status-running';
            badge.style.background = '';
            badge.style.color = '';
            desc.innerHTML = t('mode.desc.all');
            listTitle.textContent = t('list.title.all');
        } else if (currentMode === 'WHITELIST') {
            badge.textContent = t('badge.whitelist');
            badge.className = 'status-pill';
            badge.style.background = 'rgba(6, 182, 212, 0.2)';
            badge.style.color = '#22d3ee';
            desc.innerHTML = t('mode.desc.whitelist');
            listTitle.textContent = t('list.title.whitelist');
        } else if (currentMode === 'BLACKLIST') {
            badge.textContent = t('badge.blacklist');
            badge.className = 'status-pill';
            badge.style.background = 'rgba(244, 63, 94, 0.2)';
            badge.style.color = '#fb7185';
            desc.innerHTML = t('mode.desc.blacklist');
            listTitle.textContent = t('list.title.blacklist');
        }

        updateCounts();
    }

    function updateCounts() {
        const total = installedApps.length;
        const enabled = selectedApps.size;
        const disabled = Math.max(0, total - enabled);

        let stoppedCount = 0;
        let activeCount = 0;

        installedApps.forEach(pkg => {
            if (stoppedApps.has(pkg)) stoppedCount++;
            else activeCount++;
        });

        document.getElementById('countAll').textContent = total;
        document.getElementById('countEnabled').textContent = enabled;
        document.getElementById('countDisabled').textContent = disabled;
        if (hasLoadedStoppedStatus) {
            document.getElementById('countActive').textContent = activeCount;
            document.getElementById('countStopped').textContent = stoppedCount;
        } else {
            document.getElementById('countActive').innerHTML = '<span class="skeleton skeleton-text" style="width: 14px; height: 10px;"></span>';
            document.getElementById('countStopped').innerHTML = '<span class="skeleton skeleton-text" style="width: 14px; height: 10px;"></span>';
        }
        document.getElementById('selectedCount').textContent = t('pill.selected', { n: enabled });
    }

    function onSearchInput() {
        if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            filterApps();
        }, 80);
    }

    function filterApps() {
        const search = (document.getElementById('searchInput').value || '').toLowerCase().trim();

        if (isLoadingApps && installedApps.length === 0) {
            return;
        }

        if (installedApps.length === 0) {
            document.getElementById('appList').innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 16px; font-size: 0.75rem;">${t('list.empty')}</div>`;
            return;
        }

        filteredApps = installedApps.filter(pkg => {
            const isChecked = selectedApps.has(pkg);
            const isStopped = stoppedApps.has(pkg);

            if (viewFilter === 'ENABLED' && !isChecked) return false;
            if (viewFilter === 'DISABLED' && isChecked) return false;
            if (viewFilter === 'ACTIVE' && isStopped) return false;
            if (viewFilter === 'STOPPED' && !isStopped) return false;

            if (search && !pkg.toLowerCase().includes(search)) {
                return false;
            }
            return true;
        });

        renderedCount = 0;
        const listEl = document.getElementById('appList');
        listEl.innerHTML = '';

        if (filteredApps.length === 0) {
            listEl.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 0.75rem;">${t('list.noMatch')}</div>`;
            updateCounts();
            return;
        }

        renderNextChunk();
        updateCounts();
    }

    function generateAppItemHtml(pkg, isChecked, isStopped) {
        const sliderClass = currentMode === 'BLACKLIST' ? 'rose' : (currentMode === 'WHITELIST' ? 'cyan' : '');
        const badgeHtml = hasLoadedStoppedStatus
            ? `<span class="status-pill ${isStopped ? 'status-stopped' : 'status-running'}" data-badge-pkg="${pkg}">${isStopped ? t('pill.stopped') : t('pill.active')}</span>`
            : `<span class="status-pill status-running" data-badge-pkg="${pkg}"><span class="skeleton skeleton-text" style="width: 36px; height: 10px;"></span></span>`;

        return `
            <div class="app-item ${isChecked ? 'selected' : ''}" data-pkg="${pkg}">
                <div class="app-pkg-container" onclick="copyPkg(event, '${pkg}')" title="Tap to copy package name">
                    <span class="app-pkg">${renderFormattedPkg(pkg)}</span>
                    <span class="copy-icon">
                        <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </span>
                </div>
                <div class="app-actions">
                    ${badgeHtml}
                    <label class="switch" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isChecked ? 'checked' : ''} onchange="toggleApp('${pkg}', this.checked)">
                        <span class="slider ${sliderClass}"></span>
                    </label>
                </div>
            </div>
        `;
    }

    function renderNextChunk() {
        const listEl = document.getElementById('appList');
        if (renderedCount >= filteredApps.length) {
            removeSentinel();
            return;
        }

        const nextBatch = filteredApps.slice(renderedCount, renderedCount + CHUNK_SIZE);
        renderedCount += nextBatch.length;

        let html = '';
        nextBatch.forEach(pkg => {
            html += generateAppItemHtml(pkg, selectedApps.has(pkg), stoppedApps.has(pkg));
        });

        removeSentinel();

        const temp = document.createElement('div');
        temp.innerHTML = html;
        while (temp.firstChild) {
            listEl.appendChild(temp.firstChild);
        }

        if (renderedCount < filteredApps.length) {
            appendSentinel();
        }
    }

    function appendSentinel() {
        const listEl = document.getElementById('appList');
        const sentinel = document.createElement('div');
        sentinel.id = 'scrollSentinel';
        sentinel.style.padding = '8px';
        sentinel.style.textAlign = 'center';
        sentinel.style.color = 'var(--text-muted)';
        sentinel.style.fontSize = '0.68rem';
        sentinel.textContent = t('list.more', { a: renderedCount, b: filteredApps.length });
        listEl.appendChild(sentinel);

        if ('IntersectionObserver' in window) {
            if (!sentinelObserver) {
                sentinelObserver = new IntersectionObserver((entries) => {
                    if (entries[0] && entries[0].isIntersecting) {
                        renderNextChunk();
                    }
                }, { root: listEl, rootMargin: '100px' });
            }
            sentinelObserver.observe(sentinel);
        }
    }

    function removeSentinel() {
        const sentinel = document.getElementById('scrollSentinel');
        if (sentinel) {
            if (sentinelObserver) sentinelObserver.unobserve(sentinel);
            sentinel.remove();
        }
    }

    function handleListScroll() {
        const listEl = document.getElementById('appList');
        if (listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - 80) {
            if (renderedCount < filteredApps.length) {
                renderNextChunk();
            }
        }
    }

    function toggleApp(pkg, forceVal) {
        let val;
        if (typeof forceVal === 'boolean') {
            val = forceVal;
            if (val) selectedApps.add(pkg);
            else selectedApps.delete(pkg);
        } else {
            if (selectedApps.has(pkg)) {
                selectedApps.delete(pkg);
                val = false;
            } else {
                selectedApps.add(pkg);
                val = true;
            }
        }

        // Fast In-Place DOM Update
        const el = document.querySelector(`.app-item[data-pkg="${CSS.escape(pkg)}"]`);
        if (el) {
            el.classList.toggle('selected', val);
            const chk = el.querySelector('input[type="checkbox"]');
            if (chk) chk.checked = val;

            if (viewFilter === 'ENABLED' && !val) el.remove();
            else if (viewFilter === 'DISABLED' && val) el.remove();
        }

        updateCounts();
        checkDraftChanges();
    }

    function copyPkg(event, pkg) {
        if (event) event.stopPropagation();
        copyText(pkg).then(() => {
            showToast(t('toast.copied', { pkg }));
        }).catch(() => {
            showToast(t('toast.pkg', { pkg }));
        });
    }

    function copyText(str) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(str);
        }
        return new Promise((resolve, reject) => {
            const el = document.createElement('textarea');
            el.value = str;
            el.style.position = 'fixed';
            el.style.opacity = '0';
            document.body.appendChild(el);
            el.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(el);
                resolve();
            } catch (err) {
                document.body.removeChild(el);
                reject(err);
            }
        });
    }

    async function saveConfiguration() {
        try {
            const payload = {
                mode: currentMode,
                packages: Array.from(selectedApps)
            };
            const res = await execAction('save_config', payload);
            if (res.success) {
                savedMode = currentMode;
                savedApps = new Set(selectedApps);
                checkDraftChanges();
                saveStateCache();
                showToast(t('toast.saved'));
            } else {
                alert(t('alert.saveError') + ((res.data && res.data.message) || res.stderr || ''));
            }
        } catch (e) {
            alert(t('alert.saveFail') + e.message);
        }
    }

    function showToast(msg) {
        let shownKsu = false;
        try {
            if (window.ksu && typeof window.ksu.toast === 'function') {
                window.ksu.toast(msg);
                shownKsu = true;
            }
        } catch (e) {}

        // Only show webui floating toast if KernelSU native toast is not available
        if (!shownKsu) {
            const toast = document.getElementById('toast');
            if (toast) {
                toast.textContent = msg;
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 2200);
            }
        }
    }

    // 1. Instant hydration from localStorage before any async network requests (0ms)
    initTheme();
    initCachedI18n();
    hydrateFromCache();
    initTab();

    // 2. Initialize dictionaries and refresh live status asynchronously
    initI18n().finally(() => {
        initTheme();
        applyI18n();
        initTab();
        updateModeUI();
        if (currentGmsParity) updateGmsParityUI(currentGmsParity);
        if (romState) renderRomStatus();
        loadStatus();
        refreshRomStatus();
    });
