    /* =========================================================================
     * Localization
     * Strings live in webroot/lang/<code>.json and lang/index.json lists what
     * ships, so adding a language is one file plus one line - no edit to this
     * page. The markup itself carries English, so the UI stays readable even
     * when the dictionaries cannot be fetched at all.
     * ====================================================================== */
    const LANG_KEY = 'fcm_ui_lang';

    const DEFAULT_LANG = 'en';
    let LANG = DEFAULT_LANG;
    const LANGS = [
        { code: 'vi', name: 'Tiếng Việt' },
        { code: 'en', name: 'English' }
    ];
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
        if (saved && LANGS.some(l => l.code === saved)) return saved;
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
        await loadDict(code);
        applyI18n();
        if (currentGmsParity) updateGmsParityUI(currentGmsParity);
        if (currentStatus) renderStatus(currentStatus); else loadStatus();
        renderAppPicker();
        updateSelectionSummary();
        if (frameworkState) renderFrameworkStatus(frameworkState);
    }

    async function initI18n() {


        LANG = detectLang();
        renderLangOptions();

        const dictPromises = [loadDict(DEFAULT_LANG)];
        if (LANG !== DEFAULT_LANG) dictPromises.push(loadDict(LANG));

        await Promise.all(dictPromises);
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
        const isPkNA = pkCtrl === 'unsupported';
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
            parityBadge.textContent = isPkNA ? t('parity.not_applicable') : (allParity ? t('parity.badge.active') : t('parity.badge.partial'));
        }
    }

    let pkGmsSaveInProgress = false;
    let pkGmsSavePending = false;

    async function onTogglePkGmsSwitch(isChecked) {
        const switchPk = document.getElementById('switchPkGms');
        const lblSwitchPk = document.getElementById('lblSwitchPkGms');
        const spinPk = document.getElementById('spinPkGms');
        const badgePk = document.getElementById('badgePkGms');

        if (currentPkCtrl === 'unsupported' || currentPkCtrl === 'unknown') {
            showToast(currentPkCtrl === 'unsupported'
                ? (t('parity.not_applicable') || 'PowerKeeper control unavailable')
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
                        boot_apply: currentPkBoot
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

        if (currentPkCtrl === 'unsupported' || currentPkCtrl === 'unknown') {
            showToast(currentPkCtrl === 'unsupported'
                ? (t('parity.not_applicable') || 'PowerKeeper control unavailable')
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
                    boot_apply: currentPkBoot
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
    // In-memory session only; no background collector, upload or stored token.
    const sessionLog = [];
    let sessionLogChars = 0;
    let sessionLogDropped = 0;
    function logDiagnostic(event, detail) {
        let entry = new Date().toISOString() + ' ' + event + '\n' + (typeof detail === 'string' ? detail : JSON.stringify(detail));
        if (entry.length > 24000) {
            entry = '[entry truncated to last 24000 characters]\n' + entry.slice(-23950);
            sessionLogDropped++;
        }
        sessionLog.push(entry); sessionLogChars += entry.length;
        while (sessionLogChars > 24000 && sessionLog.length > 1) {
            sessionLogChars -= sessionLog.shift().length; sessionLogDropped++;
        }
    }
    let logSaving = false;
    async function saveLog() {
        if (logSaving) return;
        logSaving = true;
        const button = document.getElementById('saveLog');
        const result = document.getElementById('logResult');
        button.disabled = true;
        result.textContent = t('log.saving');
        try {
            const report = 'Retained session (24000 characters max); older/truncated entries: ' + sessionLogDropped + '\n'
                + sessionLog.join('\n\n');
            const response = await execAction('save_log', report);
            result.textContent = response.success && response.data.path
                ? t('log.saved') + '\n' + response.data.path
                : t('log.error') + '\n' + (response.stderr || response.data?.message || 'Root bridge returned no diagnostic details');
        } catch (error) {
            logDiagnostic('save_log.error', error.message);
            result.textContent = t('log.error');
        } finally { logSaving = false; button.disabled = false; }
    }
    let cbCounter = 0;
    async function execAction(action, payload) {
        const ksuObj = (window.ksu || (typeof ksu !== 'undefined' ? ksu : null));
        if (!ksuObj || typeof ksuObj.exec !== 'function') {
            logDiagnostic(action, 'KernelSU bridge not available');
            return { success: false, stderr: 'KernelSU bridge not available', data: null };
        }

        return new Promise((resolve) => {
            const cbName = 'fcm_cb_' + Date.now() + '_' + (cbCounter++);
            const timeout = setTimeout(() => {
                delete window[cbName];
                logDiagnostic(action, 'Root bridge timed out');
                resolve({ success: false, stderr: 'Root bridge timed out', data: null });
            }, ['app_catalog', 'save_log'].includes(action) ? 60000 : 10000);
            const jsonPayload = payload ? (typeof payload === 'string' ? payload : JSON.stringify(payload)) : '';
            const escapedPayload = jsonPayload.replace(/'/g, "'\\''");
            const cmd = `sh /data/adb/modules/oneone_fcm/webroot/cgi-bin/exec '${action}' '${escapedPayload}'`;

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

                logDiagnostic(action, { errno, stdout: outStr, stderr: stderr || '' });

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
                logDiagnostic(action, e.message);
                resolve({ success: false, stderr: e.message, data: null });
            }
        });
    }

    let currentStatus = null;
    function renderStatus(data) {
        document.getElementById('gmsFirmware').textContent = data.firmware || '—';
        document.getElementById('gmsDoze').textContent = t('gms.' + (data.doze === 'true' ? 'on' : data.doze === 'false' ? 'off' : 'unknown'));
        const badge = document.getElementById('gmsBadge');
        // Reports only the exemption, not end-to-end FCM delivery.
        badge.textContent = t(data.doze === 'true' ? 'gms.on' : 'gms.unknown');
        badge.className = 'status-pill ' + (data.doze === 'true' ? 'status-running' : 'status-stopped');
    }
    async function loadStatus() {
        const res = await execAction('load_status');
        if (res.success && res.data) {
            currentStatus = res.data;
            renderStatus(currentStatus);
            updateGmsParityUI(res.data.gms_parity);
        } else {
            currentStatus = null;
            const badge = document.getElementById('gmsBadge');
            badge.textContent = t('gms.unknown');
            badge.className = 'status-pill status-stopped';
            updateGmsParityUI({powerkeeper_gms_control: 'unknown', boot_apply: false});
            ['switchPkGms', 'switchPkGmsBoot'].forEach(id => {
                document.getElementById(id).disabled = true;
            });
        }
        await loadFrameworkStatus();
    }

    let appCatalog = [];
    let appSelection = new Set();
    let appDraft = new Set();
    let pickerLoading = false;
    let pickerSaving = false;
    let pickerError = false;
    let pickerAvailable = false;
    let frameworkState = null;
    let frameworkBusy = false;

    function updateSelectionSummary() {
        document.getElementById('appSelectionSummary').textContent = t('apps.selected', { count: appSelection.size });
    }
    function closeAppPicker() {
        if (pickerSaving) return;
        document.getElementById('appPicker').close();
    }
    function readManagerAppCatalog() {
        const bridge = window.ksu || (typeof ksu !== 'undefined' ? ksu : null);
        logDiagnostic('manager.capabilities', { listPackages: typeof bridge?.listPackages, getPackagesInfo: typeof bridge?.getPackagesInfo });
        if (!bridge || typeof bridge.listPackages !== 'function' || typeof bridge.getPackagesInfo !== 'function') return null;
        const decode = value => typeof value === 'string' ? JSON.parse(value) : value;
        try {
            const names = decode(bridge.listPackages('all'));
            logDiagnostic('manager.listPackages', names);
            if (!Array.isArray(names)) throw Error('Invalid package list');
            const packages = [...new Set(names.filter(name => typeof name === 'string'
                && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(name)))];
            if (!packages.length) return null; // Manager cache may not be populated yet.
            const details = decode(bridge.getPackagesInfo(JSON.stringify(packages)));
            logDiagnostic('manager.getPackagesInfo', details);
            if (!Array.isArray(details)) throw Error('Invalid package metadata');
            const byPackage = new Map(details.filter(info => info && typeof info.packageName === 'string')
                .map(info => [info.packageName, info]));
            return packages.flatMap(packageName => {
                const info = byPackage.get(packageName);
                // Never create primary-user policy rows for an explicitly secondary-user UID.
                if (info && Number.isInteger(info.uid) && (info.uid < 0 || info.uid >= 100000)) return [];
                return [{ user: 0, package: packageName,
                    name: info && !info.error && typeof info.appLabel === 'string' && info.appLabel.trim() ? info.appLabel : packageName,
                    system: !!(info && !info.error && info.isSystem === true),
                    icon: 'ksu://icon/' + packageName }];
            });
        } catch (error) {
            logDiagnostic('manager.error', error.stack || error.message);
            console.warn('App picker: manager API unavailable; using package fallback', error.message);
            return null;
        }
    }
    async function readAppCatalog() {
        const nativeApps = readManagerAppCatalog();
        logDiagnostic('catalog.source', nativeApps && nativeApps.length ? 'manager API: ' + nativeApps.length : 'shell fallback');
        if (nativeApps && nativeApps.length) return nativeApps;
        const result = await execAction('app_catalog');
        if (!result.success || !Array.isArray(result.data.apps)) throw Error('Catalog unavailable');
        return result.data.apps.filter(app => app.user === 0
            && /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(app.package));
    }
    async function openAppPicker() {
        const dialog = document.getElementById('appPicker');
        if (dialog.open || pickerLoading) return;
        pickerLoading = true; pickerError = false; pickerAvailable = false;
        appDraft = new Set(appSelection);
        document.getElementById('appSearch').value = '';
        dialog.showModal();
        renderAppPicker();
        try {
            const config = await execAction('whitelist_get');
            if (!config.success) throw Error('Policy unavailable');
            appSelection = new Set((config.data.packages || '').split(',').filter(Boolean));
            appDraft = new Set(appSelection);
            appCatalog = await readAppCatalog();
            pickerAvailable = true;
            updateSelectionSummary();
        } catch (error) { pickerError = true; logDiagnostic('picker.error', error.stack || error.message); console.warn('App picker:', error.message); }
        finally { pickerLoading = false; renderAppPicker(); }
    }
    function renderAppPicker() {
        const list = document.getElementById('appPickerList');
        list.replaceChildren();
        document.getElementById('saveApps').disabled = pickerLoading || pickerSaving || !pickerAvailable;
        document.getElementById('appPickerCount').textContent = t('apps.selected', { count: appDraft.size });
        if (pickerLoading || pickerError) {
            list.textContent = t(pickerLoading ? 'apps.loading' : 'apps.error');
            return;
        }
        const query = document.getElementById('appSearch').value.trim().toLocaleLowerCase();
        const showSystem = document.getElementById('showSystemApps').checked;
        const filtered = appCatalog.filter(app => (!app.system || showSystem || appDraft.has('0:' + app.package))
            && (app.name + ' ' + app.package).toLocaleLowerCase().includes(query));
        if (!filtered.length) { list.textContent = t('apps.empty'); return; }
        const fragment = document.createDocumentFragment();
        for (const app of filtered) {
            const key = '0:' + app.package;
            const row = document.createElement('label'); row.className = 'picker-app';
            const validIcon = app.icon && (/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(app.icon)
                || app.icon === 'ksu://icon/' + app.package);
            const icon = document.createElement(validIcon ? 'img' : 'span');
            icon.className = 'picker-app-icon';
            if (icon.tagName === 'IMG') {
                icon.src = app.icon; icon.alt = ''; icon.loading = 'lazy';
                icon.addEventListener('error', () => {
                    const fallback = document.createElement('span'); fallback.className = 'picker-app-icon';
                    fallback.textContent = (app.name || app.package).slice(0, 1).toUpperCase();
                    fallback.setAttribute('aria-hidden', 'true');
                    row.replaceChild(fallback, icon);
                }, { once: true });
            }
            else { icon.textContent = (app.name || app.package).slice(0, 1).toUpperCase(); icon.setAttribute('aria-hidden', 'true'); }
            const info = document.createElement('div'); info.className = 'picker-app-info';
            const name = document.createElement('div'); name.className = 'picker-app-name'; name.textContent = app.name || app.package;
            const pkg = document.createElement('div'); pkg.className = 'picker-app-package'; pkg.textContent = app.package;
            info.append(name, pkg);
            const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = appDraft.has(key); checkbox.disabled = pickerSaving;
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) appDraft.add(key); else appDraft.delete(key);
                document.getElementById('appPickerCount').textContent = t('apps.selected', { count: appDraft.size });
            });
            row.append(icon, info, checkbox); fragment.append(row);
        }
        list.append(fragment);
    }
    async function saveAppPicker() {
        if (pickerSaving || pickerLoading || !pickerAvailable) return;
        pickerSaving = true; renderAppPicker();
        try {
            const result = await execAction('whitelist_save', [...appDraft].sort().join(','));
            if (!result.success) throw Error('Save failed');
            appSelection = new Set(appDraft); updateSelectionSummary();
            document.getElementById('appPicker').close();
            showToast(t('apps.saved'));
        } catch (error) { showToast(t('apps.save_error')); }
        finally { pickerSaving = false; renderAppPicker(); }
    }
    function renderFrameworkStatus(data) {
        frameworkState = data;
        const state = data.framework || 'unknown';
        const badge = document.getElementById('frameworkBadge');
        badge.textContent = t('framework.' + state);
        badge.className = 'status-pill ' + (state === 'active' ? 'status-running' : 'status-stopped');
        const toggle = document.getElementById('frameworkSwitch');
        toggle.checked = !!data.enabled;
        toggle.disabled = frameworkBusy || !['ready', 'reboot_required', 'active', 'disabled_reboot'].includes(state);
        // Always allow disabling an existing request even after a firmware update.
        if (data.enabled && !frameworkBusy) toggle.disabled = false;
        document.getElementById('prepareFramework').disabled = frameworkBusy || ['unknown', 'unsupported', 'active', 'active_stale', 'disabled_reboot', 'preparing'].includes(state);
    }
    async function loadFrameworkStatus() {
        const result = await execAction('framework_status');
        renderFrameworkStatus(result.success ? result.data : { framework: 'unknown', enabled: false });
        const policy = await execAction('whitelist_get');
        if (policy.success) {
            appSelection = new Set((policy.data.packages || '').split(',').filter(Boolean));
            updateSelectionSummary();
        } else document.getElementById('appSelectionSummary').textContent = t('apps.config_unknown');
    }
    async function toggleFramework(enabled) {
        if (frameworkBusy) return;
        frameworkBusy = true; renderFrameworkStatus(frameworkState || {});
        try {
            const result = await execAction('framework_enable', enabled ? '1' : '0');
            showToast(t(result.success ? 'framework.reboot' : 'apps.save_error'));
        } finally { frameworkBusy = false; await loadFrameworkStatus(); }
    }
    async function prepareFramework() {
        if (frameworkBusy) return;
        frameworkBusy = true; renderFrameworkStatus(frameworkState || {});
        try {
            const result = await execAction('framework_prepare');
            showToast(t(result.success ? 'framework.preparing' : 'apps.save_error'));
            if (result.success) {
                // Bounded UI-only polling while a requested preparation job runs.
                for (let retry = 0; retry < 90; retry++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    await loadFrameworkStatus();
                    if (frameworkState.framework !== 'preparing' && retry > 0) break;
                }
            }
        } finally { frameworkBusy = false; await loadFrameworkStatus(); }
    }

    document.getElementById('appPicker').addEventListener('cancel', event => {
        if (pickerSaving) event.preventDefault();
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

    initTheme();
    initCachedI18n();
    initI18n().finally(() => {
        initTheme();
        applyI18n();
        loadStatus();
    });
