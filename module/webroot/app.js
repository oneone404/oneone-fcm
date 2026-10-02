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
                if (Array.isArray(parsed)) {
                    const supported = parsed.filter(lang => lang && ['en', 'vi'].includes(lang.code));
                    if (supported.length === 2) return supported;
                }
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
        if (saved && ['en', 'vi'].includes(saved)) return saved;
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
        if (!['en', 'vi'].includes(code)) return;
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
            updateSelectionSummary();
            if (document.getElementById('appPicker').open) renderAppPicker();
        }
        await loadDict(code);
        applyI18n();
        updateModeUI();
        if (currentGmsParity) updateGmsParityUI(currentGmsParity);
        updateSelectionSummary();
        if (document.getElementById('appPicker').open) renderAppPicker();
        renderRomStatus();
    }

    async function initI18n() {
        const fetchIndex = loadJson('lang/index.json').then(list => {
            if (Array.isArray(list) && list.length) {
                LANGS = list.filter(lang => lang && ['en', 'vi'].includes(lang.code));
                store(LANGS_KEY, JSON.stringify(LANGS));
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
            const timeout = setTimeout(() => {
                delete window[cbName];
                resolve({ success: false, stderr: 'Root bridge timed out', data: null });
            }, action === 'repatch_run' ? 600000 : 30000);
            const jsonPayload = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '';
            const escapedPayload = jsonPayload.replace(/'/g, "'\\''");
            const cmd = `sh /data/adb/modules/oneone_fcm/webroot/cgi-bin/exec '${action}' '${escapedPayload}' 2>/dev/null`;

            window[cbName] = function(errno, stdout, stderr) {
                clearTimeout(timeout);
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
                clearTimeout(timeout);
                delete window[cbName];
                resolve({ success: false, stderr: e.message, data: null });
            }
        });
    }

    // v1.4 wake policy: keep its package-only configuration format unchanged.
    let currentMode = null;
    let savedMode = null;
    let selectedApps = new Set();
    let savedApps = new Set();
    let installedApps = [];
    let policyReady = false;
    let policySaving = false;
    let appCatalog = [];
    let appDraft = new Set();
    let pickerLoading = false;
    let pickerAvailable = false;
    let pickerError = false;
    const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

    function updateSelectionSummary() {
        document.getElementById('appSelectionSummary').textContent =
            policyReady ? t('apps.selected', { count: selectedApps.size }) : t('apps.config_unknown');
    }

    function checkDraftChanges() {
        const dirty = policyReady && (currentMode !== savedMode || selectedApps.size !== savedApps.size
            || [...selectedApps].some(pkg => !savedApps.has(pkg)));
        document.getElementById('saveBar').classList.toggle('visible', dirty);
        return dirty;
    }

    function updateModeUI() {
        ['ALL', 'WHITELIST', 'BLACKLIST'].forEach((mode, index) => {
            const button = document.getElementById(['btnModeAll', 'btnModeWhitelist', 'btnModeBlacklist'][index]);
            button.classList.toggle('active', currentMode === mode);
            button.disabled = !policyReady || policySaving;
        });
        document.getElementById('chooseApps').disabled = !policyReady || policySaving;
        document.getElementById('btnRestoreLiteDefaults').disabled = policySaving;
        const badge = document.getElementById('modeBadge');
        badge.textContent = policyReady ? t('badge.' + currentMode.toLowerCase()) : t('apps.config_unknown');
        badge.className = 'status-pill ' + (policyReady ? 'status-running' : 'status-stopped');
        document.getElementById('modeDescription').textContent = policyReady
            ? t('mode.desc.' + currentMode.toLowerCase()).replace(/<[^>]*>/g, '') : '';
        updateSelectionSummary();
        checkDraftChanges();
    }

    function setMode(mode) {
        if (!policyReady || policySaving || !['ALL', 'WHITELIST', 'BLACKLIST'].includes(mode)) return;
        currentMode = mode;
        updateModeUI();
    }

    async function loadStatus() {
        policyReady = false;
        updateModeUI();
        try {
            const result = await execAction('load_status');
            if (!result.success || !result.data || !['ALL', 'WHITELIST', 'BLACKLIST'].includes(result.data.mode)
                || !Array.isArray(result.data.packages) || !Array.isArray(result.data.installed)) {
                throw Error(result.stderr || result.data?.message || 'Policy unavailable');
            }
            savedMode = currentMode = result.data.mode;
            savedApps = new Set(result.data.packages.filter(pkg => PACKAGE_PATTERN.test(pkg)));
            selectedApps = new Set(savedApps);
            installedApps = result.data.installed.filter(pkg => PACKAGE_PATTERN.test(pkg));
            policyReady = true;
            document.getElementById('policyError').textContent = '';
            if (result.data.gms_parity) updateGmsParityUI(result.data.gms_parity);
        } catch (error) {
            document.getElementById('policyError').textContent = t('apps.error') + ' ' + error.message;
        }
        updateModeUI();
    }

    async function applyLiteDefaults() {
        if (policySaving || !confirm(t('lite.confirm'))) return;
        policySaving = true;
        updateModeUI();
        try {
            const result = await execAction('apply_lite_defaults');
            if (!result.success) throw Error(result.stderr || result.data?.message || 'Restore failed');
            await loadStatus();
            showToast(t('lite.restored'));
        } catch (error) { showToast(t('lite.failed') + error.message); }
        finally { policySaving = false; updateModeUI(); }
    }

    async function saveConfiguration(packages = selectedApps) {
        if (!policyReady || policySaving) return false;
        const mode = currentMode;
        const snapshot = new Set(packages);
        policySaving = true;
        document.querySelector('.save-btn').disabled = true;
        updateModeUI();
        try {
            const result = await execAction('save_config', { mode, packages: [...snapshot].sort() });
            if (!result.success) throw Error(result.stderr || result.data?.message || 'Save failed');
            savedMode = currentMode = mode;
            savedApps = new Set(snapshot);
            selectedApps = new Set(snapshot);
            showToast(t('toast.saved'));
            return true;
        } catch (error) {
            showToast(t('apps.save_error') + ' ' + error.message);
            return false;
        } finally {
            policySaving = false;
            document.querySelector('.save-btn').disabled = false;
            updateModeUI();
        }
    }

    async function readManagerAppCatalog() {
        const bridge = window.ksu || (typeof ksu !== 'undefined' ? ksu : null);
        if (!bridge || typeof bridge.listPackages !== 'function' || typeof bridge.getPackagesInfo !== 'function') return null;
        const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
        try {
            const names = decode(await bridge.listPackages('all'));
            if (!Array.isArray(names)) throw Error('Invalid package list');
            const packages = [...new Set(names.filter(pkg => typeof pkg === 'string' && PACKAGE_PATTERN.test(pkg)))];
            if (!packages.length) return null;
            const details = [];
            for (let offset = 0; offset < packages.length; offset += 100) {
                const chunk = decode(await bridge.getPackagesInfo(JSON.stringify(packages.slice(offset, offset + 100))));
                if (!Array.isArray(chunk)) throw Error('Invalid package metadata');
                details.push(...chunk);
            }
            const byPackage = new Map(details.filter(info => info && typeof info.packageName === 'string')
                .map(info => [info.packageName, info]));
            return packages.flatMap(pkg => {
                const info = byPackage.get(pkg);
                if (info && Number.isInteger(info.uid) && (info.uid < 0 || info.uid >= 100000)) return [];
                return [{ package: pkg,
                    name: info && !info.error && typeof info.appLabel === 'string' && info.appLabel.trim() ? info.appLabel : pkg,
                    system: !!(info && !info.error && info.isSystem === true),
                    icon: 'ksu://icon/' + pkg }];
            });
        } catch (error) {
            console.warn('Manager catalog unavailable; using v1.4 package list:', error.message);
            return null;
        }
    }

    function closeAppPicker() {
        if (policySaving) return;
        document.getElementById('appPicker').close();
    }

    async function openAppPicker() {
        const dialog = document.getElementById('appPicker');
        if (dialog.open || pickerLoading || policySaving || !policyReady) return;
        appDraft = new Set(selectedApps);
        pickerLoading = true; pickerAvailable = false; pickerError = false;
        document.getElementById('appSearch').value = '';
        dialog.showModal();
        renderAppPicker();
        try {
            const nativeApps = await readManagerAppCatalog();
            appCatalog = nativeApps && nativeApps.length ? nativeApps
                : installedApps.map(pkg => ({ package: pkg, name: pkg, system: false, icon: 'ksu://icon/' + pkg }));
            // Keep selected packages visible even when uninstalled or missing from manager cache.
            const present = new Set(appCatalog.map(app => app.package));
            for (const pkg of appDraft) {
                if (!present.has(pkg)) appCatalog.push({ package: pkg, name: pkg, system: false });
            }
            appCatalog.sort((a, b) => a.name.localeCompare(b.name, LANG));
            pickerAvailable = appCatalog.length > 0;
        } catch (error) {
            pickerError = true;
            console.warn('App picker:', error.message);
        } finally { pickerLoading = false; renderAppPicker(); }
    }

    function renderAppPicker() {
        const list = document.getElementById('appPickerList');
        list.replaceChildren();
        document.getElementById('saveApps').disabled = pickerLoading || policySaving || !pickerAvailable;
        document.getElementById('cancelApps').disabled = policySaving;
        document.getElementById('appPickerCount').textContent = t('apps.selected', { count: appDraft.size });
        if (pickerLoading || pickerError) {
            list.textContent = t(pickerLoading ? 'apps.loading' : 'apps.error');
            return;
        }
        const query = document.getElementById('appSearch').value.trim().toLocaleLowerCase();
        const showSystem = document.getElementById('showSystemApps').checked;
        const filtered = appCatalog.filter(app => (!app.system || showSystem || appDraft.has(app.package))
            && (app.name + ' ' + app.package).toLocaleLowerCase().includes(query));
        if (!filtered.length) { list.textContent = t('apps.empty'); return; }
        const fragment = document.createDocumentFragment();
        for (const app of filtered) {
            const row = document.createElement('label'); row.className = 'picker-app';
            const icon = document.createElement(app.icon ? 'img' : 'span'); icon.className = 'picker-app-icon';
            const fallback = () => {
                const placeholder = document.createElement('span'); placeholder.className = 'picker-app-icon';
                placeholder.textContent = app.name.slice(0, 1).toUpperCase();
                placeholder.setAttribute('aria-hidden', 'true');
                row.replaceChild(placeholder, icon);
            };
            if (app.icon) {
                icon.src = app.icon; icon.alt = ''; icon.loading = 'lazy';
                icon.addEventListener('error', fallback, { once: true });
            } else { icon.textContent = app.name.slice(0, 1).toUpperCase(); icon.setAttribute('aria-hidden', 'true'); }
            const info = document.createElement('div'); info.className = 'picker-app-info';
            const name = document.createElement('div'); name.className = 'picker-app-name'; name.textContent = app.name;
            const pkg = document.createElement('div'); pkg.className = 'picker-app-package'; pkg.textContent = app.package;
            info.append(name, pkg);
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
            checkbox.checked = appDraft.has(app.package); checkbox.disabled = policySaving;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) appDraft.add(app.package); else appDraft.delete(app.package);
                document.getElementById('appPickerCount').textContent = t('apps.selected', { count: appDraft.size });
            });
            row.append(icon, info, checkbox); fragment.append(row);
        }
        list.append(fragment);
    }

    async function saveAppPicker() {
        if (policySaving || pickerLoading || !pickerAvailable) return;
        const saving = saveConfiguration(appDraft);
        renderAppPicker();
        if (await saving) document.getElementById('appPicker').close();
        renderAppPicker();
    }

    document.getElementById('appPicker').addEventListener('cancel', event => {
        if (policySaving) event.preventDefault();
    });

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

    // 2. Initialize dictionaries and refresh live status asynchronously
    initI18n().finally(() => {
        initTheme();
        applyI18n();
        updateModeUI();
        if (currentGmsParity) updateGmsParityUI(currentGmsParity);
        if (romState) renderRomStatus();
        loadStatus();
        refreshRomStatus();
    });
