/**
 * 根据是否有新版本显示/隐藏红点
 * @param {boolean} hasNewVersion - 是否有新版本
 */
function updateVersionBadge(hasNewVersion) {
    const dot = document.querySelector('.sidebar-menu .menu-item .update-dot');
    if (dot) {
        dot.style.display = hasNewVersion ? 'inline-block' : 'none';
    }
}
// ========== 全局配置 ==========
const API_BASE = 'https://solitudenook.top';

// ========== 全局变量与状态 ==========
let navItems, cards, highlight, navContainer;
// ========== GitHub 仓库配置 ==========
const GITHUB_REPO = 'readsite/read-download';
const STATE_KEY = 'ios_nav_state';
const DEFAULT_TAB = 'music';
const tabOrder = ['music', 'sentence', 'article'];
let lastVersionCheckTime = 0;
let pendingVersionCheck = null;
let searchModal = null;
let searchCloseBtn = null;
let searchInput = null;
let searchBtn = null;
let searchResults = null;
let currentSearchController = null;
let currentDateController = null;
let currentIndex = 0;
let isAnimating = false;
let albumImage, playPauseIcon, progressFill, trackAlbum, trackSinger;
let currentDisplayDate = '';
let isUpdatingUI = false;
let sidebar, overlay, menuBtn, closeSidebarBtn;
let timelineModal, timelineClose, timelineTrigger;
let currentDate = '';
let isNetworkAvailable = navigator.onLine;
let isShowingOfflinePlaceholder = false;
const offlinePlaceholder = document.getElementById('offlinePlaceholder');
let publishedDates = [];
let isDateListLoading = false;
let isDateSwitching = false;
const dateDataCache = new Map();
let activeCommentRequest = null;
let isLoadingComments = false;
let currentCommentType = null;
let currentCommentDate = null;
let myCommentsCurrentPage = 1;
let myCommentsHasMore = true;
let isLoadingMyComments = false;
let myCommentsList = [];
let currentPreviewUrl = '';
let activeCommentId = null;
let activeCommentContent = '';
let activeCommentOwnerToken = '';
let currentActionSheet = null;
let currentReportCommentId = null;
let pollTimer = null;
const POLL_INTERVAL = 60000;

// ========== IndexedDB 全局存储（替代 localStorage）==========
// 内存存储（同步读取）
let memoryStore = new Map();
let kvStoreReady = false;

// 初始化 KV 存储：从 IndexedDB 加载所有键值到内存
async function initKeyValueStore() {
    const database = await openReadDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(['keyValue'], 'readonly');
        const store = tx.objectStore('keyValue');
        const request = store.getAll();
        request.onsuccess = () => {
            const records = request.result || [];
            records.forEach(record => {
                memoryStore.set(record.key, record.value);
            });
            kvStoreReady = true;
            resolve();
        };
        request.onerror = () => reject(request.error);
    });
}

// 同步读取（从内存）
function getItem(key, defaultValue = null) {
    if (!kvStoreReady) {
        console.warn('KV store not ready, returning default');
        return defaultValue;
    }
    return memoryStore.has(key) ? memoryStore.get(key) : defaultValue;
}

// 同步写入（更新内存 + 异步写 IndexedDB）
function setItem(key, value) {
    memoryStore.set(key, value);
    // 异步写回 IndexedDB，不阻塞
    openReadDB().then(db => {
        const tx = db.transaction(['keyValue'], 'readwrite');
        const store = tx.objectStore('keyValue');
        store.put({ key, value });
        tx.oncomplete = () => {};
        tx.onerror = (err) => console.error('Failed to write to IndexedDB', err);
    }).catch(console.error);
}

// 同步删除
function removeItem(key) {
    memoryStore.delete(key);
    openReadDB().then(db => {
        const tx = db.transaction(['keyValue'], 'readwrite');
        const store = tx.objectStore('keyValue');
        store.delete(key);
        tx.oncomplete = () => {};
    }).catch(console.error);
}

// 清空所有
function clearAll() {
    memoryStore.clear();
    openReadDB().then(db => {
        const tx = db.transaction(['keyValue'], 'readwrite');
        const store = tx.objectStore('keyValue');
        store.clear();
    }).catch(console.error);
}

// 迁移 localStorage 旧数据到 IndexedDB（仅首次运行）
async function migrateFromLocalStorage() {
    if (memoryStore.size > 0) return; // 已有数据，跳过
    let migratedCount = 0;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const value = localStorage.getItem(key);
        setItem(key, value);
        migratedCount++;
    }
    if (migratedCount > 0) {
        console.log(`Migrated ${migratedCount} items from localStorage to IndexedDB`);
        // 可选：清除 localStorage 以释放空间
        // localStorage.clear();
    }
}

// ========== IndexedDB 阅读状态管理 + 内容缓存 ==========
const DB_NAME = 'ReadAppDB';
const DB_VERSION = 3;          // 升级到3，新增 keyValue 存储
const READ_STATUS_STORE = 'readStatus';
const POSTS_STORE = 'posts';
const DATES_LIST_STORE = 'datesList';
const KEY_VALUE_STORE = 'keyValue';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

let db = null;

function openReadDB() {
    return new Promise((resolve, reject) => {
        if (db) {
            resolve(db);
            return;
        }
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(READ_STATUS_STORE)) {
                db.createObjectStore(READ_STATUS_STORE, { keyPath: 'date' });
            }
            if (!db.objectStoreNames.contains(POSTS_STORE)) {
                db.createObjectStore(POSTS_STORE, { keyPath: 'date' });
            }
            if (!db.objectStoreNames.contains(DATES_LIST_STORE)) {
                db.createObjectStore(DATES_LIST_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(KEY_VALUE_STORE)) {
                db.createObjectStore(KEY_VALUE_STORE, { keyPath: 'key' });
            }
        };
    });
}

// ----- 阅读状态（原有功能）-----
async function getDateReadStatus(date) {
    const database = await openReadDB();
    return new Promise((resolve) => {
        const tx = database.transaction([READ_STATUS_STORE], 'readonly');
        const store = tx.objectStore(READ_STATUS_STORE);
        const request = store.get(date);
        request.onsuccess = () => {
            const record = request.result;
            if (record) {
                resolve({
                    music: record.music || false,
                    sentence: record.sentence || false,
                    article: record.article || false
                });
            } else {
                resolve({ music: false, sentence: false, article: false });
            }
        };
        request.onerror = () => resolve({ music: false, sentence: false, article: false });
    });
}

async function updateReadStatus(date, type, value) {
    if (!date) return;
    const database = await openReadDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction([READ_STATUS_STORE], 'readwrite');
        const store = tx.objectStore(READ_STATUS_STORE);
        const getRequest = store.get(date);
        getRequest.onsuccess = () => {
            const record = getRequest.result || { date: date, music: false, sentence: false, article: false };
            if (record[type] === value) {
                resolve();
                return;
            }
            record[type] = value;
            const putRequest = store.put(record);
            putRequest.onsuccess = () => {
                resolve();
                if (document.body.classList.contains('timeline-open')) {
                    refreshTimelineUI();
                }
            };
            putRequest.onerror = reject;
        };
        getRequest.onerror = reject;
    });
}

async function isFullyRead(date) {
    const status = await getDateReadStatus(date);
    return status.music && status.sentence && status.article;
}

async function getFullyReadDates(datesArray) {
    const fullyRead = new Set();
    for (const date of datesArray) {
        if (await isFullyRead(date)) {
            fullyRead.add(date);
        }
    }
    return fullyRead;
}

async function refreshTimelineUI() {
    if (!document.body.classList.contains('timeline-open')) return;
    await loadTimelineData();
}

// ----- 内容缓存操作 -----
async function getCachedPost(date) {
    const database = await openReadDB();
    return new Promise((resolve) => {
        const tx = database.transaction([POSTS_STORE], 'readonly');
        const store = tx.objectStore(POSTS_STORE);
        const request = store.get(date);
        request.onsuccess = () => {
            const record = request.result;
            if (record && (Date.now() - record.cachedAt) < CACHE_TTL) {
                resolve(record.data);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

async function cachePost(date, data) {
    const database = await openReadDB();
    const record = {
        date: date,
        data: data,
        cachedAt: Date.now()
    };
    const tx = database.transaction([POSTS_STORE], 'readwrite');
    const store = tx.objectStore(POSTS_STORE);
    store.put(record);
    return new Promise(resolve => { tx.oncomplete = resolve; });
}

async function fetchPostFromNetwork(date, { signal } = {}) {
    const response = await fetch(`${API_BASE}/api/posts/${date}`, { signal });
    if (!response.ok) throw new Error('No data');
    return await response.json();
}

async function refreshPostInBackground(date) {
    if (!navigator.onLine) return;
    try {
        const freshData = await fetchPostFromNetwork(date);
        const oldData = await getCachedPost(date);
        if (JSON.stringify(oldData) !== JSON.stringify(freshData)) {
            await cachePost(date, freshData);
            if (currentDate === date) {
                updatePage(freshData, date);
                loadLikedStateFromLocalStorage(date);
                audioManager.updateUIForDate(date);
                dateDataCache.set(date, freshData);
            }
        }
    } catch (err) {
        console.warn('后台更新失败', err);
    }
}

// ----- 日期列表缓存 -----
async function getCachedDatesList() {
    const database = await openReadDB();
    return new Promise((resolve) => {
        const tx = database.transaction([DATES_LIST_STORE], 'readonly');
        const store = tx.objectStore(DATES_LIST_STORE);
        const request = store.get('dates');
        request.onsuccess = () => {
            const record = request.result;
            if (record && (Date.now() - record.cachedAt) < CACHE_TTL) {
                resolve(record.dates);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => resolve(null);
    });
}

async function cacheDatesList(dates) {
    const database = await openReadDB();
    const record = {
        id: 'dates',
        dates: dates,
        cachedAt: Date.now()
    };
    const tx = database.transaction([DATES_LIST_STORE], 'readwrite');
    const store = tx.objectStore(DATES_LIST_STORE);
    store.put(record);
    return new Promise(resolve => { tx.oncomplete = resolve; });
}

// ========== 工具函数 ==========
function showToast(message, duration = 2000) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function getDeviceToken() {
    const DEVICE_TOKEN_KEY = 'device_token';
    let token = getItem(DEVICE_TOKEN_KEY);
    if (!token) {
        token = 'device_' + Date.now() + '_' + Math.random().toString(36).substr(2, 16);
        setItem(DEVICE_TOKEN_KEY, token);
    }
    return token;
}

// ========== 网络状态管理 ==========
function showOfflinePlaceholder(show) {
    if (show === isShowingOfflinePlaceholder) return;
    isShowingOfflinePlaceholder = show;
    if (offlinePlaceholder) offlinePlaceholder.style.display = show ? 'flex' : 'none';
    if (show) document.body.classList.remove('online');
    else document.body.classList.add('online');
}

async function retryNetworkAndReload() {
    if (!navigator.onLine) {
        showToast('网络未连接，请检查网络设置', 1500);
        return false;
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
        const res = await fetch(`${API_BASE}/api/dates`, { method: 'GET', cache: 'no-store', signal: controller.signal });
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('网络请求失败');
        publishedDates = [];
        isDateListLoading = false;
        await fetchPublishedDatesList(true);
        isNetworkAvailable = true;
        showOfflinePlaceholder(false);
        const urlDate = getDateFromUrl();
        if (urlDate && urlDate !== currentDate) await switchToDate(urlDate);
        else if (currentDate) {
            dateDataCache.delete(currentDate);
            await loadDataForDate(currentDate);
        } else {
            const allDates = await fetchPublishedDatesList();
            const latestDate = allDates.length ? allDates[allDates.length - 1] : null;
            if (latestDate) await switchToDate(latestDate);
            else showToast('暂无内容，请稍后再试', 1500);
        }
        return true;
    } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') showToast('网络请求超时，请检查网络后重试', 2000);
        else showToast('网络仍未恢复，请稍后再试', 1500);
        return false;
    }
}

function handleNetworkError(error) {
    console.warn('网络请求失败', error);
    isNetworkAvailable = false;
    showOfflinePlaceholder(true);
}

// ========== 日期列表与切换 ==========
async function fetchPublishedDatesList(forceRefresh = false) {
    if (!forceRefresh && publishedDates.length > 0) return publishedDates;
    if (isDateListLoading) {
        await new Promise(resolve => {
            const checkInterval = setInterval(() => {
                if (!isDateListLoading) { clearInterval(checkInterval); resolve(); }
            }, 50);
        });
        return publishedDates;
    }
    isDateListLoading = true;
    if (!forceRefresh) {
        const cached = await getCachedDatesList();
        if (cached && cached.length) {
            publishedDates = cached;
            isDateListLoading = false;
            return publishedDates;
        }
    }
    try {
        const res = await fetch(`${API_BASE}/api/dates`);
        if (!res.ok) throw new Error('获取日期列表失败');
        const dates = await res.json();
        publishedDates = Array.isArray(dates) ? dates : [];
        await cacheDatesList(publishedDates);
        isNetworkAvailable = true;
        showOfflinePlaceholder(false);
        return publishedDates;
    } catch (err) {
        console.warn('获取日期列表失败', err);
        publishedDates = [];
        handleNetworkError(err);
        return [];
    } finally {
        isDateListLoading = false;
    }
}

function getPrevPublishedDate(currentDate) {
    if (!publishedDates.length) return null;
    const idx = publishedDates.indexOf(currentDate);
    if (idx <= 0) return null;
    return publishedDates[idx - 1];
}

function getNextPublishedDate(currentDate) {
    if (!publishedDates.length) return null;
    const idx = publishedDates.indexOf(currentDate);
    if (idx === -1 || idx >= publishedDates.length - 1) return null;
    return publishedDates[idx + 1];
}

async function switchToDate(date, targetTab = null, options = {}) {
    if (!targetTab) targetTab = 'music';
    if (date === currentDate && targetTab === tabOrder[currentIndex]) {
        closeTimelineModal();
        return;
    }
    if (!navigator.onLine || !isNetworkAvailable) {
        showToast('网络连接不可用，无法切换日期', 1500);
        showOfflinePlaceholder(true);
        return;
    }
    if (isDateSwitching) return;
    isDateSwitching = true;

    const containerWidth = document.querySelector('.card-container').clientWidth;
    const allCards = document.querySelectorAll('.card');
    // 确定切换方向：更早日期向左，更新日期向右（优先使用传入的 fromOffset 方向）
    let direction = options.fromDirection;
    if (!direction) {
        direction = date < currentDate ? -1 : 1;
    }

    // 1. 先加载新日期数据（会静默更新 DOM，但此时卡片不可见）
    await loadDataForDate(date);
    markCurrentCardRead();
    closeTimelineModal();
    const newUrl = `?date=${date}`;
    window.history.pushState({ date }, '', newUrl);

    // 2. 切换目标分类（如果需要）
    if (targetTab) {
        const targetIndex = getIndexFromId(targetTab);
        if (targetIndex !== currentIndex) {
            currentIndex = targetIndex;
            navItems.forEach(item => item.classList.remove('active'));
            document.querySelector(`[data-target="${targetTab}"]`).classList.add('active');
            updateHighlight();
            setItem(STATE_KEY, targetTab);
        }
    }

    // 3. 将所有卡片直接置于进入起始位置（无动画，无退出）
    let startOffset;
    if (options.fromOffset !== undefined && options.fromDirection) {
        // 拖拽结束时保留偏移，继续从此偏移动画到 0
        startOffset = options.fromOffset;
    } else {
        // 非拖拽触发（点击时间轴等）则从完全屏幕外开始滑入
        startOffset = direction * containerWidth;
    }

    for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
        card.style.transition = 'none';
        const base = i === currentIndex ? 0 : (i < currentIndex ? -containerWidth : containerWidth);
        card.style.transform = `translateX(${base + startOffset}px)`;
        card.style.opacity = i === currentIndex ? '1' : '0';
    }

    // 4. 强制重绘后，播放唯一一次平滑滑入动画
    void allCards[0].offsetHeight;
    for (let i = 0; i < allCards.length; i++) {
        const card = allCards[i];
card.style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1), opacity 0.3s ease';
        const base = i === currentIndex ? 0 : (i < currentIndex ? -containerWidth : containerWidth);
        card.style.transform = `translateX(${base}px)`;
        card.style.opacity = i === currentIndex ? '1' : '0';
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    // 5. 清理
    for (let card of allCards) {
        card.style.transition = '';
        card.style.opacity = '';
    }
    setCardsPosition(currentIndex);
    isDateSwitching = false;
    if (typeof window.resetDragModule === 'function') window.resetDragModule();
}
function markCurrentCardRead() {
    if (!currentDate) return;
    const currentType = tabOrder[currentIndex];
    if (currentType === 'sentence' || currentType === 'article') {
        updateReadStatus(currentDate, currentType, true).catch(e => console.warn('标记已读失败', e));
    }
}
function getDateFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('date');
}

function displayDateInNav(date) {
    const [year, month, day] = date.split('-');
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    document.querySelector('.date-year').innerHTML = `${year}.${monthNum}.<span class="date-day">${dayNum}<span class="date-tag"></span></span>`;
}

function loadLikedStateFromLocalStorage(date) {
    ['music', 'sentence', 'article'].forEach(type => {
        const key = `${date}_${type}_favorite`;
        const isLiked = getItem(key) === 'true';
        const btnIcon = document.querySelector(`.stats-actions[data-type="${type}"] .favorite-btn i`);
        if (btnIcon) {
            if (isLiked) {
                btnIcon.classList.remove('ri-bookmark-line');
                btnIcon.classList.add('ri-bookmark-fill');
            } else {
                btnIcon.classList.remove('ri-bookmark-fill');
                btnIcon.classList.add('ri-bookmark-line');
            }
        }
    });
}

// ========== 核心：缓存优先加载日期数据 ==========
async function loadDataForDate(date, options = { forceRefresh: false }) {
    if (!date) return;
    if (currentDateController) {
        currentDateController.abort();
    }
    const controller = new AbortController();
    currentDateController = controller;
    const signal = controller.signal;

    currentDate = date;
    currentDisplayDate = date;
    displayDateInNav(date);

    const onErrorOrAbort = (err) => {
        if (err.name === 'AbortError') {
            console.log(`加载日期 ${date} 的请求已被取消`);
            return;
        }
        console.warn(`加载日期 ${date} 失败`, err);
        handleNetworkError(err);
        updatePage({}, date);
        updateCardVerticalPosition();
        audioManager.updateUIForDate(date);
    };

    try {
        let data = dateDataCache.get(date);
        if (data && !options.forceRefresh) {
            updatePage(data, date);
            loadLikedStateFromLocalStorage(date);
            updateCardVerticalPosition();
            audioManager.updateUIForDate(date);
            refreshPostInBackground(date);
            return;
        }
        const cachedData = await getCachedPost(date);
        if (cachedData && !options.forceRefresh) {
            dateDataCache.set(date, cachedData);
            updatePage(cachedData, date);
            loadLikedStateFromLocalStorage(date);
            updateCardVerticalPosition();
            audioManager.updateUIForDate(date);
            refreshPostInBackground(date);
            return;
        }
        const freshData = await fetchPostFromNetwork(date, { signal });
        await cachePost(date, freshData);
        dateDataCache.set(date, freshData);
        updatePage(freshData, date);
        loadLikedStateFromLocalStorage(date);
        updateCardVerticalPosition();
        audioManager.updateUIForDate(date);
        isNetworkAvailable = true;
        showOfflinePlaceholder(false);
    } catch (err) {
        onErrorOrAbort(err);
    } finally {
        if (currentDateController === controller) {
            currentDateController = null;
        }
    }
}

function updatePage(data, date) {
    const musicTitle = data.music?.title || '';
    const musicArtist = data.music?.artist || '';
    const musicCover = data.music?.cover || '';
    const musicSrc = data.music?.src || '';
    trackAlbum.textContent = musicTitle;
    trackSinger.textContent = musicArtist;
    const albumImg = document.getElementById('album-img');
    albumImg.onload = null;
    albumImg.onerror = null;
    albumImg.style.display = 'none';
    if (musicCover) {
        albumImg.onload = () => { albumImg.style.display = 'block'; };
        albumImg.onerror = () => { albumImg.style.display = 'none'; };
        albumImg.src = musicCover;
        if (albumImg.complete) albumImg.onload();
    } else {
        albumImg.style.display = 'none';
    }
    if (musicSrc) audioManager.getOrCreate(date, musicSrc, musicTitle, musicArtist, musicCover);
    else {
        const existing = audioManager.getPlayerState(date);
        if (existing) { existing.audio.pause(); existing.playing = false; }
    }
    const sentenceTextEl = document.getElementById('sentenceText');
    if (sentenceTextEl) sentenceTextEl.innerHTML = (data.sentence?.text || '').replace(/\n/g, '<br>');
    const fromSpan = document.querySelector('#sentence .from span');
    if (fromSpan) fromSpan.textContent = data.sentence?.author ? '—' + data.sentence.author : '';
    const sentenceImgContainer = document.getElementById('sentenceImageContainer');
    const sentenceImg = document.getElementById('sentenceImg');
    const sentenceImageUrl = data.sentence?.image || '';
    if (sentenceImageUrl && sentenceImgContainer && sentenceImg) {
        sentenceImg.src = sentenceImageUrl;
        sentenceImgContainer.style.display = 'block';
    } else if (sentenceImgContainer) sentenceImgContainer.style.display = 'none';
    document.getElementById('article-title').textContent = data.article?.title || '';
    document.getElementById('article-author').textContent = `文/${data.article?.author || '佚名'}`;
    document.getElementById('article-content').innerHTML = (data.article?.content || '').replace(/\n/g, '<br>');
    const articleImg = document.querySelector('#article .bg-img img');
    const articleBg = document.querySelector('#article .bg-img');
    if (articleImg && articleBg) {
        articleImg.style.display = 'none';
        articleBg.classList.remove('load-failed');
        const imageUrl = data.article?.image || '';
        if (imageUrl) {
            articleImg.onload = () => { articleImg.style.display = 'block'; };
            articleImg.onerror = () => { articleBg.classList.add('load-failed'); articleImg.style.display = 'none'; };
            articleImg.src = imageUrl;
        } else articleBg.classList.add('load-failed');
    }
    const musicStats = data.musicStats || { favorites: 0, shares: 0 };
    const sentenceStats = data.sentenceStats || { favorites: 0, shares: 0 };
    const articleStats = data.articleStats || { favorites: 0, shares: 0 };
    document.querySelector('#music .stats-actions .favorite-btn .count').textContent = musicStats.favorites;
    document.querySelector('#music .stats-actions .share-btn .count').textContent = musicStats.shares;
    document.querySelector('#sentence .stats-actions .favorite-btn .count').textContent = sentenceStats.favorites;
    document.querySelector('#sentence .stats-actions .share-btn .count').textContent = sentenceStats.shares;
    document.querySelector('#article .stats-actions .favorite-btn .count').textContent = articleStats.favorites;
    document.querySelector('#article .stats-actions .share-btn .count').textContent = articleStats.shares;
    currentDisplayDate = date;
    updateAllCommentsCount(date);
}

// ========== 音频管理器 ==========
class AudioManager {
    constructor() {
        this.players = new Map();
        this.currentPlayingDate = null;
        this.uiUpdateTimer = null;
    }
    getOrCreate(date, src, title, artist, cover) {
        if (!this.players.has(date)) {
            const audio = new Audio();
            audio.src = src;
            audio.preload = 'metadata';
            audio.loop = false;
            audio.addEventListener('timeupdate', () => this.onTimeUpdate(date, audio));
            audio.addEventListener('ended', () => this.onEnded(date));
            audio.addEventListener('play', () => this.onPlay(date));
            audio.addEventListener('pause', () => this.onPause(date));
            this.players.set(date, { audio, playing: false, currentTime: 0, src, title, artist, cover });
        } else {
            const player = this.players.get(date);
            if (player.src !== src && src) {
                player.src = src;
                player.audio.src = src;
                player.playing = false;
                player.currentTime = 0;
                player.audio.currentTime = 0;
            }
            if (title) player.title = title;
            if (artist) player.artist = artist;
            if (cover) player.cover = cover;
        }
        return this.players.get(date);
    }
play(date) {
    const player = this.players.get(date);
    if (!player || !player.src) return false;

    // 检查网络状态
    if (!navigator.onLine) {
        showToast('网络连接不可用，无法播放');
        return false;
    }

    if (this.currentPlayingDate && this.currentPlayingDate !== date) this.stop(this.currentPlayingDate);
    if (player.audio.paused) {
        const playPromise = player.audio.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                player.playing = true;
                this.currentPlayingDate = date;
                if (date === currentDisplayDate) this.updateUIForDate(date);
                updateReadStatus(date, 'music', true).catch(console.warn);
            }).catch(e => {
                console.warn('播放失败', e);
                showToast('音乐加载失败，请检查网络');
                // 强制同步 UI 状态（恢复为暂停图标）
                if (date === currentDisplayDate) this.updateUIForDate(date);
            });
        } else {
            // 旧版浏览器降级处理
            try {
                player.audio.play();
                player.playing = true;
                this.currentPlayingDate = date;
                if (date === currentDisplayDate) this.updateUIForDate(date);
                updateReadStatus(date, 'music', true).catch(console.warn);
            } catch (err) {
                showToast('播放失败，请稍后重试');
            }
        }
    }
    return true;
}
    pause(date) {
        const player = this.players.get(date);
        if (player && !player.audio.paused) {
            player.audio.pause();
            player.playing = false;
            if (this.currentPlayingDate === date) this.currentPlayingDate = null;
            if (date === currentDisplayDate) this.updateUIForDate(date);
        }
    }
    stop(date) {
        const player = this.players.get(date);
        if (player) {
            player.audio.pause();
            player.audio.currentTime = 0;
            player.audio.load();
            player.playing = false;
            player.currentTime = 0;
            if (this.currentPlayingDate === date) this.currentPlayingDate = null;
            if (date === currentDisplayDate) this.updateUIForDate(date);
        }
    }
    stopAllExcept(exceptDate) {
        for (let [date, player] of this.players.entries()) {
            if (date !== exceptDate && player.playing) {
                player.audio.pause();
                player.playing = false;
                if (this.currentPlayingDate === date) this.currentPlayingDate = null;
            }
        }
    }
    getPlayerState(date) { return this.players.get(date) || null; }
    updateUIForDate(date) {
        if (isUpdatingUI || date !== currentDisplayDate) return;
        isUpdatingUI = true;
        const player = this.players.get(date);
        if (player) {
            if (player.playing) {
                playPauseIcon.classList.remove('pause');
                playPauseIcon.classList.add('play');
                albumImage.classList.add('rotating');
                albumImage.style.animationPlayState = 'running';
            } else {
                playPauseIcon.classList.remove('play');
                playPauseIcon.classList.add('pause');
                albumImage.style.animationPlayState = 'paused';
            }
            const duration = player.audio.duration;
            if (duration && isFinite(duration)) progressFill.style.width = (player.audio.currentTime / duration) * 100 + '%';
            else progressFill.style.width = '0%';
        } else {
            playPauseIcon.classList.remove('play');
            playPauseIcon.classList.add('pause');
            albumImage.classList.remove('rotating');
            progressFill.style.width = '0%';
        }
        isUpdatingUI = false;
    }
    onTimeUpdate(date, audio) {
        if (date === currentDisplayDate && !isUpdatingUI && audio.duration) {
            progressFill.style.width = (audio.currentTime / audio.duration) * 100 + '%';
        }
        const player = this.players.get(date);
        if (player) player.currentTime = audio.currentTime;
    }
    onEnded(date) {
        const player = this.players.get(date);
        if (player) {
            player.playing = false;
            player.currentTime = 0;
            player.audio.currentTime = 0;
            if (this.currentPlayingDate === date) this.currentPlayingDate = null;
            if (date === currentDisplayDate) {
                this.updateUIForDate(date);
                progressFill.style.width = '0%';
            }
        }
    }
    onPlay(date) {
        const player = this.players.get(date);
        if (player) {
            player.playing = true;
            if (this.currentPlayingDate !== date) {
                this.stopAllExcept(date);
                this.currentPlayingDate = date;
            }
            if (date === currentDisplayDate) this.updateUIForDate(date);
        }
    }
    onPause(date) {
        const player = this.players.get(date);
        if (player) {
            player.playing = false;
            if (this.currentPlayingDate === date) this.currentPlayingDate = null;
            if (date === currentDisplayDate) this.updateUIForDate(date);
        }
    }
    clear() {
        for (let [date, player] of this.players.entries()) {
            player.audio.pause();
            player.audio.src = '';
        }
        this.players.clear();
        this.currentPlayingDate = null;
    }
}
const audioManager = new AudioManager();

// ========== 卡片切换 ==========
function updateCardVerticalPosition() {
    const nav = document.querySelector('.top-nav');
    const cardContainer = document.querySelector('.card-container');
    if (!nav || !cardContainer) return;
    const navHeight = nav.offsetHeight;
    const viewportHeight = window.innerHeight;
    cardContainer.style.height = (viewportHeight - navHeight) + 'px';
    cardContainer.style.top = navHeight + 'px';
}

function setCardsPosition(activeIndex) {
    cards.forEach((card, i) => {
        if (i === activeIndex) {
            card.style.transform = 'translateX(0)';
            card.style.opacity = '1';
            card.style.zIndex = '2';
            card.style.pointerEvents = 'auto';
        } else {
            const offset = i < activeIndex ? '-100%' : '100%';
            card.style.transform = `translateX(${offset})`;
            card.style.opacity = '0';
            card.style.zIndex = '1';
            card.style.pointerEvents = 'none';
        }
    });
}

function switchTo(newIndex) {
    if (isAnimating || newIndex === currentIndex) return;
    isAnimating = true;
    currentIndex = newIndex;
    setCardsPosition(newIndex);
    const targetId = tabOrder[newIndex];
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
    updateHighlight();

    if (currentDate) {
        if (targetId === 'sentence') {
            updateReadStatus(currentDate, 'sentence', true).catch(console.warn);
        } else if (targetId === 'article') {
            updateReadStatus(currentDate, 'article', true).catch(console.warn);
        }
    }

    setTimeout(() => { isAnimating = false; }, 400);
}

function getIndexFromId(id) { return tabOrder.indexOf(id); }

function updateHighlight() {
    const activeItem = document.querySelector('.nav-item.active');
    if (!activeItem) return;
    const navRect = navContainer.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    highlight.style.width = `${itemRect.width}px`;
    highlight.style.height = `3px`;
    highlight.style.left = `${itemRect.left - navRect.left}px`;
    highlight.style.top = `${itemRect.bottom - navRect.top + 1}px`;
    highlight.style.opacity = '1';
}

// ========== 收藏功能 ==========
const FAVORITE_SUMMARY_KEY_PREFIX = 'fav_summary_';
function saveFavoriteSummary(date, type, data) {
    let summary = null;
    if (type === 'music' && data.music) summary = { title: data.music.title, subtitle: data.music.artist, cover: data.music.cover, preview: '' };
    else if (type === 'sentence' && data.sentence) summary = { title: '', subtitle: data.sentence.author, cover: data.sentence.image || '', preview: data.sentence.text };
    else if (type === 'article' && data.article) summary = { title: data.article.title, subtitle: data.article.author, cover: data.article.image, preview: data.article.content.replace(/\n/g, ' ') };
    if (summary) setItem(`${FAVORITE_SUMMARY_KEY_PREFIX}${date}_${type}`, JSON.stringify(summary));
}
function removeFavoriteSummary(date, type) { removeItem(`${FAVORITE_SUMMARY_KEY_PREFIX}${date}_${type}`); }

function getFavoritesFromStorage() {
    const favorites = [];
    for (let [key, value] of memoryStore.entries()) {
        if (key && /^\d{4}-\d{2}-\d{2}_(music|sentence|article)_favorite$/.test(key) && value === 'true') {
            const [date, type] = key.split('_');
            favorites.push({ date, type });
        }
    }
    return favorites;
}

function groupFavoritesByDate(favorites) {
    const groups = new Map();
    favorites.forEach(item => {
        if (!groups.has(item.date)) groups.set(item.date, []);
        groups.get(item.date).push(item.type);
    });
    return groups;
}

async function fetchDateData(date) {
    if (dateDataCache.has(date)) return dateDataCache.get(date);
    try {
        const response = await fetch(`${API_BASE}/api/posts/${date}`);
        if (!response.ok) throw new Error('No data');
        const data = await response.json();
        dateDataCache.set(date, data);
        return data;
    } catch (error) { console.warn(`获取日期 ${date} 数据失败`, error); return null; }
}

let currentlyOpenedSwipe = null;
function closeAllSwipedItems() {
    if (currentlyOpenedSwipe) {
        const inner = currentlyOpenedSwipe.querySelector('.swipe-inner');
        if (inner) inner.style.transform = 'translateX(0px)';
        currentlyOpenedSwipe = null;
    }
}

function bindSwipeEvents(container) {
    if (!container || container.dataset.swipeBound === 'true') return;
    container.dataset.swipeBound = 'true';
    let startX = 0, startY = 0, currentTranslate = 0, startTranslate = 0, isSwiping = false, isHorizontal = false, directionLocked = false;
    const DELETE_BTN_WIDTH = 70;
    const THRESHOLD = DELETE_BTN_WIDTH * 0.5;
    const swipeInner = container.querySelector('.swipe-inner');
    if (!swipeInner) return;
    function getCurrentTranslate() { return swipeInner.style.transform === `translateX(-${DELETE_BTN_WIDTH}px)` ? -DELETE_BTN_WIDTH : 0; }
    function applyTranslate(delta) {
        let newTranslate = startTranslate + delta;
        if (newTranslate > 0) newTranslate *= 0.3;
        else if (newTranslate < -DELETE_BTN_WIDTH) newTranslate = -DELETE_BTN_WIDTH + (newTranslate + DELETE_BTN_WIDTH) * 0.3;
        newTranslate = Math.min(0, Math.max(-DELETE_BTN_WIDTH, newTranslate));
        swipeInner.style.transform = `translateX(${newTranslate}px)`;
        currentTranslate = newTranslate;
    }
    function onStart(clientX, clientY) {
        closeAllSwipedItems();
        startX = clientX; startY = clientY;
        startTranslate = getCurrentTranslate();
        isSwiping = true; isHorizontal = false; directionLocked = false;
        container.style.transition = 'none';
    }
    function onMove(clientX, clientY) {
        if (!isSwiping) return;
        const deltaX = clientX - startX, deltaY = clientY - startY;
        if (!directionLocked) {
            const absX = Math.abs(deltaX), absY = Math.abs(deltaY);
            if (absX > 8 || absY > 8) { directionLocked = true; isHorizontal = absX > absY; }
        }
        if (!isHorizontal) return;
        if (event && event.preventDefault) event.preventDefault();
        applyTranslate(deltaX);
    }
    function onEnd(clientX) {
        if (!isSwiping) { swipeInner.style.transition = ''; return; }
        isSwiping = false;
        container.style.transition = '';
        if (!isHorizontal) { swipeInner.style.transform = 'translateX(0px)'; swipeInner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)'; if (currentlyOpenedSwipe === container) currentlyOpenedSwipe = null; return; }
        const deltaX = clientX - startX;
        let finalTranslate = 0;
        const isCurrentlyOpen = (currentTranslate === -DELETE_BTN_WIDTH);
        if (isCurrentlyOpen) finalTranslate = (deltaX > THRESHOLD) ? 0 : -DELETE_BTN_WIDTH;
        else finalTranslate = (deltaX < -THRESHOLD) ? -DELETE_BTN_WIDTH : 0;
        swipeInner.style.transform = `translateX(${finalTranslate}px)`;
        swipeInner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
        if (finalTranslate === -DELETE_BTN_WIDTH) {
            if (currentlyOpenedSwipe && currentlyOpenedSwipe !== container) {
                const prevInner = currentlyOpenedSwipe.querySelector('.swipe-inner');
                if (prevInner) prevInner.style.transform = 'translateX(0px)';
            }
            currentlyOpenedSwipe = container;
        } else if (currentlyOpenedSwipe === container) currentlyOpenedSwipe = null;
    }
    const onTouchStart = (e) => { if (e.target.closest('.delete-btn-area')) return; const touch = e.touches[0]; onStart(touch.clientX, touch.clientY); };
    const onTouchMove = (e) => { if (!isSwiping) return; const touch = e.touches[0]; onMove(touch.clientX, touch.clientY); if (isHorizontal) e.preventDefault(); };
    const onTouchEnd = (e) => { const changed = e.changedTouches[0]; onEnd(changed.clientX); };
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
}

function renderFavoriteCard(type, data, date) {
    let contentHtml = '';
    switch (type) {
        case 'music':
            if (!data.music || !data.music.title) return '';
            contentHtml = `<div class="favorite-card music-card"><img class="card-cover" src="${data.music.cover || ''}" onerror="this.src='img/default-cover.png'"><div class="card-info"><div class="card-title">${escapeHtml(data.music.title)}</div><div class="card-subtitle">${escapeHtml(data.music.artist || '未知歌手')}</div></div><i class="ri-play-circle-line" style="color: #999; font-size: 22px;"></i></div>`;
            break;
        case 'sentence':
            if (!data.sentence || !data.sentence.text) return '';
            contentHtml = `<div class="favorite-card sentence-card"><img class="card-cover" src="${data.sentence.image || ''}" onerror="this.src='img/default-sentence.png'"><div class="card-info"><div class="card-preview">“${escapeHtml(data.sentence.text)}”</div><div class="card-subtitle">${escapeHtml(data.sentence.author || '佚名')}</div></div><i class="ri-article-line" style="color: #999; font-size: 22px;"></i></div>`;
            break;
        case 'article':
            if (!data.article || !data.article.title) return '';
            const fullPreview = data.article.content ? data.article.content.replace(/\n/g, ' ') : '';
            contentHtml = `<div class="favorite-card article-card"><img class="card-cover" src="${data.article.image || ''}" onerror="this.src='img/default-article.png'"><div class="card-info"><div class="card-title-row"><div class="card-title">${escapeHtml(data.article.title)}</div><div class="card-subtitle">${escapeHtml(data.article.author || '')}</div></div><div class="card-preview">${escapeHtml(fullPreview)}</div></div><i class="ri-newspaper-line" style="color: #999; font-size: 22px;"></i></div>`;
            break;
        default: return '';
    }
    return `<div class="swipe-container" data-date="${date}" data-type="${type}"><div class="swipe-inner"><div class="card-content" data-date="${date}" data-type="${type}">${contentHtml}</div><div class="delete-btn-area" data-delete-date="${date}" data-delete-type="${type}"><i class="ri-delete-bin-line"></i></div></div></div>`;
}

async function renderFavorites() {
    const favoritesBody = document.getElementById('favoritesBody');
    if (!favoritesBody) return;
    favoritesBody.classList.remove('empty', 'has-favorites');
    const favorites = getFavoritesFromStorage();
    if (favorites.length === 0) {
        favoritesBody.classList.add('empty');
        favoritesBody.innerHTML = `<div class="empty-favorites"><i class="ri-bookmark-fill"></i><p>暂无收藏内容</p></div>`;
        return;
    }
    const groups = groupFavoritesByDate(favorites);
    const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
    let html = '';
    const needFetchDates = new Set();
    for (const date of sortedDates) {
        const types = groups.get(date);
        const [year, month, day] = date.split('-');
        const formattedDate = `${year}年${parseInt(month)}月${parseInt(day)}日`;
        html += `<div class="favorites-date-group" data-date="${date}"><div class="date-group-header">-&nbsp;${formattedDate}&nbsp;-</div>`;
        for (const type of ['music', 'sentence', 'article']) {
            if (!types.includes(type)) continue;
            const fullData = dateDataCache.get(date);
if (fullData) {
    html += renderFavoriteCard(type, fullData, date);
} else {
    // 尝试读取本地摘要
    const summaryKey = `${FAVORITE_SUMMARY_KEY_PREFIX}${date}_${type}`;
    const summaryStr = getItem(summaryKey);
    let summaryData = null;
    if (summaryStr) {
        try {
            summaryData = JSON.parse(summaryStr);
        } catch(e) {}
    }
    if (summaryData) {
        // 根据摘要构建一个最小化的 data 对象供 renderFavoriteCard 使用
        let fakeData = {};
        if (type === 'music') {
            fakeData.music = { title: summaryData.title, artist: summaryData.subtitle, cover: summaryData.cover };
        } else if (type === 'sentence') {
            fakeData.sentence = { text: summaryData.preview, author: summaryData.subtitle, image: summaryData.cover };
        } else if (type === 'article') {
            fakeData.article = { title: summaryData.title, author: summaryData.subtitle, image: summaryData.cover, content: summaryData.preview };
        }
        html += renderFavoriteCard(type, fakeData, date);
    } else {
        html += `<div class="swipe-container placeholder" data-date="${date}" data-type="${type}"><div class="swipe-inner"><div class="card-content"><div class="favorite-card ${type}-card"><div class="card-icon"><i class="ri-loader-4-line"></i></div><div class="card-info"><div class="card-title">加载中...</div></div></div></div><div class="delete-btn-area" data-delete-date="${date}" data-delete-type="${type}"><i class="ri-delete-bin-line"></i></div></div></div>`;
        needFetchDates.add(date);
    }
}
        }
        html += `</div>`;
    }
    favoritesBody.innerHTML = html;
    favoritesBody.classList.add('has-favorites');
    document.querySelectorAll('#favoritesBody .swipe-container').forEach(container => bindSwipeEvents(container));
    if (needFetchDates.size) {
        const fetchPromises = Array.from(needFetchDates).map(date => fetchDateData(date));
        const results = await Promise.allSettled(fetchPromises);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const date = Array.from(needFetchDates)[i];
            if (result.status === 'fulfilled' && result.value) {
                const types = groups.get(date);
                for (const type of types) {
                    saveFavoriteSummary(date, type, result.value);
                    const targetCard = document.querySelector(`.swipe-container[data-date="${date}"][data-type="${type}"]`);
                    if (targetCard) {
                        const newCardHtml = renderFavoriteCard(type, result.value, date);
                        if (newCardHtml) {
                            targetCard.outerHTML = newCardHtml;
                            bindSwipeEvents(document.querySelector(`.swipe-container[data-date="${date}"][data-type="${type}"]`));
                        }
                    }
                }
            }
        }
    }
    document.getElementById('favoritesBody').addEventListener('click', (e) => {
      e.stopPropagation();
        const deleteArea = e.target.closest('.delete-btn-area');
        if (deleteArea) {
            e.stopPropagation();
            const swipeContainer = deleteArea.closest('.swipe-container');
            if (swipeContainer) executeDeleteFavorite(swipeContainer, swipeContainer.dataset.date, swipeContainer.dataset.type);
            return;
        }
        const cardContent = e.target.closest('.card-content');
        if (cardContent && currentlyOpenedSwipe) closeAllSwipedItems();
        const swipeContainer = e.target.closest('.swipe-container');
        if (swipeContainer && !deleteArea && !e.target.closest('.delete-btn-area')) {
            if (currentlyOpenedSwipe) closeAllSwipedItems();
            else if (swipeContainer.dataset.date && swipeContainer.dataset.type) navigateToContent(swipeContainer.dataset.date, swipeContainer.dataset.type);
        }
    });
}

async function executeDeleteFavorite(swipeContainer, date, type) {
    if (!swipeContainer) return;
    const deleteBtn = swipeContainer.querySelector('.delete-btn-area');
    if (deleteBtn) deleteBtn.style.pointerEvents = 'none';
    if (!navigator.onLine || !isNetworkAvailable) {
        await performLocalDelete(swipeContainer, date, type);
        if (deleteBtn) deleteBtn.style.pointerEvents = '';
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/api/posts/${date}/stats/${type}/favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: -1 }) });
        if (!response.ok) throw new Error('取消收藏失败');
        const data = await response.json();
        removeItem(`${date}_${type}_favorite`);
        removeFavoriteSummary(date, type);
        if (currentDate === date) {
            const statsKey = type + 'Stats';
            const newStats = data[statsKey];
            if (newStats) {
                const actionsDiv = document.querySelector(`.stats-actions[data-type="${type}"]`);
                if (actionsDiv) actionsDiv.querySelector('.favorite-btn .count').textContent = newStats.favorites;
            }
            const btnIcon = document.querySelector(`.stats-actions[data-type="${type}"] .favorite-btn i`);
            if (btnIcon) { btnIcon.classList.remove('ri-bookmark-fill'); btnIcon.classList.add('ri-bookmark-line'); }
        }
        const groupDiv = swipeContainer.closest('.favorites-date-group');
        swipeContainer.remove();
        if (groupDiv && groupDiv.querySelectorAll('.swipe-container').length === 0) groupDiv.remove();
        const favoritesBody = document.getElementById('favoritesBody');
        if (favoritesBody.querySelectorAll('.favorites-date-group').length === 0) {
            favoritesBody.classList.add('empty');
            favoritesBody.innerHTML = `<div class="empty-favorites"><i class="ri-bookmark-fill"></i><p>暂无收藏内容</p></div>`;
            favoritesBody.classList.remove('has-favorites');
        }
        clearDateCache();
        if (currentlyOpenedSwipe === swipeContainer) currentlyOpenedSwipe = null;
    } catch (err) {
        console.error('删除收藏失败', err);
        showToast('删除失败，请稍后重试');
    } finally { if (deleteBtn) deleteBtn.style.pointerEvents = ''; }
}

async function performLocalDelete(swipeContainer, date, type) {
    if (!swipeContainer) return;
    removeItem(`${date}_${type}_favorite`);
    removeFavoriteSummary(date, type);
    if (currentDate === date) {
        const actionsDiv = document.querySelector(`.stats-actions[data-type="${type}"]`);
        if (actionsDiv) {
            const icon = actionsDiv.querySelector('.favorite-btn i');
            const countSpan = actionsDiv.querySelector('.favorite-btn .count');
            if (icon) { icon.classList.remove('ri-bookmark-fill'); icon.classList.add('ri-bookmark-line'); }
            if (countSpan) { let currentCount = parseInt(countSpan.innerText, 10); if (!isNaN(currentCount)) countSpan.innerText = currentCount - 1; }
        }
    }
    const groupDiv = swipeContainer.closest('.favorites-date-group');
    swipeContainer.remove();
    if (groupDiv && groupDiv.querySelectorAll('.swipe-container').length === 0) groupDiv.remove();
    const favoritesBody = document.getElementById('favoritesBody');
    if (favoritesBody.querySelectorAll('.favorites-date-group').length === 0) {
        favoritesBody.classList.add('empty');
        favoritesBody.innerHTML = `<div class="empty-favorites"><i class="ri-bookmark-fill"></i><p>暂无收藏内容</p></div>`;
        favoritesBody.classList.remove('has-favorites');
    }
    clearDateCache();
    if (currentlyOpenedSwipe === swipeContainer) currentlyOpenedSwipe = null;
}

function clearDateCache() { dateDataCache.clear(); }

function navigateToContent(date, type) {
    if (!navigator.onLine || !isNetworkAvailable) { showToast('网络连接不可用，请稍后再试', 1500); showOfflinePlaceholder(true); return; }
    closeFavoritesModal();
    loadDataForDate(date);
    const typeIndex = tabOrder.indexOf(type);
    if (typeIndex !== -1 && typeIndex !== currentIndex) switchTo(typeIndex);
    window.scrollTo(0, 0);
}

// ========== 分享模块（微信 + 通用）==========
(function() {
    // ---------- 微信环境检测与 SDK 初始化 ----------
    let wxReady = false;
    let wxShareData = null;
    let isWechat = /MicroMessenger/i.test(navigator.userAgent);

    // 从后端获取微信签名（你需要实现这个接口）
    async function fetchWechatSignature() {
        const url = location.href.split('#')[0];  // 当前页面完整 URL（不含 hash）
        const response = await fetch(`/api/wechat/signature?url=${encodeURIComponent(url)}`);
        if (!response.ok) throw new Error('获取签名失败');
        return await response.json();
    }

    // 加载微信 JS-SDK 并配置
    function initWechatSDK(callback) {
        if (!isWechat) return callback && callback(false);
        if (window._wxSdkLoaded) {
            callback && callback(wxReady);
            return;
        }
        window._wxSdkLoaded = true;
        const script = document.createElement('script');
        script.src = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';
        script.onload = () => {
            fetchWechatSignature()
                .then(signData => {
                    wx.config({
                        debug: false,   // 上线改为 false
                        appId: signData.appId,
                        timestamp: signData.timestamp,
                        nonceStr: signData.nonceStr,
                        signature: signData.signature,
                        jsApiList: [
                            'updateAppMessageShareData',
                            'updateTimelineShareData',
                            'onMenuShareAppMessage',
                            'onMenuShareTimeline'
                        ]
                    });
                    wx.ready(() => {
                        wxReady = true;
                        if (wxShareData) registerWechatShare(wxShareData);
                        callback && callback(true);
                    });
                    wx.error(err => {
                        console.error('微信 SDK 配置失败', err);
                        wxReady = false;
                        callback && callback(false);
                    });
                })
                .catch(err => {
                    console.error('获取签名失败', err);
                    callback && callback(false);
                });
        };
        script.onerror = () => {
            console.error('微信 JS 加载失败');
            callback && callback(false);
        };
        document.head.appendChild(script);
    }

    // 注册微信分享内容（好友 + 朋友圈）
    function registerWechatShare(data) {
        if (!wxReady || !wx) return;
        wx.updateAppMessageShareData({
            title: data.title,
            desc: data.description,
            link: data.link,
            imgUrl: data.imgUrl,
            success: () => console.log('微信好友分享配置成功')
        });
        wx.updateTimelineShareData({
            title: data.title,
            link: data.link,
            imgUrl: data.imgUrl,
            success: () => console.log('微信朋友圈分享配置成功')
        });
        // 兼容旧版
        if (wx.onMenuShareAppMessage) {
            wx.onMenuShareAppMessage({
                title: data.title,
                desc: data.description,
                link: data.link,
                imgUrl: data.imgUrl
            });
            wx.onMenuShareTimeline({
                title: data.title,
                link: data.link,
                imgUrl: data.imgUrl
            });
        }
    }

function getCurrentShareData(type, date) {
    const SHARE_BASE = 'https://read-share.solitudenook.top/share.html';
    const href = `${SHARE_BASE}?date=${date}&type=${type}`;

    let title = '', description = '', thumb = '';

    if (type === 'music') {
        title = document.querySelector('.track-album')?.innerText || '';
        description = document.querySelector('.track-singer')?.innerText || '';
        thumb = document.getElementById('album-img')?.src || '';
        const music = window.dateDataCache?.get(date)?.music;
        if (!title && music) { title = music.title; description = music.artist; thumb = music.cover; }
        if (!description) description = '推荐一首好歌给你';
        // QQ空间专用摘要
        if (!title) title = 'Read. 每日音乐分享';
    } else if (type === 'sentence') {
        title = '句子摘录';
        let sentenceText = document.getElementById('sentenceText')?.innerText || '';
        const author = document.querySelector('#sentence .from span')?.innerText || '';
        description = sentenceText;
        if (author) description += ` ——${author}`;
        thumb = document.getElementById('sentenceImg')?.src || '';
        const sent = window.dateDataCache?.get(date)?.sentence;
        if (!description && sent) description = sent.text + (sent.author ? ` ——${sent.author}` : '');
        // 截取合适长度用于 QQ 空间摘要
        if (description.length > 200) description = description.slice(0, 197) + '...';
        title = 'Read. 句子分享';
    } else if (type === 'article') {
        title = document.getElementById('article-title')?.innerText || '';
        let content = document.getElementById('article-content')?.innerText || '';
        const author = document.getElementById('article-author')?.innerText || '';
        description = content.slice(0, 150);
        if (author) description = `文/${author} ` + description;
        thumb = document.querySelector('#article .bg-img img')?.src || '';
        const art = window.dateDataCache?.get(date)?.article;
        if (!title && art) { title = art.title; description = (art.author ? `文/${art.author} ` : '') + (art.content || '').slice(0, 150); thumb = art.image; }
        if (description.length > 200) description = description.slice(0, 197) + '...';
        if (!title) title = 'Read. 文章分享';
    }

    description = description.replace(/\n/g, ' ').trim();
    if (description.length > 300) description = description.slice(0, 297) + '...';
    if (title.length > 50) title = title.slice(0, 47) + '...';

    // 确保缩略图是公网 HTTPS 地址
    if (!thumb || thumb === '' || thumb.startsWith('file://') || thumb.startsWith('/') || thumb.startsWith('./')) {
        thumb = 'https://solitudenook.top/img/default-share.png';
    }
    if (thumb && !thumb.startsWith('http')) {
        thumb = 'https://solitudenook.top/' + thumb.replace(/^\.?\//, '');
    }

    return { title, description, thumb, href };
}

    // 更新分享计数（后端接口）
    async function updateShareCount(type, date, delta = 1) {
        const actionsDiv = document.querySelector(`.stats-actions[data-type="${type}"]`);
        if (!actionsDiv) return;
        const countSpan = actionsDiv.querySelector('.share-btn .count');
        if (!countSpan) return;
        let oldCount = parseInt(countSpan.innerText, 10) || 0;
        countSpan.innerText = oldCount + delta;
        try {
            const res = await fetch(`${API_BASE}/api/posts/${date}/stats/${type}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delta })
            });
            if (res.ok) {
                const data = await res.json();
                const real = data[type + 'Stats'];
                if (real && real.shares !== undefined) countSpan.innerText = real.shares;
            }
        } catch (err) { console.warn('更新分享计数失败', err); countSpan.innerText = oldCount; }
    }

async function performShare(action, context) {
    const { type, date } = context;
    const { title, description, thumb, href } = getCurrentShareData(type, date);

    // ---------- 微信内置浏览器环境 ----------
    if (isWechat) {
        // 防止短时间内重复配置
        if (window._sharingLock) return;
        window._sharingLock = true;

        // 配置新旧两版接口，确保兼容性
        if (action === 'moments') {
            // 新版
            if (wx.updateTimelineShareData) {
                wx.updateTimelineShareData({
                    title: title,
                    link: href,
                    imgUrl: thumb,
                    success: () => console.log('朋友圈分享配置成功')
                });
            }
            // 旧版（用户真实分享会触发 success）
            if (wx.onMenuShareTimeline) {
                wx.onMenuShareTimeline({
                    title: title,
                    link: href,
                    imgUrl: thumb,
                    success: async () => {
                        try {
                            await updateShareCount(type, date, 1);
                            console.log('朋友圈分享计数已更新');
                        } catch (e) {}
                        window._sharingLock = false;
                    },
                    cancel: () => { window._sharingLock = false; }
                });
            } else {
                // 连旧版都不支持，降级为配置后立即计数
                try { await updateShareCount(type, date, 1); } catch(e){}
                setTimeout(() => { window._sharingLock = false; }, 2000);
            }
            showToast('请点击右上角“...”选择“分享到朋友圈”', 2000);
        } else { // 微信好友
            if (wx.updateAppMessageShareData) {
                wx.updateAppMessageShareData({
                    title: title,
                    desc: description,
                    link: href,
                    imgUrl: thumb,
                    success: () => console.log('好友分享配置成功')
                });
            }
            if (wx.onMenuShareAppMessage) {
                wx.onMenuShareAppMessage({
                    title: title,
                    desc: description,
                    link: href,
                    imgUrl: thumb,
                    success: async () => {
                        try {
                            await updateShareCount(type, date, 1);
                            console.log('好友分享计数已更新');
                        } catch(e){}
                        window._sharingLock = false;
                    },
                    cancel: () => { window._sharingLock = false; }
                });
            } else {
                try { await updateShareCount(type, date, 1); } catch(e){}
                setTimeout(() => { window._sharingLock = false; }, 2000);
            }
            showToast('请点击右上角“...”选择“发送给朋友”', 2000);
        }
        closeSharePanel();
        return;
    }

    // ---------- 5+ App 环境 ----------
    if (window.plus && window.plus.share) {
        await performPlusShare(action, context);
        return;
    }

    // ---------- 普通浏览器 Web Share / 复制链接 ----------
    // ... 以下代码保持不变，之前版本已正确添加计数更新
    if (action === 'moments') {
        try {
            await navigator.clipboard.writeText(href);
            showToast('链接已复制，可前往微信朋友圈粘贴分享', 1500);
            await updateShareCount(type, date, 1);
        } catch (err) {
            showToast('复制失败，请手动复制链接', 1500);
        }
        closeSharePanel();
        return;
    }

    if (navigator.share) {
        try {
            await Promise.race([
                navigator.share({ title, text: description, url: href }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
            ]);
            await updateShareCount(type, date, 1);
            showToast('分享成功', 1200);
            closeSharePanel();
            return;
        } catch (err) {}
    }

    try {
        await navigator.clipboard.writeText(href);
        showToast('链接已复制，可分享给好友', 1500);
        await updateShareCount(type, date, 1);
    } catch (err) {
        showToast('分享失败，请手动复制链接', 1500);
    }
    closeSharePanel();
}
function forceResumeApp(wasPlaying = false) {
    // 重置分享标志
    window._isSharing = false;

    // 关闭可能残留的分享面板
    if (document.body.classList.contains('share-panel-open')) {
        closeSharePanel();
    }

    // 强制恢复 body 滚动与触摸
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.style.position = '';

    // 5+ 环境：分两步强制刷新 webview
    if (window.plus && plus.webview) {
        const cv = plus.webview.currentWebview();
        if (cv) {
            // 先让 webview 变为透明，再恢复，触发 Swift/Android 层的重绘
            cv.setStyle({ opacity: 0 });
            setTimeout(() => {
                cv.setStyle({ opacity: 1 });
                // 'none' 动画类型避免闪烁，同时强制布局刷新
                cv.show('none');
            }, 50);
        }

        // Android 特别处理：强制主线程重绘
        if (plus.os.name === 'Android' && plus.android) {
            try {
                const main = plus.android.runtimeMainActivity();
                const decorView = main.getWindow().getDecorView();
                // postInvalidate 会强制 View 树重绘
                decorView.postInvalidate();
            } catch (e) {
                console.warn('Android 重绘失败', e);
            }
        }
    }

    // 恢复音乐播放状态（如果之前正在播放）
    if (wasPlaying && currentDisplayDate) {
        setTimeout(() => {
            audioManager.play(currentDisplayDate);
        }, 150);
    } else if (currentDisplayDate) {
        // 确保 UI 状态正确（例如暂停图标）
        audioManager.updateUIForDate(currentDisplayDate);
        // 防止状态不一致（比如 audio 在播放但 UI 显示暂停）
        const player = audioManager.getPlayerState(currentDisplayDate);
        if (player && player.playing && player.audio.paused) {
            player.playing = false;
            audioManager.updateUIForDate(currentDisplayDate);
        }
    }

    // 重新计算卡片布局
    if (typeof updateCardVerticalPosition === 'function') {
        updateCardVerticalPosition();
    }

    // 重置拖拽模块（避免手势卡死）
    if (typeof window.resetDragModule === 'function') {
        window.resetDragModule();
    }

    // 最后一次重绘保障（可能多余，留作保险）
    document.body.style.display = 'none';
    document.body.offsetHeight; // 强制 reflow
    document.body.style.display = '';

    // 触发全局 resize，让所有组件重新适配
    window.dispatchEvent(new Event('resize'));

    // 清理页面所有残留的 toast 提示
    document.querySelectorAll('.toast').forEach(toast => toast.remove());
}
// 全局标志
window._isSharing = false;
window._wasPlayingBeforeShare = false;

/**
 * 5+ App 环境分享核心逻辑（增强版）
 * @param {string} action 'wechat' | 'moments' | 'qq' | 'qzone'
 * @param {object} context { type, date }
 */
async function performPlusShare(action, context) {
    const { type, date } = context;
    const { title, description, thumb, href } = getCurrentShareData(type, date);

    // 防止重复调用
    if (window._isSharing) {
        showToast('正在分享中，请稍后', 1500);
        return;
    }

    // 记录当前音乐播放状态
    const player = audioManager.getPlayerState(currentDisplayDate);
    window._wasPlayingBeforeShare = player?.playing || false;
    if (window._wasPlayingBeforeShare) {
        audioManager.pause(currentDisplayDate);
    }

    window._isSharing = true;

    // 等待 plus 就绪
    await new Promise(resolve => {
        if (window.plus && plus.isReady) resolve();
        else document.addEventListener('plusready', resolve, { once: true });
    });

    // 获取分享服务
    let services;
    try {
        services = await new Promise((resolve, reject) => {
            plus.share.getServices(resolve, reject);
        });
    } catch (err) {
        console.error('获取分享服务失败', err);
        showToast('获取分享服务失败，请检查网络', 2000);
        forceResumeApp(window._wasPlayingBeforeShare);
        return;
    }

    let targetService = null;
    let shareScene = null;

    switch (action) {
        case 'wechat':
            targetService = services.find(s => s.id === 'weixin' || s.id === 'wechat');
            shareScene = 'WXSceneSession';
            break;
        case 'moments':
            targetService = services.find(s => s.id === 'weixin' || s.id === 'wechat');
            shareScene = 'WXSceneTimeline';
            break;
        case 'qq':
            targetService = services.find(s => s.id === 'qq' || s.id === 'QQ');
            break;
        case 'qzone':
            targetService = services.find(s => s.id === 'qq' || s.id === 'QQ');
            if (!targetService) {
                showToast('未找到QQ分享服务，请检查manifest配置', 2000);
                forceResumeApp(window._wasPlayingBeforeShare);
                return;
            }
            if (!targetService.nativeClient) {
                showToast('请先安装QQ客户端', 1500);
                forceResumeApp(window._wasPlayingBeforeShare);
                return;
            }
            shareScene = 'QQZone';
            break;
        default:
            showToast('不支持的分享类型', 1500);
            forceResumeApp(window._wasPlayingBeforeShare);
            return;
    }

    // QQ/QQ空间授权（可选）
    if ((action === 'qq' || action === 'qzone') && targetService.authorize && !targetService.authenticated) {
        try {
            await new Promise((resolve, reject) => {
                targetService.authorize(resolve, reject);
            });
        } catch (err) {
            console.warn('QQ授权失败，继续尝试分享', err);
        }
    }

    // 处理缩略图
    let safeThumb = thumb;
    if (!safeThumb || safeThumb === '') {
        safeThumb = 'https://solitudenook.top/img/default-share.png';
    } else if (!safeThumb.startsWith('https://')) {
        safeThumb = safeThumb.replace(/^http:/, 'https:');
    }

    // 限制标题和描述长度（QQ要求）
    let finalTitle = (title || 'Read.').slice(0, 30);
    let finalContent = (description || '安于闲，乐于独').slice(0, 40);

    const baseMsg = {
        type: 'web',
        title: finalTitle,
        content: finalContent,
        href: href,
        thumbs: [safeThumb]
    };

    let msg = baseMsg;
    if (shareScene) {
        msg.extra = { scene: shareScene };
    }

    // QQ空间专用附加字段
    if (action === 'qzone') {
        let customSummary = '';
        switch (type) {
            case 'music':
                customSummary = `分享音乐《${title}》${description ? `by ${description}` : ''} —— 安于闲，乐于独，点击收听`;
                break;
            case 'sentence':
                customSummary = `句子分享：${description.substring(0, 150)} ——来自Read.`;
                break;
            case 'article':
                customSummary = `文章《${title}》：${description.substring(0, 120)}... 阅读全文，下载Read. APP`;
                break;
            default:
                customSummary = description || '安于闲，乐于独，每日精选音乐、句子、文章';
        }
        msg.summary = customSummary.slice(0, 200);
        msg.site = 'Read.';
    }

    // 超时保护（微信分享可能无回调）
    let shareTimeout = null;
    const clearShareTimeout = () => {
        if (shareTimeout) {
            clearTimeout(shareTimeout);
            shareTimeout = null;
        }
    };

    if (action === 'wechat' || action === 'moments') {
        shareTimeout = setTimeout(() => {
            if (window._isSharing) {
                console.warn('微信分享超时，强制恢复APP');
                forceResumeApp(window._wasPlayingBeforeShare);
            }
        }, 3000);
    }

    // 调用分享
    targetService.send(msg,
        () => {
            clearShareTimeout();
            setTimeout(() => {
                updateShareCount(type, date, 1).catch(console.warn);
                forceResumeApp(window._wasPlayingBeforeShare);
                showToast('分享成功', 1200);
            }, 200);
        },
        (err) => {
            clearShareTimeout();
            setTimeout(() => {
                console.error(`${action}分享失败`, err);
                let errMsg = '分享失败，请稍后重试';
                if (err.code === -8) {
                    if (action === 'wechat' || action === 'moments') errMsg = '请先安装微信客户端';
                    else if (action === 'qq' || action === 'qzone') errMsg = '请先安装QQ客户端';
                } else if (err.code === -100) {
                    errMsg = '分享参数错误，请检查链接或图片是否有效';
                } else if (err.code === -5) {
                    errMsg = '用户取消分享';
                } else if (err.code === -3) {
                    errMsg = '网络错误，请检查网络后重试';
                }
                showToast(errMsg, 1500);
                forceResumeApp(window._wasPlayingBeforeShare);
            }, 100);
        }
    );
}

    // ---------- 分享面板控制 ----------
function openSharePanel(type, date) {
    if (!type || !date) { showToast('数据加载中，请稍后重试'); return; }
    // 防止短时间内重复打开
    if (document.body.classList.contains('share-panel-open')) return;
    if (isWechat) {
        performShare('wechat', { type, date });
        return;
    }
    closeSidebar?.();
    closeFavoritesModal?.();
    closeTimelineModal?.();
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.classList.add('active');
        document.body.classList.add('share-panel-open');
        window.activeShareContext = { type, date };
    }
}

function closeSharePanel() {
    const modal = document.getElementById('shareModal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.visibility = '';
        modal.style.opacity = '';
    }
    document.body.classList.remove('share-panel-open');
    // 关键：解锁滚动
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.style.position = '';
    window._isSharing = false;
}

    // 绑定分享面板事件
    function bindShareEvents() {
        const modal = document.getElementById('shareModal');
        if (!modal) return;
        modal.querySelector('.share-options')?.addEventListener('click', (e) => {
            const opt = e.target.closest('.share-option');
            if (opt && window.activeShareContext) {
                const action = opt.getAttribute('data-share-action');
                if (action) performShare(action, window.activeShareContext);
            }
        });
        document.getElementById('shareOverlay')?.addEventListener('click', closeSharePanel);
        document.getElementById('shareCancelBtn')?.addEventListener('click', closeSharePanel);
        modal.querySelector('.share-panel')?.addEventListener('click', e => e.stopPropagation());
    }

    // 监听页面上的分享按钮
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.share-btn');
        if (!btn) return;
        const actionsDiv = btn.closest('.stats-actions');
        const type = actionsDiv?.getAttribute('data-type');
        const date = window.currentDate || new URLSearchParams(location.search).get('date');
        if (type && date) {
            e.preventDefault();
            openSharePanel(type, date);
        }
    }, true);

    // 初始化微信 SDK（不阻塞页面）
    if (isWechat) {
        initWechatSDK();
    }

    bindShareEvents();
    window.openSharePanel = openSharePanel;
    window.closeSharePanel = closeSharePanel;
})();

// ========== 夜间模式 ==========
const THEME_STORAGE_KEY = 'site_theme';
const DARK_CLASS = 'dark-mode';
const nightModeMenuItem = Array.from(document.querySelectorAll('.sidebar-menu .menu-item')).find(item => item.textContent.includes('夜间模式') || item.textContent.includes('日间模式'));

function updateThemeMenuItem(isDark) {
    if (!nightModeMenuItem) return;
    const icon = nightModeMenuItem.querySelector('i');
    const textNode = nightModeMenuItem.childNodes[1];
    if (isDark) {
        if (icon) { icon.classList.remove('ri-moon-clear-line'); icon.classList.add('ri-sun-line'); }
        if (textNode && textNode.nodeType === Node.TEXT_NODE) textNode.textContent = ' 日间模式';
        else if (nightModeMenuItem.lastChild && nightModeMenuItem.lastChild.nodeType === Node.TEXT_NODE) nightModeMenuItem.lastChild.textContent = ' 日间模式';
        else { const textSpan = Array.from(nightModeMenuItem.childNodes).find(n => n.nodeType === Node.TEXT_NODE); if (textSpan) textSpan.textContent = ' 日间模式'; }
    } else {
        if (icon) { icon.classList.remove('ri-sun-line'); icon.classList.add('ri-moon-clear-line'); }
        if (textNode && textNode.nodeType === Node.TEXT_NODE) textNode.textContent = ' 夜间模式';
        else if (nightModeMenuItem.lastChild && nightModeMenuItem.lastChild.nodeType === Node.TEXT_NODE) nightModeMenuItem.lastChild.textContent = ' 夜间模式';
        else { const textSpan = Array.from(nightModeMenuItem.childNodes).find(n => n.nodeType === Node.TEXT_NODE); if (textSpan) textSpan.textContent = ' 夜间模式'; }
    }
}

function applyTheme(isDark) {
    if (isDark) document.body.classList.add(DARK_CLASS);
    else document.body.classList.remove(DARK_CLASS);
    updateThemeMenuItem(isDark);
    setItem(THEME_STORAGE_KEY, isDark ? 'dark' : 'light');
    setStatusBarStyle();
}

function toggleTheme() { applyTheme(!document.body.classList.contains(DARK_CLASS)); }

function initTheme() { const savedTheme = getItem(THEME_STORAGE_KEY); applyTheme(savedTheme === 'dark'); }

function bindNightModeToggle() { if (nightModeMenuItem) nightModeMenuItem.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleTheme(); }); }

// ========== 时间轴 ==========
async function loadTimelineData() {
    await fetchPublishedDatesList();
    const dates = publishedDates;
    if (!dates.length) {
        document.querySelector('.month-list').innerHTML = '<li>暂无数据</li>';
        document.querySelector('.date-grid').innerHTML = '<p>暂无日期</p>';
        return;
    }
    const fullyReadSet = await getFullyReadDates(dates);
    const monthMap = new Map();
    dates.forEach(date => {
        const [year, month] = date.split('-');
        const key = `${year}-${month}`;
        if (!monthMap.has(key)) monthMap.set(key, []);
        monthMap.get(key).push(date);
    });
    const months = Array.from(monthMap.entries()).map(([key, dates]) => ({ key, dates })).sort((a, b) => b.key.localeCompare(a.key));
    renderTimeline(months, currentDate, fullyReadSet);
}

function renderTimeline(months, currentDate, fullyReadSet) {
    const monthList = document.querySelector('.month-list');
    const dateGrid = document.querySelector('.date-grid');
    if (!months.length) {
        monthList.innerHTML = '<li>暂无数据</li>';
        dateGrid.innerHTML = '<p>暂无日期</p>';
        return;
    }

    let activeMonthKey = null;
    if (currentDate) {
        const [year, month] = currentDate.split('-');
        activeMonthKey = `${year}-${month}`;
    }
    if (!activeMonthKey || !months.find(m => m.key === activeMonthKey)) {
        activeMonthKey = months[0].key;
    }

    monthList.innerHTML = months.map(month => {
        const [year, monthNum] = month.key.split('-');
        const activeClass = month.key === activeMonthKey ? 'active' : '';
        return `<li class="month-item ${activeClass}" data-month-key="${month.key}">${parseInt(monthNum)}月</li>`;
    }).join('');

    renderDatesForMonth(activeMonthKey, months, currentDate, fullyReadSet);

    document.querySelectorAll('.month-item').forEach(item => {
        item.removeEventListener('click', monthClickHandler);
        item.addEventListener('click', monthClickHandler);
    });

    function monthClickHandler(e) {
        const monthKey = this.dataset.monthKey;
        document.querySelectorAll('.month-item').forEach(li => li.classList.remove('active'));
        this.classList.add('active');
        renderDatesForMonth(monthKey, months, currentDate, fullyReadSet);
    }
}

function renderDatesForMonth(monthKey, allMonths, currentDate, fullyReadSet) {
    const month = allMonths.find(m => m.key === monthKey);
    if (!month) return;
    const dateGrid = document.querySelector('.date-grid');
    const sortedDates = month.dates.sort((a, b) => (a < b ? 1 : -1));
    dateGrid.innerHTML = sortedDates.map(date => {
        const [year, month, day] = date.split('-');
        const dayNum = parseInt(day, 10);
        const isCurrent = (date === currentDate);
        const currentClass = isCurrent ? 'current-date-box' : '';
        const isFullyRead = fullyReadSet.has(date);
        const readClass = isFullyRead ? 'date-read' : '';
        const weekday = getWeekday(date);
        return `<a class="time-box ${currentClass} ${readClass}" href="?date=${date}" data-date="${date}"><p class="his-day">${dayNum}</p><span class="his-fix"></span><div class="his-year-row"><p class="his-year">${year}</p><span class="his-weekday">${weekday}</span></div></a>`;
    }).join('');
}

function getWeekday(dateStr) { const date = new Date(dateStr + 'T12:00:00'); const weekdays = ['星周日', '星周一', '星周二', '星周三', '星周四', '星周五', '星周六']; return weekdays[date.getDay()]; }

function openTimelineModal() {
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    
    if (publishedDates.length === 0) {
        fetchPublishedDatesList(false).then(() => loadTimelineData());
    } else {
        loadTimelineData(); 
    }
    
    document.body.classList.add('timeline-open');
}

function closeTimelineModal() { document.body.classList.remove('timeline-open'); }

// ========== 我的评论 ==========
async function fetchMyComments(page = 1, forceRefresh = false) {
    const deviceToken = getDeviceToken();
    // 如果是第一页且不强刷，先尝试读缓存
    if (page === 1 && !forceRefresh) {
        const cached = await getCachedMyComments(deviceToken);
        if (cached && cached.comments.length) {
            return { comments: cached.comments, hasMore: cached.hasMore };
        }
    }
    try {
        const response = await fetch(`${API_BASE}/api/comments/my?device_token=${deviceToken}&page=${page}&limit=20`);
        if (!response.ok) throw new Error('获取评论失败');
        const data = await response.json();
        const comments = data.comments || [];
        const hasMore = data.has_more || false;
        // 仅缓存第一页
        if (page === 1) {
            await saveMyCommentsCache(deviceToken, comments, hasMore, page);
        }
        return { comments, hasMore };
    } catch (err) {
        console.error('获取我的评论失败', err);
        // 断网时若有缓存则返回缓存（即使不是第一页，但通常第一次打开就是第一页）
        if (page === 1) {
            const cached = await getCachedMyComments(deviceToken);
            if (cached) return { comments: cached.comments, hasMore: cached.hasMore };
        }
        throw err;
    }
}

function renderMyComments(comments, append = false) {
    const container = document.getElementById('myCommentsBody');
    if (!container) return;
    if (!append) container.innerHTML = '';
    if (!comments.length && !append) {
        container.classList.add('empty'); 
        container.classList.remove('has-comments');
        container.innerHTML = `<div class="empty-favorites"><i class="ri-chat-2-fill"></i><p>暂无评论内容</p></div>`;
        return;
    }
    container.classList.remove('empty'); 
    container.classList.add('has-comments');
    const fragment = document.createDocumentFragment();
    comments.forEach(comment => {
        const typeMap = { music: '音乐', sentence: '句子', article: '文章' };
        const typeText = typeMap[comment.type] || comment.type;
        const dateStr = comment.date || '';
        const formattedDate = dateStr ? dateStr.replace(/-/g, '.') : '未知日期';
        const contentHtml = `<div class="swipe-container" data-comment-id="${comment.id}" data-date="${comment.date}" data-type="${comment.type}">
            <div class="swipe-inner">
                <div class="card-content">
                    <div class="comment-card-item">
                        <div class="comment-card-content">
                            <div class="comment-card-meta">
                                <span class="comment-card-source">${typeText}</span>
                                <span class="comment-card-date">${formattedDate}</span>
                            </div>
                            <div class="comment-card-text">${escapeHtml(comment.content)}</div>
                        </div>
                    </div>
                </div>
                <div class="delete-btn-area" data-delete-comment-id="${comment.id}">
                    <i class="ri-delete-bin-line"></i>
                </div>
            </div>
        </div>`;
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = contentHtml;
        fragment.appendChild(tempDiv.firstElementChild);
    });
    container.appendChild(fragment);
    bindMyCommentsSwipeEvents();
    bindMyCommentsDeleteButtons();
    bindMyCommentsCardClick();
}
function bindMyCommentsCardClick() {
    const body = document.getElementById('myCommentsBody');
    if (!body) return;
    if (body._cardClickBound) return;
    body._cardClickBound = true;
    body.addEventListener('click', (e) => {
        if (e.target.closest('.delete-btn-area')) return;
        const swipeContainer = e.target.closest('.swipe-container');
        if (!swipeContainer) return;
        const date = swipeContainer.dataset.date;
        const type = swipeContainer.dataset.type;
        if (date && type) {
            e.preventDefault();
            e.stopPropagation();
            navigateToComment(date, type);
        }
    });
}

async function navigateToComment(date, type) {
    if (!navigator.onLine || !isNetworkAvailable) {
        showToast('网络连接不可用，请稍后再试', 1500);
        return;
    }
    closeMyCommentsModal();
    await switchToDate(date, type);
    setTimeout(() => {
        openCommentModal(type);
    }, 300);
}

function bindMyCommentsSwipeEvents() {
    document.querySelectorAll('#myCommentsBody .swipe-container').forEach(container => { if (!container.dataset.swipeBound) initMyCommentsSwipeForContainer(container); });
}

function initMyCommentsSwipeForContainer(container) {
    if (container.dataset.swipeBound === 'true') return;
    container.dataset.swipeBound = 'true';
    let startX = 0, startY = 0, currentTranslate = 0, startTranslate = 0, isSwiping = false, isHorizontal = false, directionLocked = false;
    const DELETE_BTN_WIDTH = 70, THRESHOLD = DELETE_BTN_WIDTH * 0.5;
    const swipeInner = container.querySelector('.swipe-inner');
    if (!swipeInner) return;
    function getCurrentTranslate() { return swipeInner.style.transform === `translateX(-${DELETE_BTN_WIDTH}px)` ? -DELETE_BTN_WIDTH : 0; }
    function applyTranslate(delta) {
        let newTranslate = startTranslate + delta;
        if (newTranslate > 0) newTranslate *= 0.3;
        else if (newTranslate < -DELETE_BTN_WIDTH) newTranslate = -DELETE_BTN_WIDTH + (newTranslate + DELETE_BTN_WIDTH) * 0.3;
        newTranslate = Math.min(0, Math.max(-DELETE_BTN_WIDTH, newTranslate));
        swipeInner.style.transform = `translateX(${newTranslate}px)`;
        currentTranslate = newTranslate;
    }
    function onStart(clientX, clientY) { closeAllMyCommentsSwipedItems(); startX = clientX; startY = clientY; startTranslate = getCurrentTranslate(); isSwiping = true; isHorizontal = false; directionLocked = false; container.style.transition = 'none'; }
    function onMove(clientX, clientY) {
        if (!isSwiping) return;
        const deltaX = clientX - startX, deltaY = clientY - startY;
        if (!directionLocked) { const absX = Math.abs(deltaX), absY = Math.abs(deltaY); if (absX > 8 || absY > 8) { directionLocked = true; isHorizontal = absX > absY; } }
        if (!isHorizontal) return;
        if (event && event.preventDefault) event.preventDefault();
        applyTranslate(deltaX);
    }
    function onEnd(clientX) {
        if (!isSwiping) { swipeInner.style.transition = ''; return; }
        isSwiping = false; container.style.transition = '';
        if (!isHorizontal) { swipeInner.style.transform = 'translateX(0px)'; swipeInner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)'; return; }
        const deltaX = clientX - startX;
        let finalTranslate = 0;
        const isCurrentlyOpen = (currentTranslate === -DELETE_BTN_WIDTH);
        if (isCurrentlyOpen) finalTranslate = (deltaX > THRESHOLD) ? 0 : -DELETE_BTN_WIDTH;
        else finalTranslate = (deltaX < -THRESHOLD) ? -DELETE_BTN_WIDTH : 0;
        swipeInner.style.transform = `translateX(${finalTranslate}px)`;
        swipeInner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
        if (finalTranslate === -DELETE_BTN_WIDTH) { closeAllMyCommentsSwipedItems(); container._isOpen = true; } else container._isOpen = false;
    }
    function closeAllMyCommentsSwipedItems() { document.querySelectorAll('#myCommentsBody .swipe-container').forEach(cont => { if (cont._isOpen) { const inner = cont.querySelector('.swipe-inner'); if (inner) { inner.style.transform = 'translateX(0px)'; inner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)'; cont._isOpen = false; } } }); }
    window.closeAllMyCommentsSwipedItems = closeAllMyCommentsSwipedItems;
    container.addEventListener('touchstart', (e) => { if (e.target.closest('.delete-btn-area')) return; const touch = e.touches[0]; onStart(touch.clientX, touch.clientY); }, { passive: false });
    container.addEventListener('touchmove', (e) => { if (!isSwiping) return; const touch = e.touches[0]; onMove(touch.clientX, touch.clientY); if (isHorizontal) e.preventDefault(); }, { passive: false });
    container.addEventListener('touchend', (e) => { const changed = e.changedTouches[0]; onEnd(changed.clientX); });
}

function bindMyCommentsDeleteButtons() { const body = document.getElementById('myCommentsBody'); if (body) body.addEventListener('click', handleMyCommentsDelete); }

async function handleMyCommentsDelete(e) {
    const deleteArea = e.target.closest('.delete-btn-area');
    if (!deleteArea) return;
    e.stopPropagation();
    const swipeContainer = deleteArea.closest('.swipe-container');
    if (!swipeContainer) return;
    const commentId = swipeContainer.dataset.commentId || deleteArea.dataset.deleteCommentId;
    if (!commentId) return;
    if (!navigator.onLine || !isNetworkAvailable) { showToast('网络连接不可用，无法删除', 1500); return; }
    const deviceToken = getDeviceToken();
    try {
        const response = await fetch(`${API_BASE}/api/comments/${commentId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_token: deviceToken }) });
        if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.error || '删除失败'); }
        // 清除我的评论缓存
        await clearMyCommentsCache(deviceToken);
        showToast('删除成功', 1500);
        swipeContainer.remove();
        if (document.querySelectorAll('#myCommentsBody .swipe-container').length === 0) {
            const container = document.getElementById('myCommentsBody');
            container.classList.add('empty');
            container.classList.remove('has-comments');
            container.innerHTML = `<div class="empty-favorites"><i class="ri-chat-2-fill"></i><p>暂无评论内容</p></div>`;
        }
        if (currentDate && swipeContainer.dataset.date === currentDate) await updateSingleCommentCount(currentDate, swipeContainer.dataset.type);
    } catch (err) {
        console.error('删除评论失败', err);
        showToast(err.message || '删除失败，请稍后重试', 2000);
    }
}

async function loadMyComments(reset = true, silent = false) {
    if (isLoadingMyComments) return;
    if (reset) { 
        myCommentsCurrentPage = 1; 
        myCommentsHasMore = true; 
        myCommentsList = []; 
    }
    if (!myCommentsHasMore && !reset) return;
    
    isLoadingMyComments = true;
    const container = document.getElementById('myCommentsBody');
    if (reset && container && !silent) {
        container.innerHTML = '<div class="loading-state"><i class="ri-loader-4-line"></i> 加载中...</div>';
        container.classList.remove('empty', 'has-comments');
    }
    
    try {
        let result;
        let fromCache = false;
        try {
            result = await fetchMyComments(myCommentsCurrentPage);
        } catch (err) {
            // 网络错误时尝试从缓存获取（如果还没加载过）
            if (reset && myCommentsCurrentPage === 1) {
                const cached = await getCachedMyComments(getDeviceToken());
                if (cached && cached.comments.length) {
                    result = { comments: cached.comments, hasMore: cached.hasMore };
                    fromCache = true;
                } else {
                    throw err;
                }
            } else {
                throw err;
            }
        }
        
        const newComments = result.comments;
        myCommentsHasMore = result.hasMore;
        
        if (reset) {
            myCommentsList = newComments;
            renderMyComments(myCommentsList);
        } else {
            myCommentsList = [...myCommentsList, ...newComments];
            renderMyComments(newComments, true);
        }
        
        if (myCommentsHasMore && newComments.length > 0) myCommentsCurrentPage++;
        
        // 如果是从缓存渲染且当前在线，静默刷新第一页
        if (fromCache && navigator.onLine && !silent) {
            setTimeout(() => {
                loadMyComments(true, true); // 静默刷新
            }, 100);
        }
    } catch (err) {
        console.error('加载我的评论失败', err);
        if (reset && container) {
            container.classList.add('empty');
            container.classList.remove('has-comments');
            container.innerHTML = `<div class="empty-favorites"><i class="ri-error-warning-line"></i><p>加载失败，请稍后重试</p></div>`;
        } else if (!silent) {
            showToast('加载评论失败，请稍后重试', 1500);
        }
    } finally {
        isLoadingMyComments = false;
    }
}

function openMyCommentsModal() {
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    if (document.body.classList.contains('timeline-open')) closeTimelineModal();
    if (document.body.classList.contains('changelog-open')) closeChangelogModal();
    if (document.body.classList.contains('share-panel-open')) closeSharePanel();
    if (document.body.classList.contains('comment-open')) closeCommentModal();
    if (typeof setStatusBarStyle === 'function') setStatusBarStyle();
    document.body.classList.add('my-comments-open');
    document.body.style.overflow = 'hidden';
    loadMyComments(true);
}

function closeMyCommentsModal() {
    if (!document.body.classList.contains('my-comments-open')) return;
    document.body.classList.remove('my-comments-open');
    document.body.style.overflow = '';
    if (typeof setStatusBarStyle === 'function') setStatusBarStyle();
}

function bindMyCommentsTrigger() {
    const trigger = document.getElementById('my-comments-trigger');
    if (trigger && !trigger.dataset.commentsBound) { trigger.addEventListener('click', (e) => { e.preventDefault(); openMyCommentsModal(); }); trigger.dataset.commentsBound = 'true'; }
    const closeBtn = document.querySelector('.close-my-comments');
    if (closeBtn && !closeBtn.dataset.closeBound) { closeBtn.addEventListener('click', closeMyCommentsModal); closeBtn.dataset.closeBound = 'true'; }
    const modal = document.getElementById('myCommentsModal');
    if (modal && !modal.dataset.modalBound) { modal.addEventListener('click', (e) => { if (e.target === modal) closeMyCommentsModal(); }); modal.dataset.modalBound = 'true'; }
}

// ========== 评论功能 ==========
async function loadCommentList(date, type, signal) {
    const container = document.querySelector('.comment-list');
    const loadingDiv = document.querySelector('.comment-loading');
    const emptyDiv = document.querySelector('.comment-empty');
    if (!container) return;
    if (loadingDiv) loadingDiv.style.display = 'block';
    if (emptyDiv) emptyDiv.style.display = 'none';
    container.innerHTML = '';
    if (activeCommentRequest) { activeCommentRequest.abort(); activeCommentRequest = null; }
    const controller = new AbortController();
    activeCommentRequest = controller;
    try {
        const response = await fetch(`${API_BASE}/api/comments?date=${date}&type=${type}`, { signal: controller.signal });
        if (!response.ok) throw new Error('加载评论失败');
        const comments = await response.json();
        if (loadingDiv) loadingDiv.style.display = 'none';
        if (!comments || comments.length === 0) { if (emptyDiv) emptyDiv.style.display = 'block'; return; }
        if (emptyDiv) emptyDiv.style.display = 'none';
        const fragment = document.createDocumentFragment();
        comments.forEach(comment => {
            const commentEl = document.createElement('div');
            commentEl.className = 'comment-item';
            commentEl.setAttribute('data-comment-id', comment.id);
            commentEl.setAttribute('data-owner-token', comment.owner_token || '');
            commentEl.setAttribute('data-comment-content', comment.content || '');
            const nickname = escapeHtml(comment.nickname || '匿名');
            const content = escapeHtml(comment.content).replace(/\n/g, '<br>');
            const time = new Date(comment.created_at).toLocaleString();
            commentEl.innerHTML = `<div class="comment-header"><span class="comment-nickname">${nickname}</span><span class="comment-time">${time}</span></div><div class="comment-text">${content}</div>`;
            fragment.appendChild(commentEl);
        });
        container.appendChild(fragment);
    } catch (err) { if (err.name === 'AbortError') return; console.error('加载评论失败', err); if (loadingDiv) loadingDiv.style.display = 'none'; if (emptyDiv) { emptyDiv.innerHTML = '<p>加载失败，请稍后重试</p>'; emptyDiv.style.display = 'block'; } throw err; }
    finally { if (activeCommentRequest === controller) activeCommentRequest = null; }
}

async function submitComment() {
    if (!currentCommentDate || !currentCommentType) { showToast('无法获取评论上下文'); return; }
    const nicknameInput = document.querySelector('.nickname');
    const contentTextarea = document.querySelector('.comment-content');
    const nickname = nicknameInput ? nicknameInput.value.trim() : '';
    const content = contentTextarea ? contentTextarea.value.trim() : '';
    if (!content) { showToast('评论内容不能为空'); return; }
    const submitBtn = document.querySelector('.comment-submit-btn');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = '提交中...'; }
    const deviceToken = getDeviceToken();
    try {
        const response = await fetch(`${API_BASE}/api/comments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: currentCommentDate, type: currentCommentType, nickname, content, owner_token: deviceToken }) });
        if (!response.ok) throw new Error('提交失败');
        const result = await response.json();
        if (result.success) {
            showToast('评论成功');
            if (nicknameInput) nicknameInput.value = '';
            if (contentTextarea) contentTextarea.value = '';
            await loadCommentList(currentCommentDate, currentCommentType);
            await updateSingleCommentCount(currentCommentDate, currentCommentType);
            const deviceToken = getDeviceToken();
await clearMyCommentsCache(deviceToken);
        } else throw new Error(result.error || '提交失败');
    } catch (err) { console.error('提交评论失败', err); showToast('评论失败，请稍后重试'); }
    finally { if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = '发表评论'; } }
}

async function updateSingleCommentCount(date, type) {
    try {
        const response = await fetch(`${API_BASE}/api/comments/count?date=${date}&type=${type}`);
        if (!response.ok) throw new Error('获取评论数失败');
        const data = await response.json();
        const count = data.count || 0;
        const actionsDiv = document.querySelector(`.stats-actions[data-type="${type}"]`);
        if (actionsDiv) { const commentSpan = actionsDiv.querySelector('.comment-btn .count'); if (commentSpan) commentSpan.textContent = count; }
    } catch (err) { console.warn('更新评论计数失败', err); }
}

async function updateAllCommentsCount(date) { if (date) await Promise.all([updateSingleCommentCount(date, 'music'), updateSingleCommentCount(date, 'sentence'), updateSingleCommentCount(date, 'article')]); }

function openCommentModal(type) {
    if (!currentDate) { showToast('日期数据未就绪，请稍后再试'); return; }
    const modal = document.getElementById('commentModal');
    if (modal && modal.classList.contains('active')) return;
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    if (document.body.classList.contains('timeline-open')) closeTimelineModal();
    if (document.body.classList.contains('changelog-open')) closeChangelogModal();
    if (document.body.classList.contains('share-panel-open')) closeSharePanel();
    currentCommentType = type;
    currentCommentDate = currentDate;
    const nicknameInput = document.querySelector('.nickname');
    const contentTextarea = document.querySelector('.comment-content');
    if (nicknameInput) nicknameInput.value = '';
    if (contentTextarea) contentTextarea.value = '';
    if (modal) { modal.classList.add('active'); document.body.classList.add('comment-open'); document.body.style.overflow = 'hidden'; }
    requestAnimationFrame(() => { setTimeout(() => { loadCommentList(currentDate, type); }, 50); });
}

function closeCommentModal() {
    closeActionSheet();
    closeReportModal();
    if (activeCommentRequest) { activeCommentRequest.abort(); activeCommentRequest = null; }
    isLoadingComments = false;
    const modal = document.getElementById('commentModal');
    if (modal) { modal.classList.remove('active'); document.body.classList.remove('comment-open'); document.body.style.overflow = ''; }
    currentCommentType = null; currentCommentDate = null;
}

function bindCommentButtons() {
    document.body.addEventListener('click', (e) => {
        const commentBtn = e.target.closest('.comment-btn');
        if (!commentBtn) return;
        const actionsDiv = commentBtn.closest('.stats-actions');
        if (!actionsDiv) return;
        const type = actionsDiv.getAttribute('data-type');
        if (!type) return;
        e.preventDefault(); e.stopPropagation();
        openCommentModal(type);
    });
}

function bindCommentModalEvents() {
    const closeBtn = document.querySelector('.close-comment-modal');
    if (closeBtn) { closeBtn.removeEventListener('click', closeCommentModal); closeBtn.addEventListener('click', closeCommentModal); }
    const submitBtn = document.querySelector('.comment-submit-btn');
    if (submitBtn) { submitBtn.removeEventListener('click', submitComment); submitBtn.addEventListener('click', submitComment); }
    const modal = document.getElementById('commentModal');
    if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) closeCommentModal(); });
}

// ========== 评论操作菜单 ==========
function getCommentActionSheet() { return document.getElementById('commentActionSheet'); }

function closeActionSheet() {
    const sheet = getCommentActionSheet();
    if (sheet) { sheet.classList.remove('active'); document.body.classList.remove('comment-action-open'); }
    activeCommentId = null; activeCommentContent = ''; activeCommentOwnerToken = '';
}

function showCommentActions(commentId, commentContent, ownerToken) {
    activeCommentId = commentId; activeCommentContent = commentContent; activeCommentOwnerToken = ownerToken;
    const sheet = getCommentActionSheet();
    if (!sheet) return;
    const optionsContainer = document.getElementById('commentActionOptions');
    if (!optionsContainer) return;
    optionsContainer.innerHTML = '';
    const copyOption = document.createElement('div'); copyOption.className = 'action-option'; copyOption.setAttribute('data-action', 'copy'); copyOption.innerHTML = '<i class="ri-file-copy-line"></i><span>复制评论</span>'; optionsContainer.appendChild(copyOption);
    const deviceToken = getDeviceToken();
    const isOwner = (ownerToken === deviceToken);
    if (isOwner) { const deleteOption = document.createElement('div'); deleteOption.className = 'action-option delete-option'; deleteOption.setAttribute('data-action', 'delete'); deleteOption.innerHTML = '<i class="ri-delete-bin-line"></i><span>删除评论</span>'; optionsContainer.appendChild(deleteOption); }
    else { const reportOption = document.createElement('div'); reportOption.className = 'action-option'; reportOption.setAttribute('data-action', 'report'); reportOption.innerHTML = '<i class="ri-alert-line"></i><span>举报</span>'; optionsContainer.appendChild(reportOption); }
    sheet.classList.add('active'); document.body.classList.add('comment-action-open');
}

function bindActionSheetEvents() {
    const sheet = getCommentActionSheet();
    if (!sheet) return;
    const overlay = sheet.querySelector('.action-overlay');
    if (overlay) { overlay.removeEventListener('click', closeActionSheet); overlay.addEventListener('click', closeActionSheet); }
    const cancelBtn = document.getElementById('actionCancelBtn');
    if (cancelBtn) { cancelBtn.removeEventListener('click', closeActionSheet); cancelBtn.addEventListener('click', closeActionSheet); }
    const optionsContainer = document.getElementById('commentActionOptions');
    if (optionsContainer) { optionsContainer.removeEventListener('click', handleActionOptionClick); optionsContainer.addEventListener('click', handleActionOptionClick); }
}

function handleActionOptionClick(e) {
    const option = e.target.closest('.action-option');
    if (!option) return;
    const action = option.getAttribute('data-action');
    if (!action) return;
    const savedCommentId = activeCommentId, savedCommentContent = activeCommentContent;
    switch (action) {
        case 'copy': copyCommentContent(savedCommentContent); closeActionSheet(); break;
        case 'delete': closeActionSheet(); if (savedCommentId) deleteCommentById(savedCommentId); break;
        case 'report': closeActionSheet(); if (savedCommentId) openReportModal(savedCommentId); break;
    }
}

async function copyCommentContent(content) {
    try { await navigator.clipboard.writeText(content); showToast('评论已复制', 1500); } catch(err) { const textarea = document.createElement('textarea'); textarea.value = content; document.body.appendChild(textarea); textarea.select(); document.execCommand('copy'); document.body.removeChild(textarea); showToast('评论已复制', 1500); }
}

async function deleteCommentById(commentId) {
    if (!commentId) return;
    const deviceToken = getDeviceToken();
    try {
        const response = await fetch(`${API_BASE}/api/comments/${commentId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner_token: deviceToken }) });
        if (!response.ok) { const errorData = await response.json().catch(() => ({})); throw new Error(errorData.error || '删除失败'); }
        showToast('删除成功', 1500);
        if (currentCommentDate && currentCommentType) { await loadCommentList(currentCommentDate, currentCommentType); await updateSingleCommentCount(currentCommentDate, currentCommentType); }
    } catch (err) { console.error('删除评论失败', err); showToast(err.message || '删除失败，请稍后重试', 2000); }
}

function bindCommentItemClick() {
    document.body.addEventListener('click', (e) => {
        const commentItem = e.target.closest('.comment-item');
        if (!commentItem) return;
        if (e.target.closest('.comment-submit-btn') || e.target.closest('.close-comment-modal') || e.target.closest('.comment-nickname') || e.target.closest('.comment-time')) return;
        e.stopPropagation();
        const commentId = commentItem.getAttribute('data-comment-id');
        const commentContent = commentItem.getAttribute('data-comment-content') || '';
        const ownerToken = commentItem.getAttribute('data-owner-token') || '';
        if (commentId) showCommentActions(commentId, commentContent, ownerToken);
    });
}

// ========== 举报功能 ==========
function openReportModal(commentId) {
    currentReportCommentId = commentId;
    const modal = document.getElementById('reportModal');
    const reasonTextarea = document.getElementById('reportReason');
    if (!modal) return;
    if (reasonTextarea) reasonTextarea.value = '';
    modal.classList.add('active');
    document.body.classList.add('report-panel-open');
}

function closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) { modal.classList.remove('active'); document.body.classList.remove('report-panel-open'); }
    currentReportCommentId = null;
}

async function submitReport() {
    if (!currentReportCommentId) { showToast('举报失败，请重试', 1500); closeReportModal(); return; }
    const reasonTextarea = document.getElementById('reportReason');
    const reason = reasonTextarea ? reasonTextarea.value.trim() : '';
    if (!reason) { showToast('请填写举报原因', 1500); return; }
    const reporterToken = getDeviceToken();
    try {
        const response = await fetch(`${API_BASE}/api/reports`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ comment_id: currentReportCommentId, reason, reporter_token: reporterToken }) });
        if (!response.ok) { const errorData = await response.json().catch(() => ({})); if (response.status === 409) showToast('您已举报过该评论', 1500); else throw new Error(errorData.error || '举报失败'); }
        else showToast('举报已提交，我们会尽快处理', 1500);
        closeReportModal();
    } catch (err) { console.error('举报失败', err); showToast(err.message || '举报失败，请稍后重试', 1500); }
}

function bindReportModalEvents() {
    const modal = document.getElementById('reportModal');
    if (!modal) return;
    const overlay = modal.querySelector('.report-overlay');
    const cancelBtn = modal.querySelector('.report-cancel');
    const submitBtn = modal.querySelector('.report-submit');
    if (overlay) { overlay.removeEventListener('click', closeReportModal); overlay.addEventListener('click', closeReportModal); }
    if (cancelBtn) { cancelBtn.removeEventListener('click', closeReportModal); cancelBtn.addEventListener('click', closeReportModal); }
    if (submitBtn) { submitBtn.removeEventListener('click', submitReport); submitBtn.addEventListener('click', submitReport); }
}

// ========== 图片预览 ==========
function openImagePreview(url) {
    if (!url || url === '') return;
    currentPreviewUrl = url;
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImage');
    if (!modal || !img) return;
    img.src = url;
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImagePreview() {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal) return;
    modal.classList.remove('active');
    document.body.style.overflow = '';
    currentPreviewUrl = '';
}

async function saveCurrentImage() {
    if (!currentPreviewUrl) { showToast('暂无图片可保存'); return; }
    const isPlusEnv = typeof window.plus !== 'undefined' && window.plus && window.plus.gallery;
    if (isPlusEnv) {
        if (!window.plus.isReady) { showToast('系统未就绪，请稍后重试'); return; }
        if (plus.os.name === 'Android') {
            const permission = 'android.permission.WRITE_EXTERNAL_STORAGE';
            if (plus.android.checkPermission(permission) !== 'granted') {
                plus.android.requestPermissions([permission], function(e) { if (e.granted.length > 0) saveToGallery(); else showToast('需要存储权限才能保存图片'); }, function(e) { showToast('权限申请失败'); });
                return;
            }
        }
        saveToGallery();
    } else { downloadImageInBrowser(); }
}

function saveToGallery() {
    showToast('正在保存...', 1500);
    plus.gallery.save(currentPreviewUrl, function() { showToast('保存成功', 1500); closeImagePreview(); }, function(err) {
        console.error('保存失败', err);
        plus.downloader.createDownload(currentPreviewUrl, { filename: '_downloads/temp_img.jpg' }, function(d, status) {
            if (status === 200) plus.gallery.save(d.filename, function() { showToast('保存成功', 1500); closeImagePreview(); }, function() { showToast('保存失败，请检查权限'); });
            else showToast('保存失败');
        }).start();
    });
}

async function downloadImageInBrowser() {
    try {
        const response = await fetch(currentPreviewUrl);
        if (!response.ok) throw new Error('获取图片失败');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = blobUrl; link.download = 'preview_image.jpg';
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
        closeImagePreview();
    } catch (err) { console.warn('Blob 下载失败，降级为长按保存提示', err); showToast('请长按图片保存', 2000); closeImagePreview(); }
}

function bindImagePreviewTriggers() {
    const albumImg = document.getElementById('album-img');
    if (albumImg) albumImg.addEventListener('click', (e) => { e.stopPropagation(); if (albumImg.src && albumImg.style.display !== 'none') openImagePreview(albumImg.src); });
    const sentenceImg = document.getElementById('sentenceImg');
    if (sentenceImg) sentenceImg.addEventListener('click', (e) => { e.stopPropagation(); if (sentenceImg.src) openImagePreview(sentenceImg.src); });
    const articleImg = document.querySelector('#article .bg-img img');
    if (articleImg) articleImg.addEventListener('click', (e) => { e.stopPropagation(); if (articleImg.src) openImagePreview(articleImg.src); });
    document.body.addEventListener('click', (e) => {
        const thumbnail = e.target.closest('.favorite-card img');
        if (!thumbnail || !thumbnail.src) return;
        if (document.body.classList.contains('favorites-open')) return;
        e.stopPropagation();
        openImagePreview(thumbnail.src);
    });
}

function initImagePreviewModal() {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal) return;
    const overlay = modal.querySelector('.image-preview-overlay');
    if (overlay) overlay.addEventListener('click', closeImagePreview);
    const saveBtn = document.getElementById('saveImageBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveCurrentImage);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && modal.classList.contains('active')) closeImagePreview(); });
}

// ========== 侧边栏 ==========
function openSidebar() {
    setStatusBarStyleForSidebarOpen();
    document.body.classList.add('sidebar-open');
    sidebar.classList.add('open');
    overlay.classList.add('active');
    closeTimelineModal();
    closeFavoritesModal();
    adjustFixedElements(true);
    updateCardVerticalPosition();
    autoUpdateVersionBadge();
}

function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    setStatusBarStyle();
    adjustFixedElements(false);
    updateCardVerticalPosition();
}

function adjustFixedElements(isOpen) {}

function setStatusBarStyleForSidebarOpen() {
    if (!window.plus || !plus.navigator) return;
    const isDarkMode = document.body.classList.contains('dark-mode');
    plus.navigator.setStatusBarStyle(isDarkMode ? 'light' : 'dark');
}

// ========== 收藏模态框 ==========
const favoritesModal = document.getElementById('favoritesModal');
const closeFavoritesBtn = document.querySelector('.close-favorites');
const favoritesTrigger = document.querySelector('.sidebar-menu .menu-item:first-child');

function openFavoritesModal() {
    if (document.body.classList.contains('timeline-open')) closeTimelineModal();
    if (sidebar.classList.contains('open')) closeSidebar();
    closeAllSwipedItems();
    clearDateCache();
    renderFavorites();
    document.body.classList.add('favorites-open');
    document.body.style.overflow = 'hidden';
}

function closeFavoritesModal() {
    if (!document.body.classList.contains('favorites-open')) return;
    closeAllSwipedItems();
    document.body.classList.remove('favorites-open');
    document.body.style.overflow = '';
}

// ========== 更新日志 ==========
const changelogModal = document.getElementById('changelogModal');
const changelogTrigger = document.getElementById('changelog-trigger');
const closeChangelogBtn = document.querySelector('.close-changelog');

function openChangelogModal() {
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    if (document.body.classList.contains('timeline-open')) closeTimelineModal();
    document.body.classList.add('changelog-open');
    document.body.style.overflow = 'hidden';
    loadChangelogs();
}

function closeChangelogModal() {
    if (!document.body.classList.contains('changelog-open')) return;
    document.body.classList.remove('changelog-open');
    document.body.style.overflow = '';
}

async function loadChangelogs() {
    const body = document.getElementById('changelogBody');
    if (!body) return;

    body.innerHTML = '<div class="loading-state"><i class="ri-loader-4-line"></i> 加载更新日志...</div>';

    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('GitHub API 请求失败');
        const releases = await response.json();

        if (!releases || releases.length === 0) {
            body.innerHTML = '<div class="empty-favorites"><i class="ri-history-line"></i><p>暂无更新日志</p></div>';
            return;
        }

        const validReleases = releases
            .filter(r => !r.draft && r.published_at)
            .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));

        if (validReleases.length === 0) {
            body.innerHTML = '<div class="empty-favorites"><i class="ri-history-line"></i><p>暂无更新日志</p></div>';
            return;
        }

        let html = '';
        for (const release of validReleases) {
            const version = release.tag_name.replace(/^v/, '');
            const date = new Date(release.published_at).toLocaleDateString('zh-CN');
            const content = release.body || '无更新说明';
            const formattedContent = escapeHtml(content).replace(/\n/g, '<br>');
            html += `
                <div class="changelog-item">
                    <div class="changelog-version">v${version}<span>${date}</span></div>
                    <div class="changelog-content">${formattedContent}</div>
                </div>
            `;
        }
        body.innerHTML = html;
    } catch (err) {
        console.error('加载更新日志失败', err);
        body.innerHTML = '<div class="empty-favorites"><i class="ri-error-warning-line"></i><p>加载失败，请稍后重试</p></div>';
    }
}
// ========== 版本比较与更新逻辑 ==========
function compareVersion(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
        const n1 = parts1[i] || 0;
        const n2 = parts2[i] || 0;
        if (n1 !== n2) return n1 - n2;
    }
    return 0;
}

async function fetchLatestRelease() {
    try {
        const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
        if (!response.ok) throw new Error('GitHub API 请求失败');
        const release = await response.json();
        return {
            version: release.tag_name.replace(/^v/, ''),
            downloadUrl: release.assets.length > 0 ? release.assets[0].browser_download_url : '',
            body: release.body || ''
        };
    } catch (err) {
        console.warn('获取最新版本失败', err);
        return null;
    }
}

function startDownloadUpdate(downloadUrl, modal, progressDiv, progressFill, percentSpan) {
    if (!window.plus || !plus.downloader) {
        showToast('仅支持 App 内自动更新，请前往官网下载新版');
        modal.classList.remove('active');
        return;
    }
    const dtask = plus.downloader.createDownload(downloadUrl, { filename: '_downloads/update.wgt' }, (d, status) => {
        if (status === 200) {
            plus.runtime.install(d.filename, {}, () => {
                plus.runtime.restart();
            }, (e) => {
                showToast('安装失败: ' + e.message);
                modal.classList.remove('active');
            });
            window._updateDownloadTask = null;
        } else {
            showToast('下载失败，请检查网络后重试');
            modal.classList.remove('active');
            window._updateDownloadTask = null;
        }
    });
    window._updateDownloadTask = dtask;
    dtask.addEventListener('statechange', () => {
        if (dtask.state === 3) { // 下载中
            const total = dtask.totalSize;
            const loaded = dtask.downloadedSize;
            const percent = total ? Math.floor((loaded / total) * 100) : 0;
            if (percentSpan) percentSpan.innerText = percent;
            if (progressFill) progressFill.style.width = percent + '%';
        }
    });
    progressDiv.classList.add('active');
    dtask.start();
}

async function checkForUpdate(manual = true) {
    if (!manual) return;
    const updateModal = document.getElementById('updateModal');
    if (!updateModal) return;
    // 防止重复打开弹窗
    if (updateModal.classList.contains('active')) return;

    const updateContent = document.getElementById('updateContent');
    const updateProgress = document.getElementById('updateProgress');
    const progressFill = document.getElementById('progressFill');
    const downloadPercentSpan = document.getElementById('downloadPercent');

    try {
        const release = await fetchLatestRelease();
        if (!release) {
            if (manual) showToast('检查更新失败，请稍后重试', 2000);
            return;
        }

        // 获取当前版本
        let currentVersion = '0.0.0';
        if (window.plus && plus.runtime) {
            currentVersion = plus.runtime.version;
        } else {
            currentVersion = getItem('latest_release_version') || '0.0.0';
        }

        const hasNew = compareVersion(release.version, currentVersion) > 0;
        // 更新红点状态
        updateVersionBadge(hasNew);

        if (hasNew) {
            // 有新版本：显示弹窗
            if (updateContent) updateContent.innerText = `v${release.version}\n\n${release.body.substring(0, 300)}`;
            if (updateProgress) updateProgress.classList.remove('active');

            const confirmBtn = document.getElementById('updateConfirmBtn');
            const cancelBtn = document.getElementById('updateCancelBtn');

            // 移除旧事件避免重复绑定
            const newConfirmHandler = () => {
                if (release.downloadUrl) {
                    startDownloadUpdate(release.downloadUrl, updateModal, updateProgress, progressFill, downloadPercentSpan);
                } else {
                    showToast('未找到可下载的安装包', 1500);
                }
                confirmBtn.removeEventListener('click', newConfirmHandler);
            };
            confirmBtn.removeEventListener('click', newConfirmHandler);
            confirmBtn.addEventListener('click', newConfirmHandler);
            cancelBtn.onclick = () => updateModal.classList.remove('active');

            updateModal.classList.add('active');
        } else {
            // 已是最新版本：Toast 提示
            showToast('当前已是最新版本', 1500);
        }
    } catch (err) {
        console.error('检查更新异常', err);
        if (manual) showToast('检查更新失败，请稍后重试', 2000);
    }
}
async function fetchAndUpdateVersion() {
    const versionSpan = document.querySelector('.version');
    if (!versionSpan) return;

    versionSpan.textContent = '检查中...';

    // 获取本地版本（App 或缓存）
    let localVersion = null;
    if (window.plus && plus.runtime) {
        localVersion = plus.runtime.version;
        versionSpan.textContent = `V${localVersion}`;
        setItem('latest_release_version', localVersion);
    } else {
        const cachedVer = getItem('latest_release_version');
        if (cachedVer) {
            versionSpan.textContent = `V${cachedVer}`;
            localVersion = cachedVer;
        }
    }

    // 如果 plus 未就绪，等待 plusready 后再做自动检测
    if (window.plus && !window.plus.isReady) {
        document.addEventListener('plusready', () => {
            // 更新版本号显示
            if (plus.runtime && plus.runtime.version) {
                const realVer = plus.runtime.version;
                versionSpan.textContent = `V${realVer}`;
                setItem('latest_release_version', realVer);
            }
            // 自动检测红点
            autoUpdateVersionBadge(true);
        });
    } else {
        // 直接自动检测红点
        await autoUpdateVersionBadge(true);
    }

    // 以下为获取最新版本号并更新显示（仅用于浏览器环境显示最新版本号，不控制红点）
    try {
        const release = await fetchLatestRelease();
        if (release && release.version) {
            const latestVer = release.version;
            setItem('latest_release_version', latestVer);
            if (!window.plus) {
                // 浏览器环境：直接显示最新版本号，不显示红点（因为无法更新）
                versionSpan.textContent = `V${latestVer}`;
                updateVersionBadge(false);
            } else if (plus.runtime && plus.runtime.version) {
                const currentVer = plus.runtime.version;
                const hasNew = compareVersion(latestVer, currentVer) > 0;
            }
        }
    } catch (err) {
        console.warn('获取远程版本失败', err);
        if (!window.plus) {
            updateVersionBadge(false);
        }
    }
}
function bindContactUsCopy() {
    const contactMenuItem = Array.from(document.querySelectorAll('.sidebar-menu .menu-item')).find(item => item.textContent.includes('联系我们'));
    if (contactMenuItem && !contactMenuItem.dataset.copyBound) { contactMenuItem.addEventListener('click', (e) => { e.stopPropagation(); copyEmail(); }); contactMenuItem.dataset.copyBound = 'true'; }
}

async function copyEmail() {
    const email = 'cveyo@qq.com';
    try { await navigator.clipboard.writeText(email); showToast(`邮箱已复制`); } catch(err) { const textarea = document.createElement('textarea'); textarea.value = email; document.body.appendChild(textarea); textarea.select(); const success = document.execCommand('copy'); document.body.removeChild(textarea); if (success) showToast(`邮箱已复制: ${email}`); else showToast('复制失败，请手动复制'); }
}

function bindVersionClick() {
    const versionMenuItem = Array.from(document.querySelectorAll('.sidebar-menu .menu-item')).find(item => item.textContent.includes('当前版本'));
    if (versionMenuItem && !versionMenuItem.dataset.versionBound) {
        versionMenuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            checkForUpdate(true);
        });
        versionMenuItem.dataset.versionBound = 'true';
    }
}

// ========== 拖拽滑动切换 ==========
function initDragSwipe() {
    const cardContainer = document.querySelector('.card-container');
    if (!cardContainer) return;
    const allCards = document.querySelectorAll('.card');
    if (!allCards.length) return;
    let isSettling = false;
    let dragState = {
        active: false, startX: 0, startY: 0, currentX: 0, startTime: 0,
        startIndex: 0, containerWidth: 0, baseTransforms: [], currentOffset: 0,
        isDragging: false, startImgEl: null, startImgSrc: null,
        previewCard: null, previewDate: null, previewType: null,
        edgeDirection: null,        // 'left' 或 'right'
        maxEdgeOffset: 0,
        previewRequestId: 0,
    };

    function getContainerWidth() { return cardContainer.clientWidth; }

    function updateBaseTransforms(width, activeIndex) {
        dragState.baseTransforms = [];
        for (let i = 0; i < allCards.length; i++) {
            if (i === activeIndex) dragState.baseTransforms.push(0);
            else if (i < activeIndex) dragState.baseTransforms.push(-width);
            else dragState.baseTransforms.push(width);
        }
    }

    function applyTransform(offsetX) {
        const direction = offsetX > 0 ? 'right' : (offsetX < 0 ? 'left' : null);
        const progress = Math.min(1, Math.abs(offsetX) / dragState.containerWidth);
        for (let i = 0; i < allCards.length; i++) {
            const card = allCards[i];
            const base = dragState.baseTransforms[i];
            card.style.transform = `translateX(${base + offsetX}px)`;
            let opacity = 0, zIndex = 1;
            if (i === dragState.startIndex) { opacity = 1; zIndex = 3; }
            else if (direction === 'right' && i === dragState.startIndex - 1) { opacity = progress; zIndex = 2; }
            else if (direction === 'left' && i === dragState.startIndex + 1) { opacity = progress; zIndex = 2; }
            else { opacity = 0; zIndex = 1; }
            card.style.opacity = opacity;
            card.style.zIndex = zIndex;
            card.style.pointerEvents = 'none';
        }

        // 更新预览卡片位置（完全跟随偏移量，无最大宽度限制）
        if (dragState.previewCard && dragState.edgeDirection) {
            const containerWidth = dragState.containerWidth;
            let previewOffset;
            if (dragState.edgeDirection === 'left') {
                // 向左滑动：预览卡从右边进入
                previewOffset = containerWidth + offsetX;
            } else {
                // 向右滑动：预览卡从左边进入
                previewOffset = -containerWidth + offsetX;
            }
            // 可视比例完全由偏移量决定（offsetX 可达完整 containerWidth）
            const visibleRatio = Math.min(1, Math.max(0, Math.abs(offsetX) / dragState.maxEdgeOffset));
    dragState.previewCard.style.transform = `translateX(${previewOffset}px)`;
    dragState.previewCard.style.opacity = visibleRatio;
        }
    }

    function resetToBaseNoTransition() {
        for (let i = 0; i < allCards.length; i++) {
            const card = allCards[i];
            card.style.transition = 'none';
            const base = dragState.baseTransforms[i];
            card.style.transform = `translateX(${base}px)`;
            if (i === dragState.startIndex) {
                card.style.opacity = '1';
                card.style.zIndex = '2';
            } else {
                card.style.opacity = '0';
                card.style.zIndex = '1';
            }
        }
        void allCards[0].offsetHeight;
        for (let i = 0; i < allCards.length; i++) card.style.transition = '';
    }

    function destroyPreviewCard() {
        if (dragState.previewCard && dragState.previewCard.parentNode) {
            dragState.previewCard.parentNode.removeChild(dragState.previewCard);
        }
        dragState.previewCard = null;
        dragState.previewDate = null;
        dragState.previewType = null;
        dragState.edgeDirection = null;
    }

    async function createPreviewCardAsync(date, type, direction) {
        let data = dateDataCache.get(date);
        if (!data) {
            const cached = await getCachedPost(date);
            if (cached) {
                data = cached;
                dateDataCache.set(date, data);
            } else {
                try {
                    data = await fetchPostFromNetwork(date);
                    await cachePost(date, data);
                    dateDataCache.set(date, data);
                } catch (err) {
                    console.warn('加载预览数据失败', err);
                    return null;
                }
            }
        }

        const originalCard = document.querySelector(`.card#${type}`);
        if (!originalCard) return null;

        const previewCard = originalCard.cloneNode(true);
        previewCard.classList.add('drag-preview-card');
        previewCard.style.position = 'absolute';
        previewCard.style.top = '0';
        previewCard.style.left = '0';
        previewCard.style.width = '100%';
        previewCard.style.height = '100%';
        previewCard.style.transition = 'none';
        previewCard.style.opacity = '0';
        previewCard.style.pointerEvents = 'none';
        previewCard.style.zIndex = '10';
        previewCard.style.background = 'var(--white)';

        // 填充数据
        if (type === 'music') {
            const albumImg = previewCard.querySelector('#album-img');
            if (albumImg && data.music?.cover) albumImg.src = data.music.cover;
            const trackAlbum = previewCard.querySelector('.track-album');
            if (trackAlbum) trackAlbum.textContent = data.music?.title || '';
            const trackSinger = previewCard.querySelector('.track-singer');
            if (trackSinger) trackSinger.textContent = data.music?.artist || '';
        } else if (type === 'sentence') {
            const sentenceText = previewCard.querySelector('#sentenceText');
            if (sentenceText) sentenceText.innerHTML = (data.sentence?.text || '').replace(/\n/g, '<br>');
            const fromSpan = previewCard.querySelector('#sentence .from span');
            if (fromSpan) fromSpan.textContent = data.sentence?.author ? '—' + data.sentence.author : '';
            const sentenceImg = previewCard.querySelector('#sentenceImg');
            if (sentenceImg && data.sentence?.image) {
                sentenceImg.src = data.sentence.image;
                previewCard.querySelector('.sentence-image').style.display = 'block';
            }
        } else if (type === 'article') {
            const title = previewCard.querySelector('#article-title');
            if (title) title.textContent = data.article?.title || '';
            const author = previewCard.querySelector('#article-author');
            if (author) author.textContent = `文/${data.article?.author || '佚名'}`;
            const content = previewCard.querySelector('#article-content');
            if (content) content.innerHTML = (data.article?.content || '').replace(/\n/g, '<br>');
            const img = previewCard.querySelector('#article .bg-img img');
            if (img && data.article?.image) img.src = data.article.image;
        }

        cardContainer.appendChild(previewCard);
        return previewCard;
    }

    function shouldIgnoreTouch(target) {
        if (document.body.classList.contains('favorites-open') ||
            document.body.classList.contains('sidebar-open') ||
            document.body.classList.contains('timeline-open') ||
            document.body.classList.contains('changelog-open')) return true;
        const interactiveSelectors = ['.favorite-btn', '.share-btn', '.comment-btn', '.play-pause-icon'];
        return target.closest(interactiveSelectors.join(','));
    }

    function getImageElementFromTarget(target) {
        if (target.closest('.album-image img')) return target.closest('.album-image img');
        if (target.closest('#sentenceImg')) return document.getElementById('sentenceImg');
        if (target.closest('#article .bg-img img')) return document.querySelector('#article .bg-img img');
        if (target.closest('.favorite-card img')) return target.closest('.favorite-card img');
        return null;
    }

    function getEdgeTarget(direction) {
        if (!currentDate) return null;
        if (direction === 'left' && dragState.startIndex === tabOrder.length - 1) {
            const prevDate = getPrevPublishedDate(currentDate);
            return prevDate ? { date: prevDate, type: 'music' } : null;
        }
        if (direction === 'right' && dragState.startIndex === 0) {
            const nextDate = getNextPublishedDate(currentDate);
            return nextDate ? { date: nextDate, type: 'article' } : null;
        }
        return null;
    }

    function performInternalSwitch(newIndex, shouldAnimate = true) {
        if (newIndex === dragState.startIndex) {
            if (shouldAnimate) {
                for (let i = 0; i < allCards.length; i++) allCards[i].style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1), opacity 0.3s ease';
                applyTransform(0);
                setTimeout(() => {
                    for (let i = 0; i < allCards.length; i++) allCards[i].style.transition = '';
                    setCardsPosition(dragState.startIndex);
                }, 350);
            } else {
                resetToBaseNoTransition();
                setCardsPosition(dragState.startIndex);
            }
            return;
        }

        if (shouldAnimate) {
            const targetWidth = dragState.containerWidth;
            const direction = newIndex > dragState.startIndex ? 1 : -1;
            for (let i = 0; i < allCards.length; i++) allCards[i].style.transition = 'transform 0.3s cubic-bezier(0.2, 0.9, 0.4, 1.1), opacity 0.3s ease';
            updateBaseTransforms(targetWidth, newIndex);
            const startOffset = direction === 1 ? targetWidth : -targetWidth;
            for (let i = 0; i < allCards.length; i++) {
                const card = allCards[i];
                const base = dragState.baseTransforms[i];
                card.style.transform = `translateX(${base + startOffset}px)`;
                card.style.opacity = i === newIndex ? '1' : '0';
            }
            void allCards[0].offsetHeight;
            for (let i = 0; i < allCards.length; i++) {
                const card = allCards[i];
                const base = dragState.baseTransforms[i];
                card.style.transform = `translateX(${base}px)`;
                card.style.opacity = i === newIndex ? '1' : '0';
            }
            setTimeout(() => {
                for (let i = 0; i < allCards.length; i++) allCards[i].style.transition = '';
                currentIndex = newIndex;
                const targetId = tabOrder[newIndex];
                navItems.forEach(item => item.classList.remove('active'));
                document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
                updateHighlight();
                markCurrentCardRead();
                setCardsPosition(newIndex);
            }, 350);
        } else {
            currentIndex = newIndex;
            setCardsPosition(newIndex);
            const targetId = tabOrder[newIndex];
            navItems.forEach(item => item.classList.remove('active'));
            document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
            markCurrentCardRead();
            updateHighlight();
        }
    }

    // ========== 触摸事件 ==========
    function onTouchStart(e) {
        if (isSettling || isAnimating || isDateSwitching) return;
        if (shouldIgnoreTouch(e.target)) return;
        const touch = e.touches[0];
        dragState.active = true;
        dragState.previewRequestId = 0; 
        dragState.startX = touch.clientX;
        dragState.startY = touch.clientY;
        dragState.currentX = touch.clientX;
        dragState.startTime = Date.now();
        dragState.startIndex = currentIndex;
        dragState.containerWidth = getContainerWidth();
        dragState.currentOffset = 0;
        dragState.isDragging = false;
        dragState.startImgEl = getImageElementFromTarget(e.target);
        dragState.startImgSrc = dragState.startImgEl ? dragState.startImgEl.src : null;
        dragState.edgeDirection = null;
        dragState.maxEdgeOffset = dragState.containerWidth; // 关键：允许完整滑出

        destroyPreviewCard();

        for (let i = 0; i < allCards.length; i++) allCards[i].style.transition = 'none';
        updateBaseTransforms(dragState.containerWidth, currentIndex);
        for (let i = 0; i < allCards.length; i++) {
            const card = allCards[i];
            const base = dragState.baseTransforms[i];
            card.style.transform = `translateX(${base}px)`;
            if (i === currentIndex) {
                card.style.opacity = '1';
                card.style.zIndex = '2';
            } else {
                card.style.opacity = '0';
                card.style.zIndex = '1';
            }
        }
    }

    function onTouchMove(e) {
        if (!dragState.active || isSettling) return;
        const touch = e.touches[0];
        const deltaX = touch.clientX - dragState.startX;
        const deltaY = touch.clientY - dragState.startY;

        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 5) {
            dragState.isDragging = true;
            e.preventDefault();
        } else if (Math.abs(deltaY) > 5) {
            dragState.active = false;
            resetToBaseNoTransition();
            destroyPreviewCard();
            return;
        }
        if (!dragState.isDragging) return;

        dragState.currentX = touch.clientX;
        let newOffset = deltaX;

        const isAtLeftEdge = (dragState.startIndex === 0 && newOffset > 0);
        const isAtRightEdge = (dragState.startIndex === tabOrder.length - 1 && newOffset < 0);

        if (isAtLeftEdge || isAtRightEdge) {
            const edgeDir = isAtLeftEdge ? 'right' : 'left';
            dragState.edgeDirection = edgeDir;
            const maxRaw = dragState.maxEdgeOffset; // 完整宽度
            let clamped = isAtLeftEdge ? Math.min(newOffset, maxRaw) : Math.max(newOffset, -maxRaw);
            // 阻尼：前半段线性，后半段轻微压缩，保证可以滑满
            const ratio = Math.abs(clamped) / maxRaw;
            const damped = clamped * (1 - Math.pow(ratio, 1.5) * 0.2);
            newOffset = damped;

if (!dragState.previewCard) {
    const target = getEdgeTarget(edgeDir);
    if (target && target.date) {
        prefetchDateData(target.date);

        const reqId = ++dragState.previewRequestId;   // 生成本次请求 ID
        const dir = edgeDir;

        createPreviewCardAsync(target.date, target.type, dir).then(card => {
            // 若请求 ID 不匹配，说明拖拽已结束或方向改变，丢弃卡片
            if (reqId !== dragState.previewRequestId) {
                if (card && card.parentNode) card.parentNode.removeChild(card);
                return;
            }
            // 额外确保方向一致且拖拽仍在进行
            if (card && dragState.edgeDirection === dir && dragState.active) {
                dragState.previewCard = card;
                dragState.previewDate = target.date;
                dragState.previewType = target.type;
                // 使用保存的当前偏移量，避免用已变化的 offset
                applyTransform(dragState.currentOffset);
            } else if (card && card.parentNode) {
                card.parentNode.removeChild(card);
            }
        });
    }
}
        } else {
            if (dragState.edgeDirection) {
                dragState.edgeDirection = null;
                destroyPreviewCard();
            }
            newOffset = Math.min(dragState.containerWidth, Math.max(-dragState.containerWidth, newOffset));
        }

        dragState.currentOffset = newOffset;
        applyTransform(newOffset);
    }

    async function onTouchEnd(e) {
        if (!dragState.active || isSettling) {
            dragState.active = false;
            destroyPreviewCard();
            return;
        }

        const deltaX = dragState.currentX - dragState.startX;
        const deltaTime = Date.now() - dragState.startTime;
        const velocity = Math.abs(deltaX) / deltaTime;
        const threshold = dragState.containerWidth * 0.6;
        const isFastSwipe = velocity > 0.9;

        // 边界日期切换
if (dragState.edgeDirection && dragState.previewCard && dragState.previewDate) {
    const shouldSwitch = (Math.abs(deltaX) > threshold || isFastSwipe);
    if (shouldSwitch) {
        isSettling = true;
        const targetDate = dragState.previewDate;
        const targetType = dragState.previewType;
        // 传递当前偏移量与方向，让 switchToDate 从当前位置开始动画
        await switchToDate(targetDate, targetType, {
            fromOffset: dragState.currentOffset,
            fromDirection: dragState.edgeDirection === 'left' ? -1 : 1  // left 对应 direction = -1
        });
        destroyPreviewCard(); // 动画完成后清理
        setTimeout(() => { isSettling = false; dragState.active = false; }, 400);
        return;
    } else {
        // 回弹：销毁预览卡片，恢复原位
        destroyPreviewCard();
        performInternalSwitch(dragState.startIndex, true);
        dragState.active = false;
        return;
    }
}

        // 内部卡片切换
        let shouldSwitch = false;
        let switchDirection = 0;
        if (Math.abs(deltaX) > threshold || isFastSwipe) {
            if (deltaX > 0 && dragState.startIndex > 0) {
                shouldSwitch = true;
                switchDirection = -1;
            } else if (deltaX < 0 && dragState.startIndex < tabOrder.length - 1) {
                shouldSwitch = true;
                switchDirection = 1;
            }
        }

        // 图片预览（轻触）
        if (!shouldSwitch && !dragState.isDragging && dragState.startImgEl && dragState.startImgSrc) {
            if (!window._imagePreviewLock) {
                window._imagePreviewLock = true;
                openImagePreview(dragState.startImgSrc);
                setTimeout(() => { window._imagePreviewLock = false; }, 300);
            }
            resetToBaseNoTransition();
            dragState.active = false;
            destroyPreviewCard();
            return;
        }

        if (shouldSwitch && switchDirection !== 0) {
            const newIndex = dragState.startIndex + switchDirection;
            if (newIndex >= 0 && newIndex < tabOrder.length) {
                isSettling = true;
                performInternalSwitch(newIndex, true);
                setTimeout(() => { isSettling = false; dragState.active = false; }, 400);
            } else {
                performInternalSwitch(dragState.startIndex, true);
                dragState.active = false;
            }
        } else {
            performInternalSwitch(dragState.startIndex, true);
            dragState.active = false;
        }
        destroyPreviewCard();
    }

    cardContainer.addEventListener('touchstart', onTouchStart, { passive: false });
    cardContainer.addEventListener('touchmove', onTouchMove, { passive: false });
    cardContainer.addEventListener('touchend', onTouchEnd);
    cardContainer.addEventListener('touchcancel', onTouchEnd);

    window.addEventListener('resize', () => {
        if (!dragState.active) {
            dragState.containerWidth = getContainerWidth();
            updateBaseTransforms(dragState.containerWidth, currentIndex);
            setCardsPosition(currentIndex);
        }
    });
}

// ========== 沉浸式状态栏 ==========
function setStatusBarStyle() {
    if (!window.plus || !plus.navigator) return;
    const isDark = document.body.classList.contains('dark-mode');
    plus.navigator.setStatusBarBackground('rgba(0,0,0,0)');
    plus.navigator.setStatusBarStyle(isDark ? 'light' : 'dark');
    
    let statusBarHeight = plus.navigator.getStatusbarHeight();
    statusBarHeight = statusBarHeight + 10; 
    
    const elements = document.querySelectorAll('.top-nav, .sidebar-header, .timeline-header, .favorites-header, .changelog-header, .comment-modal-header, .my-comments-header, .search-header, .policy-header');
    elements.forEach(el => {
        if (el) el.style.paddingTop = statusBarHeight + 'px';
    });
    
    if (typeof updateCardVerticalPosition === 'function') updateCardVerticalPosition();
}

// ========== APP 系统返回键逻辑 ==========
let modalStack = [];
let backButtonPressed = 0;

function registerModal(modalElement, closeFunction) {
    unregisterModal(modalElement);
    modalStack.push({ element: modalElement, close: closeFunction });
}
function unregisterModal(modalElement) {
    const index = modalStack.findIndex(item => item.element === modalElement);
    if (index !== -1) modalStack.splice(index, 1);
}
function closeTopModal() {
    if (modalStack.length === 0) return false;
    const topModal = modalStack[modalStack.length - 1];
    if (topModal && typeof topModal.close === 'function') { topModal.close(); modalStack.pop(); return true; }
    return false;
}
function observeModal(element, className, closeFn) {
    if (!element) return;
    let isActive = false;
    const observer = new MutationObserver(() => {
        const nowActive = element.classList.contains(className);
        if (nowActive && !isActive) registerModal(element, closeFn);
        else if (!nowActive && isActive) unregisterModal(element);
        isActive = nowActive;
    });
    isActive = element.classList.contains(className);
    if (isActive) registerModal(element, closeFn);
    observer.observe(element, { attributes: true });
    return observer;
}
// 全局标志，防止重复初始化
let backButtonInitialized = false;

function initBackButton() {
    if (backButtonInitialized) return;
    backButtonInitialized = true;

    // 移除旧的监听器（如果存在）
    if (window._backButtonHandler) {
        plus.key.removeEventListener('backbutton', window._backButtonHandler);
    }

    // 定义返回键处理逻辑（具名函数）
window._backButtonHandler = function() {
    if (document.getElementById('updateModal')?.classList.contains('active')) {
        closeUpdateModal();
    } else if (document.body.classList.contains('search-open')) {
        closeSearchModal();
    } else if (document.body.classList.contains('my-comments-open')) {
        closeMyCommentsModal();
    } else if (document.body.classList.contains('favorites-open')) {
        closeFavoritesModal();
    } else if (document.body.classList.contains('changelog-open')) {
        closeChangelogModal();
    } else if (document.body.classList.contains('timeline-open')) {
        closeTimelineModal();
    } else if (document.body.classList.contains('sidebar-open')) {
        closeSidebar();
    } else if (document.getElementById('commentModal')?.classList.contains('active')) {
        closeCommentModal();
    } else if (document.getElementById('commentActionSheet')?.classList.contains('active')) {
        closeActionSheet();
    } else if (document.getElementById('reportModal')?.classList.contains('active')) {
        closeReportModal();
    } else if (document.getElementById('shareModal')?.classList.contains('active')) {
        if (typeof closeSharePanel === 'function') closeSharePanel();
    } else if (document.getElementById('imagePreviewModal')?.classList.contains('active')) {
        closeImagePreview();
    } else if (document.body.classList.contains('policy-open')) {
        closePolicyModal();
    } else if (document.body.classList.contains('policy-update-open')) {
        if (window.plus && plus.runtime) {
            plus.runtime.quit();
        }
    } else {
        // 主页面：再按一次退出提示
        if (backButtonPressed === 0) {
            backButtonPressed = 1;
            showToast('再按一次退出应用', 1500);
            setTimeout(() => { backButtonPressed = 0; }, 2000);
        } else {
            plus.runtime.quit();
        }
    }
};

    // 处理 plusready：如果已就绪，直接绑定；否则等待事件
    if (window.plus && window.plus.isReady) {
        plus.key.addEventListener('backbutton', window._backButtonHandler);
    } else {
        document.addEventListener('plusready', function() {
            plus.key.addEventListener('backbutton', window._backButtonHandler);
        }, { once: true });  // 使用 once 确保只监听一次
    }

    // 注册其他模态框到返回键栈（保持不变）
    observeModal(document.body, 'sidebar-open', closeSidebar);
    observeModal(document.body, 'timeline-open', closeTimelineModal);
    observeModal(document.body, 'favorites-open', closeFavoritesModal);
    observeModal(document.body, 'changelog-open', closeChangelogModal);
    observeModal(document.body, 'my-comments-open', closeMyCommentsModal);
    observeModal(document.getElementById('commentModal'), 'active', closeCommentModal);
    observeModal(document.getElementById('commentActionSheet'), 'active', closeActionSheet);
    observeModal(document.getElementById('reportModal'), 'active', closeReportModal);
    observeModal(document.getElementById('shareModal'), 'active', () => window.closeSharePanel && window.closeSharePanel());
    observeModal(document.getElementById('imagePreviewModal'), 'active', closeImagePreview);
    observeModal(document.getElementById('updateModal'), 'active', closeUpdateModal);
    observeModal(document.body, 'policy-open', closePolicyModal);
    observeModal(document.body, 'policy-update-open', closePolicyUpdateModal);
}

// ========== 轮询更新 ==========
async function checkForUpdatesAndRefresh() {
    if (window.isUpdatingFromPoll) return;
    window.isUpdatingFromPoll = true;
    try {
        await fetchPublishedDatesList(true);
        if (currentDate) {
            await refreshPostInBackground(currentDate);
            await updateAllCommentsCount(currentDate);
        }
    } catch (err) {
        console.warn('轮询更新失败', err);
    } finally {
        window.isUpdatingFromPoll = false;
    }
}
function startPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = setInterval(() => { if (!document.hidden && navigator.onLine) checkForUpdatesAndRefresh(); }, POLL_INTERVAL); }
function stopPolling() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// ========== 初始化入口 ==========
document.addEventListener('DOMContentLoaded', async () => {
      // 初始化返回键逻辑
    initBackButton();
    if (typeof window.plus !== 'undefined') {
        document.addEventListener('plusready', function() {
            // 全局恢复监听：当 App 从后台回来时，强制关闭所有可能残留的分享/评论面板
            document.addEventListener('resume', function() {
                if (document.body.classList.contains('share-panel-open')) {
                    closeSharePanel();
                }
                if (window._isSharing) window._isSharing = false;
                const cv = plus.webview.currentWebview();
                if (cv && cv.show) cv.show();
            });
        });
    }
  if (window.plus) {
    document.addEventListener('plusready', () => {
        const currentWebview = plus.webview.currentWebview();
        // 从后台或外部应用返回时强制恢复
        currentWebview.addEventListener('resume', () => {
            // 延迟一小段时间，确保微信的退出动画完全结束
            setTimeout(() => {
                forceResumeApp(window._wasPlayingBeforeShare);
            }, 300);
        });
    });
}
  // 预加载分享服务（仅 5+ App 环境）
if (typeof window.plus !== 'undefined') {
    if (window.plus.isReady) {
        initShareServices();
    } else {
        document.addEventListener('plusready', initShareServices);
    }
}
  // 等待 plusready 完成
window.plusReady = new Promise((resolve) => {
    if (typeof window.plus !== 'undefined') {
        if (window.plus.isReady) {
            resolve();
        } else {
            document.addEventListener('plusready', () => resolve());
        }
    } else {
        resolve(); // 非 App 环境
    }
});
    // 初始化 IndexedDB
    await openReadDB().catch(e => console.warn('IndexedDB 初始化失败', e));
    // 初始化 KV 存储（从 IndexedDB 加载到内存）
    await initKeyValueStore();
    // 迁移 localStorage 旧数据到 IndexedDB
    await migrateFromLocalStorage();
    
    navItems = document.querySelectorAll('.nav-item');
    cards = document.querySelectorAll('.card');
    highlight = document.querySelector('.highlight');
    navContainer = document.querySelector('.nav-container');
    albumImage = document.querySelector('.album-image');
    playPauseIcon = document.querySelector('.play-pause-icon');
    progressFill = document.querySelector('.progress-fill');
    trackAlbum = document.querySelector('.track-album');
    trackSinger = document.querySelector('.track-singer');
    sidebar = document.getElementById('sidebar');
    overlay = document.getElementById('sidebarOverlay');
    menuBtn = document.querySelector('.menu');
    closeSidebarBtn = document.querySelector('.close-sidebar');
    timelineModal = document.querySelector('.timeline-modal');
    timelineClose = document.querySelector('.close-timeline');
    timelineTrigger = document.getElementById('timeline-trigger');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const target = item.dataset.target;
            const targetIndex = getIndexFromId(target);
            if (targetIndex !== -1 && targetIndex !== currentIndex) {
                switchTo(targetIndex);
                setItem(STATE_KEY, target);
            }
        });
    });
    
    document.addEventListener('click', (e) => {
        const timeBox = e.target.closest('.time-box');
        if (timeBox && timeBox.getAttribute('href')?.startsWith('?date=')) {
            e.preventDefault(); 
            const date = timeBox.getAttribute('data-date'); 
            if (date && date !== currentDate) {
                switchToDate(date);
            }
            closeTimelineModal();
        }
    });
    
    const initialLoader = document.getElementById('initialLoader');
    if (navigator.onLine) document.body.classList.add('online');
    else document.body.classList.remove('online');
    
    if (typeof window.plus !== 'undefined') { 
        window.plus.isReady = false; 
        document.addEventListener('plusready', function() { 
            window.plus.isReady = true; 
            console.log('5+ Runtime ready'); 
        }); 
    } else {
        window.plus = { isReady: true, share: null };
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { updateHighlight(); updateCardVerticalPosition(); });

    removeItem(STATE_KEY); // 清除可能存在的旧状态
    const savedTab = DEFAULT_TAB;
    const savedIndex = getIndexFromId(savedTab);
    cards.forEach(card => card.style.transition = 'none');
    setCardsPosition(savedIndex);
    cards[0].offsetHeight;
    cards.forEach(card => card.style.transition = '');
    currentIndex = savedIndex;
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-target="${savedTab}"]`).classList.add('active');
    updateHighlight();
    setTimeout(() => { navContainer.style.opacity = '1'; updateCardVerticalPosition(); }, 50);
    bindSearchEvents();
    registerSearchModalBackButton();
    bindMyCommentsTrigger();
    bindCommentItemClick();
    bindReportModalEvents();
    bindActionSheetEvents();
    resetPageContentTransform();
    bindContactUsCopy();
    bindVersionClick();
    initTheme();
    bindNightModeToggle();
    injectFavoriteCardStyles();
    initArticleScrollbarAutoHide();
    await fetchAndUpdateVersion();
    window.addEventListener('load', () => { updateHighlight(); updateCardVerticalPosition(); });
await checkPolicyAgreement();
    let allDates = await getCachedDatesList();
    if (!allDates || allDates.length === 0) {
        allDates = await fetchPublishedDatesList(true);
    }
    if (allDates.length === 0) { 
        console.error('无法获取任何发布日期，请检查后端接口'); 
        showToast('暂无内容，请稍后再试', 3000); 
        if (initialLoader) initialLoader.classList.add('hide');
        return; 
    }
    const latestDate = allDates[allDates.length - 1];
    let initialDate = getDateFromUrl();
    if (!initialDate) { 
        initialDate = latestDate; 
        window.history.replaceState({ date: initialDate }, '', `?date=${initialDate}`); 
    } else if (!allDates.includes(initialDate)) { 
        console.warn(`日期 ${initialDate} 不存在，自动跳转到最新日期 ${latestDate}`); 
        initialDate = latestDate; 
        window.history.replaceState({ date: initialDate }, '', `?date=${initialDate}`); 
        showToast(`日期不存在，已为您跳转至最新内容`, 2000); 
    }

    window.addEventListener('online', () => { console.log('网络已恢复'); retryNetworkAndReload(); });
    window.addEventListener('offline', () => { console.log('网络已断开'); isNetworkAvailable = false; showOfflinePlaceholder(true); });
    if (offlinePlaceholder) offlinePlaceholder.addEventListener('click', (e) => { e.stopPropagation(); retryNetworkAndReload(); });
    if (!navigator.onLine) { isNetworkAvailable = false; showOfflinePlaceholder(true); }

    displayDateInNav(initialDate);
    await loadDataForDate(initialDate, { forceRefresh: false });
    fetchPublishedDatesList(true).catch(console.warn);
    
    await fetchPublishedDatesList();
    updateHighlight();
    updateCardVerticalPosition();
    initDragSwipe();
    initImagePreviewModal();
    bindImagePreviewTriggers();
    bindCommentButtons();
    bindCommentModalEvents();

    if (favoritesTrigger) favoritesTrigger.addEventListener('click', (e) => { e.preventDefault(); openFavoritesModal(); });
    if (closeFavoritesBtn) closeFavoritesBtn.addEventListener('click', closeFavoritesModal);
    if (favoritesModal) favoritesModal.addEventListener('click', (e) => { if (e.target === favoritesModal) closeFavoritesModal(); });
    if (changelogTrigger) changelogTrigger.addEventListener('click', (e) => { e.preventDefault(); openChangelogModal(); });
    if (closeChangelogBtn) closeChangelogBtn.addEventListener('click', closeChangelogModal);
    if (changelogModal) changelogModal.addEventListener('click', (e) => { if (e.target === changelogModal) closeChangelogModal(); });

    menuBtn.addEventListener('click', (e) => { e.preventDefault(); openSidebar(); });
closeSidebarBtn.addEventListener('click', () => {
    closeSidebar();
    openSearchModal();
});
    overlay.addEventListener('click', closeSidebar);
    timelineTrigger.addEventListener('click', (e) => { e.preventDefault(); openTimelineModal(); });
    timelineClose.addEventListener('click', closeTimelineModal);
    timelineModal.addEventListener('click', (e) => { if (e.target === timelineModal) closeTimelineModal(); });

    // 收藏按钮点击事件
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;
        const isFavorite = target.classList.contains('favorite-btn');
        if (!isFavorite) return;
        const actionsDiv = target.closest('.stats-actions');
        if (!actionsDiv) return;
        const type = actionsDiv.dataset.type;
        if (!currentDate || !type) return;
        if (target.dataset.pending === 'true') return;
        target.dataset.pending = 'true';
        const icon = target.querySelector('i');
        const countSpan = target.querySelector('.count');
        if (!icon || !countSpan) { target.dataset.pending = ''; return; }
        let oldCount = parseInt(countSpan.innerText, 10);
        if (isNaN(oldCount)) oldCount = 0;
        const key = `${currentDate}_${type}_favorite`;
        const isLiked = getItem(key) === 'true';
        const delta = isLiked ? -1 : 1;
        const newCount = oldCount + delta;
        const newIconClass = isLiked ? 'ri-bookmark-line' : 'ri-bookmark-fill';
        icon.classList.remove(isLiked ? 'ri-bookmark-fill' : 'ri-bookmark-line');
        icon.classList.add(newIconClass);
        countSpan.innerText = newCount;
        if (isLiked) { removeItem(key); removeFavoriteSummary(currentDate, type); }
        else { setItem(key, 'true'); }
        icon.classList.add('heart-beat');
        if (icon._heartBeatTimer) clearTimeout(icon._heartBeatTimer);
        icon._heartBeatTimer = setTimeout(() => icon.classList.remove('heart-beat'), 400);
        try {
            const response = await fetch(`${API_BASE}/api/posts/${currentDate}/stats/${type}/favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta }) });
            if (!response.ok) throw new Error('更新失败');
            const data = await response.json();
            const statsKey = type + 'Stats';
            const realStats = data[statsKey];
            if (realStats && realStats.favorites !== undefined) countSpan.innerText = realStats.favorites;
            if (!isLiked) {
                try { const detailResponse = await fetch(`${API_BASE}/api/posts/${currentDate}`); if (detailResponse.ok) { const fullData = await detailResponse.json(); saveFavoriteSummary(currentDate, type, fullData); } } catch (e) { }
            }
        } catch (err) { console.error('收藏更新失败', err); const rollbackIconClass = isLiked ? 'ri-bookmark-fill' : 'ri-bookmark-line'; icon.classList.remove(newIconClass); icon.classList.add(rollbackIconClass); countSpan.innerText = oldCount; if (isLiked) setItem(key, 'true'); else removeItem(key); showToast('操作失败，请稍后重试'); }
        finally { target.dataset.pending = ''; }
    });

playPauseIcon.addEventListener('click', () => {
    if (!navigator.onLine) {
        showToast('网络连接不可用，无法播放');
        return;
    }
    if (!currentDisplayDate) return;
    const player = audioManager.getPlayerState(currentDisplayDate);
    if (!player || !player.src) return;
    if (player.playing) audioManager.pause(currentDisplayDate);
    else audioManager.play(currentDisplayDate);
});

    window.addEventListener('popstate', (event) => { const date = getDateFromUrl(); if (date && date !== currentDate) { loadDataForDate(date).then(() => { if (currentIndex !== 0) switchTo(0); }); } });

    window.addEventListener('resize', () => { if (window.plus && plus.navigator) setStatusBarStyle(); clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { updateHighlight(); updateCardVerticalPosition(); }, 300); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
            else if (sidebar.classList.contains('open')) closeSidebar();
            else if (document.body.classList.contains('timeline-open')) closeTimelineModal();
            else if (document.body.classList.contains('changelog-open')) closeChangelogModal();
            else if (document.body.classList.contains('my-comments-open')) closeMyCommentsModal();
            else if (document.body.classList.contains('comment-open')) closeCommentModal();
        }
    });

    window.addEventListener('storage', handleStorageChange);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && currentDate) { clearTimeout(window._visibilityTimeout); window._visibilityTimeout = setTimeout(() => { loadDataForDate(currentDate, { forceRefresh: false }); }, 300); } });
    startPolling();
    window.addEventListener('beforeunload', () => stopPolling());

    let isInitFinished = false;
    
    function finishInitAndHideLoader() {
        if (isInitFinished) return;
        isInitFinished = true;
        if (typeof setStatusBarStyle === 'function') {
            setStatusBarStyle();
        }
        if (typeof updateCardVerticalPosition === 'function') {
            updateCardVerticalPosition();
        }
        if (initialLoader && !initialLoader.classList.contains('hide')) {
            initialLoader.classList.add('hide');
            setTimeout(() => {
                if (initialLoader && initialLoader.parentNode) {
                    initialLoader.parentNode.removeChild(initialLoader);
                }
            }, 500);
        }
    }
    
    const isPlusEnv = typeof window.plus !== 'undefined' && window.plus;
    if (isPlusEnv) {
        if (window.plus.isReady) {
            finishInitAndHideLoader();
        } else {
            document.addEventListener('plusready', function onPlusReady() {
                document.removeEventListener('plusready', onPlusReady);
                finishInitAndHideLoader();
            });
            setTimeout(() => {
                if (!isInitFinished) {
                    console.warn('plusready 超时，强制完成初始化');
                    finishInitAndHideLoader();
                }
            }, 2000);
        }
    } else {
        finishInitAndHideLoader();
    }
});

function resetPageContentTransform() {
    const pageContent = document.querySelector('.page-content');
    if (pageContent && pageContent.classList.contains('favorites-closing-push')) pageContent.classList.remove('favorites-closing-push');
    if (window._favoritesClosing) window._favoritesClosing = false;
}

function injectFavoriteCardStyles() {
    const styleId = 'favorite-card-styles';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `.favorite-card .card-title,.favorite-card .card-subtitle,.favorite-card .card-preview{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.favorite-card .card-info{min-width:0;overflow:hidden;flex:1}.favorite-card .card-title-row{display:flex;flex-wrap:nowrap;align-items:baseline;gap:8px;min-width:0}.favorite-card .card-title-row .card-title{flex-shrink:1;min-width:0}.favorite-card .card-title-row .card-subtitle{flex-shrink:0;white-space:nowrap}.favorite-card .card-preview{margin-top:4px}`;
    document.head.appendChild(style);
}

function handleStorageChange(e) { 
    if (e.key === 'admin_data_updated' && e.newValue) { 
        console.log('检测到管理后台内容更新，刷新当前页面数据'); 
        if (currentDate) loadDataForDate(currentDate, { forceRefresh: true }); 
        clearDateCache(); 
        fetchAndUpdateVersion(); 
    } 
}
// 我的评论缓存 key 前缀
const MY_COMMENTS_CACHE_PREFIX = 'my_comments_cache_';

async function getCachedMyComments(deviceToken) {
    const key = MY_COMMENTS_CACHE_PREFIX + deviceToken;
    const cached = getItem(key);
    if (cached && cached.data && Array.isArray(cached.data)) {
        // 可选：检查缓存时间，这里不做强制过期，断网时直接用
        return {
            comments: cached.data,
            hasMore: cached.hasMore || false,
            page: cached.page || 1
        };
    }
    return null;
}

async function saveMyCommentsCache(deviceToken, comments, hasMore, page) {
    const key = MY_COMMENTS_CACHE_PREFIX + deviceToken;
    setItem(key, {
        data: comments,
        hasMore: hasMore,
        page: page,
        timestamp: Date.now()
    });
}

async function clearMyCommentsCache(deviceToken) {
    const key = MY_COMMENTS_CACHE_PREFIX + deviceToken;
    removeItem(key);
}
// 打开搜索模态框
function openSearchModal() {
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    if (document.body.classList.contains('timeline-open')) closeTimelineModal();
    if (document.body.classList.contains('changelog-open')) closeChangelogModal();
    if (document.body.classList.contains('my-comments-open')) closeMyCommentsModal();
    if (document.body.classList.contains('comment-open')) closeCommentModal();
    if (document.body.classList.contains('share-panel-open')) closeSharePanel();
    
    document.body.classList.add('search-open');
    document.body.style.overflow = 'hidden';
    
    // 清空输入和结果
    if (searchInput) searchInput.value = '';
    // 隐藏清空按钮
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
    clearSearchResults();
}


// 关闭搜索模态框
function closeSearchModal() {
    if (!document.body.classList.contains('search-open')) return;
    if (currentSearchController) {
        currentSearchController.abort();
        currentSearchController = null;
    }
    document.body.classList.remove('search-open');
    document.body.style.overflow = '';
}

// 清空搜索结果
function clearSearchResults() {
    if (!searchResults) return;
    const placeholder = searchResults.querySelector('.search-placeholder');
    const loadingDiv = searchResults.querySelector('.search-loading');
    const emptyDiv = searchResults.querySelector('.search-empty');
    const resultItems = searchResults.querySelectorAll('.search-result-item');
    resultItems.forEach(item => item.remove());
    if (placeholder) placeholder.style.display = 'flex';
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'none';
    // 隐藏清空按钮
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) clearBtn.style.display = 'none';
}


// 显示加载状态
function showSearchLoading(show) {
    if (!searchResults) return;
    const placeholder = searchResults.querySelector('.search-placeholder');
    const loadingDiv = searchResults.querySelector('.search-loading');
    const emptyDiv = searchResults.querySelector('.search-empty');
    if (show) {
        if (placeholder) placeholder.style.display = 'none';
        if (loadingDiv) loadingDiv.style.display = 'flex';
        if (emptyDiv) emptyDiv.style.display = 'none';
        const oldItems = searchResults.querySelectorAll('.search-result-item');
        oldItems.forEach(item => item.remove());
    } else {
        if (loadingDiv) loadingDiv.style.display = 'none';
    }
}

// 显示空状态
function showSearchEmpty() {
    if (!searchResults) return;
    const placeholder = searchResults.querySelector('.search-placeholder');
    const loadingDiv = searchResults.querySelector('.search-loading');
    const emptyDiv = searchResults.querySelector('.search-empty');
    const oldItems = searchResults.querySelectorAll('.search-result-item');
    oldItems.forEach(item => item.remove());
    if (placeholder) placeholder.style.display = 'none';
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (emptyDiv) {
        emptyDiv.style.display = 'flex';
        emptyDiv.innerHTML = `
            <p>没有找到相关内容</p>
        `;
    }
}

// 渲染搜索结果
function renderSearchResults(results, keyword = '') {
    if (!searchResults) return;
    const placeholder = searchResults.querySelector('.search-placeholder');
    const loadingDiv = searchResults.querySelector('.search-loading');
    const emptyDiv = searchResults.querySelector('.search-empty');
    if (placeholder) placeholder.style.display = 'none';
    if (loadingDiv) loadingDiv.style.display = 'none';
    if (emptyDiv) emptyDiv.style.display = 'none';
    
    const oldItems = searchResults.querySelectorAll('.search-result-item');
    oldItems.forEach(item => item.remove());
    
    if (!results || results.length === 0) {
        if (emptyDiv) {
            emptyDiv.style.display = 'flex';
            emptyDiv.innerHTML = `<p>没有找到相关内容</p>`;
        }
        return;
    }
    
    results.forEach(result => {
        const item = document.createElement('div');
        item.className = 'search-result-item';
        item.setAttribute('data-date', result.date);
        item.setAttribute('data-type', result.type);
        
        const typeMap = { music: '音乐', sentence: '句子', article: '文章' };
        const typeText = typeMap[result.type] || result.type;
        const [year, month, day] = result.date.split('-');
        const formattedDate = `${year}.${parseInt(month)}.${parseInt(day)}`;
        

const titleHtml = result.title;
const previewHtml = result.preview;
        
        item.innerHTML = `
            <div class="search-result-header">
                <span class="search-result-type">${typeText}</span>
                <span class="search-result-date">${formattedDate}</span>
            </div>
            <div class="search-result-title">${titleHtml}</div>
            <div class="search-result-preview">${previewHtml}</div>
        `;
        searchResults.appendChild(item);
    });
}
// 执行搜索
async function performSearch(keyword) {
    if (!keyword || keyword.trim() === '') {
        clearSearchResults();
        return;
    }
    
    if (currentSearchController) {
        currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    const signal = currentSearchController.signal;
    
    showSearchLoading(true);
    
    try {
        const dates = await fetchPublishedDatesList();
        const results = [];
        
        const batchSize = 5;
        for (let i = 0; i < dates.length; i += batchSize) {
            if (signal.aborted) return;
            const batch = dates.slice(i, i + batchSize);
            const batchPromises = batch.map(async (date) => {
                if (signal.aborted) return [];
                try {
                    let data = dateDataCache.get(date);
                    if (!data) {
                        data = await getCachedPost(date);
                        if (!data) {
                            data = await fetchPostFromNetwork(date, { signal });
                            await cachePost(date, data);
                            dateDataCache.set(date, data);
                        }
                    }
                    return searchInDateData(date, data, keyword);
                } catch (err) {
                    if (err.name === 'AbortError') return [];
                    console.warn(`搜索日期 ${date} 失败`, err);
                    return [];
                }
            });
            const batchResults = await Promise.all(batchPromises);
            for (const res of batchResults) {
                results.push(...res);
            }
            // 渐进渲染时传入 keyword
            renderSearchResults(results, keyword);
        }
        
        if (!signal.aborted) {
            renderSearchResults(results, keyword);
            if (results.length === 0) showSearchEmpty();
        }
    } catch (err) {
        if (err.name === 'AbortError') return;
        console.error('搜索失败', err);
        showSearchEmpty();
    } finally {
        if (currentSearchController?.signal === signal) {
            currentSearchController = null;
        }
    }
}
// 在单日数据中搜索
function searchInDateData(date, data, keyword) {
    const lowerKeyword = keyword.toLowerCase();
    const results = [];

    // 搜索音乐
    if (data.music) {
        const title = data.music.title || '';
        const artist = data.music.artist || '';
        const titleLower = title.toLowerCase();
        const artistLower = artist.toLowerCase();

        if (titleLower.includes(lowerKeyword) || artistLower.includes(lowerKeyword)) {
            let preview;
            // 构建 "歌曲名 - 歌手名" 格式的预览，并高亮匹配部分
            const combined = title + (artist ? ' - ' + artist : '');
            if (combined.length > 80) {
                preview = getKeywordContext(combined, keyword, 80);
            } else {
                // 短文本直接高亮
                const escaped = escapeHtml(combined);
                preview = highlightText(escaped, keyword);
            }
            results.push({
                date: date,
                type: 'music',
                title: highlightText(escapeHtml(title || '无标题'), keyword),
                preview: preview
            });
        }
    }

    // 搜索句子
    if (data.sentence) {
        const text = data.sentence.text || '';
        const author = data.sentence.author || '';
        if (text.toLowerCase().includes(lowerKeyword) || author.toLowerCase().includes(lowerKeyword)) {
            let preview;
            if (text.toLowerCase().includes(lowerKeyword)) {
                preview = getKeywordContext(text, keyword);
            } else {
                preview = '作者：' + highlightText(escapeHtml(author), keyword);
            }
            results.push({
                date: date,
                type: 'sentence',
                title: '句子摘录',
                preview: preview
            });
        }
    }

    // 搜索文章
    if (data.article) {
        const title = data.article.title || '';
        const author = data.article.author || '';
        const content = data.article.content || '';
        if (title.toLowerCase().includes(lowerKeyword) ||
            author.toLowerCase().includes(lowerKeyword) ||
            content.toLowerCase().includes(lowerKeyword)) {

            let preview;
            if (content.toLowerCase().includes(lowerKeyword)) {
                preview = getKeywordContext(content, keyword, 50);
            } else if (title.toLowerCase().includes(lowerKeyword)) {
                preview = highlightText(escapeHtml(title), keyword);
            } else {
                preview = '作者：' + highlightText(escapeHtml(author), keyword);
            }
            results.push({
                date: date,
                type: 'article',
                title: highlightText(escapeHtml(title || '无标题'), keyword),
                preview: preview
            });
        }
    }

    return results;
}

// 搜索防抖处理
let searchDebounceTimer = null;
function onSearchInput(e) {
    const keyword = e.target.value;
    // 控制清空按钮的显示/隐藏
    const clearBtn = document.getElementById('searchClearBtn');
    if (clearBtn) {
        clearBtn.style.display = keyword.length > 0 ? 'flex' : 'none';
    }
    if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
    if (!keyword.trim()) {
        clearSearchResults();
        return;
    }
    searchDebounceTimer = setTimeout(() => {
        performSearch(keyword);
    }, 300);
}

// 绑定搜索模态框事件
function bindSearchEvents() {
    searchModal = document.getElementById('searchModal');
    if (!searchModal) return;
    
    searchInput = document.getElementById('searchInput');
    searchResults = document.getElementById('searchResults');
    
    // 获取取消按钮
    const searchCancelBtn = document.getElementById('searchCancelBtn');
    if (searchCancelBtn) {
        searchCancelBtn.addEventListener('click', closeSearchModal);
    }
    
    // 获取清空按钮
    const searchClearBtn = document.getElementById('searchClearBtn');
    if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
            if (searchInput) {
                searchInput.value = '';
                searchClearBtn.style.display = 'none';
                clearSearchResults();
                // 让输入框重新获得焦点
                searchInput.focus();
            }
        });
    }
    
    if (searchInput) {
        // 移除旧的事件监听器（避免重复绑定）
        searchInput.removeEventListener('input', onSearchInput);
        searchInput.addEventListener('input', onSearchInput);
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(searchInput.value);
            }
        });
    }
    
    // 点击结果项跳转
    if (searchResults) {
        searchResults.addEventListener('click', (e) => {
            const resultItem = e.target.closest('.search-result-item');
            if (!resultItem) return;
            const date = resultItem.dataset.date;
            const type = resultItem.dataset.type;
            if (date && type) {
                closeSearchModal();
                navigateToContent(date, type);
            }
        });
    }
    
    // 点击遮罩关闭
    searchModal.addEventListener('click', (e) => {
        if (e.target === searchModal) closeSearchModal();
    });
}

// 注册搜索模态框到返回键栈
function registerSearchModalBackButton() {
    observeModal(document.body, 'search-open', closeSearchModal);
}
async function autoUpdateVersionBadge(force = false) {
    const now = Date.now();
    // 5分钟内不重复请求（除非强制）
    if (!force && now - lastVersionCheckTime < 5 * 60 * 1000) {
        return;
    }
    // 避免并发请求
    if (pendingVersionCheck) return pendingVersionCheck;
    
    pendingVersionCheck = (async () => {
        try {
            lastVersionCheckTime = now;
            const release = await fetchLatestRelease();
            if (!release) {
                updateVersionBadge(false);
                return;
            }
            
            let currentVersion = '0.0.0';
            // 优先使用 App 真实版本
            if (window.plus && plus.runtime && plus.runtime.version) {
                currentVersion = plus.runtime.version;
            } else {
                // 降级使用缓存版本
                const cachedVer = getItem('latest_release_version');
                if (cachedVer) currentVersion = cachedVer;
            }
            
            const hasNew = compareVersion(release.version, currentVersion) > 0;
            updateVersionBadge(hasNew);
            
            // 如果是 App 环境且有新版本，可额外做其他提示（不弹窗）
            if (hasNew && window.plus && plus.runtime) {
                console.log(`发现新版本 v${release.version}`);
                // 可选：在版本号旁边显示小红点外，还可以显示文字，但已有红点足够
            }
        } catch (err) {
            console.warn('自动版本检查失败', err);
            updateVersionBadge(false);
        } finally {
            pendingVersionCheck = null;
        }
    })();
    
    return pendingVersionCheck;
}
// ==================== 从 GitHub 加载协议内容 ====================
// 配置 GitHub raw 地址（请替换为你的实际链接）
const POLICY_URLS = {
    privacy: 'https://readsite.github.io/read-policylinks/privacy.html',
    terms: 'https://readsite.github.io/read-policylinks/terms.html'
};

// 获取协议内容并显示在模态框中
async function loadPolicy(policyType) {
    // 关闭其他面板（原有逻辑保留）
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    if (document.body.classList.contains('timeline-open')) closeTimelineModal();
    if (document.body.classList.contains('changelog-open')) closeChangelogModal();
    if (document.body.classList.contains('my-comments-open')) closeMyCommentsModal();
    if (document.body.classList.contains('comment-open')) closeCommentModal();
    if (document.body.classList.contains('share-panel-open')) window.closeSharePanel?.();

    // ★ 新增：如果协议更新弹窗正在显示，先隐藏它，并记住状态
    const updateModal = document.getElementById('policyUpdateModal');
    if (updateModal && updateModal.classList.contains('active')) {
        updateModal.style.display = 'none';
        window._policyUpdateWasHidden = true;
    } else {
        window._policyUpdateWasHidden = false;
    }

    // 打开协议内容页
    document.body.classList.add('policy-open');

    // 临时提升协议模态框的 z-index，确保完全覆盖更新弹窗
    const policyModal = document.getElementById('policyModal');
    if (policyModal) {
        policyModal.style.zIndex = '10051';  // 比 policy-update-modal (10050) 高
    }

    // 状态栏处理
    if (!document.body.classList.contains('policy-update-open')) {
        setStatusBarStyle();
    }

    // 以下加载协议内容保持不变...
    const titleElem = document.getElementById('policyModalTitle');
    const bodyElem = document.getElementById('policyBody');
    titleElem.innerText = policyType === 'privacy' ? '隐私政策' : '用户协议';
    bodyElem.innerHTML = '<div class="loading-state"><i class="ri-loader-4-line"></i> 加载中...</div>';

    try {
        const url = POLICY_URLS[policyType];
        if (!url) throw new Error('无效的协议类型');
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        let contentElem = doc.querySelector('.policy-card, .container');
        if (!contentElem) contentElem = doc.body;
        const content = contentElem.cloneNode(true);
        content.querySelectorAll('script, style, .back-link, .footer').forEach(el => el.remove());
        bodyElem.innerHTML = '';
        bodyElem.appendChild(content);
        if (!content.classList.contains('policy-card')) content.classList.add('policy-card');
    } catch (error) {
        console.error('加载协议失败:', error);
        bodyElem.innerHTML = `<div class="empty-state" style="text-align:center;padding:2rem;">
            <i class="ri-error-warning-line"></i>
            <p>加载失败，请检查网络后重试</p>
            <button id="retryPolicyBtn" style="margin-top:1rem;padding:0.5rem 1rem;">重试</button>
        </div>`;
        document.getElementById('retryPolicyBtn')?.addEventListener('click', () => loadPolicy(policyType));
    }
}
// 关闭协议模态框
function closePolicyModal() {
    if (!document.body.classList.contains('policy-open')) return;

    // 恢复协议更新弹窗（如果之前隐藏了）
    if (window._policyUpdateWasHidden) {
        const updateModal = document.getElementById('policyUpdateModal');
        if (updateModal) {
            updateModal.style.display = ''; // 恢复默认显示（active 状态由 class 控制）
        }
        window._policyUpdateWasHidden = false;
    }

    // 恢复协议模态框的默认 z-index（可选）
    const policyModal = document.getElementById('policyModal');
    if (policyModal) {
        policyModal.style.zIndex = '';
    }

    const isInUpdateFlow = document.body.classList.contains('policy-update-open');
    document.body.classList.remove('policy-open');

    if (!isInUpdateFlow) {
        setStatusBarStyle();
    }

    const bodyElem = document.getElementById('policyBody');
    if (bodyElem) bodyElem.innerHTML = '<div class="loading-state"><i class="ri-loader-4-line"></i> 加载中...</div>';
}

// 绑定侧边栏协议链接点击事件
function bindPolicyLinks() {
    const privacyLink = document.querySelector('.footer-link[data-policy="privacy"]');
    const termsLink = document.querySelector('.footer-link[data-policy="terms"]');
    const closeBtn = document.querySelector('.close-policy');
    const overlay = document.querySelector('.policy-modal');

    if (privacyLink) {
        privacyLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.body.classList.contains('policy-open')) return; // 已打开则不再重复打开
            loadPolicy('privacy');
        });
    }
    if (termsLink) {
        termsLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (document.body.classList.contains('policy-open')) return;
            loadPolicy('terms');
        });
    }
    if (closeBtn) {
        closeBtn.addEventListener('click', closePolicyModal);
    }
    // 点击模态框背景关闭（可选的体验）
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closePolicyModal();
        });
    }
}
// ========== 协议版本管理 ==========
const AGREEMENT_VERSION_URL = 'https://readsite.github.io/read-policylinks/agreement-version.json';

// 获取远程协议版本
async function fetchRemoteAgreementVersions() {
    try {
        const response = await fetch(AGREEMENT_VERSION_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error('获取协议版本失败');
        const data = await response.json();
        return {
            privacyVersion: data.privacyVersion || 0,
            termsVersion: data.termsVersion || 0,
            updateSummary: data.updateSummary || '',
            updateDate: data.updateDate || ''
        };
    } catch (err) {
        console.warn('获取远程协议版本失败', err);
        return null;
    }
}

// 获取本地已同意版本
function getLocalAgreementVersions() {
    return {
        privacyVersion: getItem('agreed_privacy_version') || 0,
        termsVersion: getItem('agreed_terms_version') || 0
    };
}

// 保存用户同意的最新版本
function saveAgreedVersions(privacyVer, termsVer) {
    setItem('agreed_privacy_version', privacyVer);
    setItem('agreed_terms_version', termsVer);
}

// 关闭协议更新弹窗
function closePolicyUpdateModal() {
    const modal = document.getElementById('policyUpdateModal');
    if (modal) {
        modal.classList.remove('active');
        document.body.classList.remove('policy-update-open');
    }
}

// 显示协议更新弹窗
function showPolicyUpdateModal(remote, updatedTypes) {
  window._policyUpdatePending = true;
    const modal = document.getElementById('policyUpdateModal');
    if (!modal) return;
    
    // 填充内容
    const summaryDiv = modal.querySelector('.update-summary');
    const protocolsList = document.getElementById('updatedProtocolsList');
    const updateDateSpan = modal.querySelector('.update-date');
    
    if (summaryDiv) summaryDiv.textContent = remote.updateSummary || '我们更新了服务协议与隐私政策，请仔细阅读后继续使用。';
    if (updateDateSpan && remote.updateDate) updateDateSpan.textContent = `更新日期：${remote.updateDate}`;
    
    if (protocolsList) {
        protocolsList.innerHTML = '';
        if (updatedTypes.includes('privacy')) {
            const li = document.createElement('li');
            li.textContent = '隐私政策';
            protocolsList.appendChild(li);
        }
        if (updatedTypes.includes('terms')) {
            const li = document.createElement('li');
            li.textContent = '用户协议';
            protocolsList.appendChild(li);
        }
    }
    
    // 绑定查看详情按钮
    const viewBtns = modal.querySelectorAll('.view-policy-btn');
    viewBtns.forEach(btn => {
        btn.removeEventListener('click', handleViewPolicy);
        btn.addEventListener('click', handleViewPolicy);
    });
    
    // 绑定同意按钮
    const agreeBtn = document.getElementById('policyUpdateAgreeBtn');
    if (agreeBtn) {
        agreeBtn.removeEventListener('click', handleAgreeUpdate);
        agreeBtn.addEventListener('click', () => handleAgreeUpdate(remote));
    }
    
    modal.classList.add('active');
    document.body.classList.add('policy-update-open');
    // 添加到返回键栈
    if (typeof registerModal === 'function') {
        registerModal(modal, closePolicyUpdateModal);
    }
}

function handleViewPolicy(e) {
    const policyType = e.currentTarget.getAttribute('data-policy');
    if (policyType) {
        loadPolicy(policyType);
    }
}

function handleAgreeUpdate(remote) {
    saveAgreedVersions(remote.privacyVersion, remote.termsVersion);
    closePolicyUpdateModal();
    window._policyUpdatePending = false;
    showToast('感谢您的理解与支持', 1500);
}

// 检查协议更新（在页面加载完成后调用）
async function checkPolicyAgreement() {
    // 获取远程版本
    const remote = await fetchRemoteAgreementVersions();
    if (!remote) return;
    
    const local = getLocalAgreementVersions();
    const updatedTypes = [];
    
    if (remote.privacyVersion > local.privacyVersion) {
        updatedTypes.push('privacy');
    }
    if (remote.termsVersion > local.termsVersion) {
        updatedTypes.push('terms');
    }
    
    // 如果有任何一个协议更新了，显示弹窗
    if (updatedTypes.length > 0) {
        // 确保没有其他重要弹窗遮挡
        if (document.body.classList.contains('sidebar-open')) closeSidebar();
        if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
        if (document.body.classList.contains('timeline-open')) closeTimelineModal();
        if (document.body.classList.contains('changelog-open')) closeChangelogModal();
        if (document.body.classList.contains('my-comments-open')) closeMyCommentsModal();
        if (document.body.classList.contains('comment-open')) closeCommentModal();
        if (document.body.classList.contains('share-panel-open')) closeSharePanel();
        
        showPolicyUpdateModal(remote, updatedTypes);
    }
}

// 在页面初始化时调用（确保 DOM 加载完成）
document.addEventListener('DOMContentLoaded', () => {
  
    bindPolicyLinks();
});
let resizeTimer;

function getTargetDateAndType(direction) {
    if (!currentDate) return null;
    // 文章（最右）向左滑 → 上一日期
    if (direction === 'left' && currentIndex === tabOrder.length - 1) {
        const prevDate = getPrevPublishedDate(currentDate);
        return prevDate ? { date: prevDate, type: 'music' } : null;
    }
    // 音乐（最左）向右滑 → 下一日期
    if (direction === 'right' && currentIndex === 0) {
        const nextDate = getNextPublishedDate(currentDate);
        return nextDate ? { date: nextDate, type: 'article' } : null;
    }
    return null;
}

async function createPreviewCard(date, type, direction) {
    let data = dateDataCache.get(date);
    if (!data) {
        const cached = await getCachedPost(date);
        if (cached) {
            data = cached;
            dateDataCache.set(date, data);
        } else {
            try {
                data = await fetchPostFromNetwork(date);
                await cachePost(date, data);
                dateDataCache.set(date, data);
            } catch (err) {
                console.warn('加载预览数据失败', err);
                return null;
            }
        }
    }

    const originalCard = document.querySelector(`.card#${type}`);
    if (!originalCard) return null;

    const previewCard = originalCard.cloneNode(true);
    previewCard.classList.add('drag-preview-card');
    previewCard.style.position = 'absolute';
    previewCard.style.top = '0';
    previewCard.style.left = '0';
    previewCard.style.width = '100%';
    previewCard.style.height = '100%';
    previewCard.style.transition = 'none';
    previewCard.style.opacity = '0';
    previewCard.style.pointerEvents = 'none';
    previewCard.style.zIndex = '10';

    // 更新内容（简化版，可根据需求完善）
    if (type === 'music') {
        const albumImg = previewCard.querySelector('#album-img');
        if (albumImg && data.music?.cover) albumImg.src = data.music.cover;
        const trackAlbum = previewCard.querySelector('.track-album');
        if (trackAlbum) trackAlbum.textContent = data.music?.title || '';
        const trackSinger = previewCard.querySelector('.track-singer');
        if (trackSinger) trackSinger.textContent = data.music?.artist || '';
    } else if (type === 'article') {
        const title = previewCard.querySelector('#article-title');
        if (title) title.textContent = data.article?.title || '';
        const author = previewCard.querySelector('#article-author');
        if (author) author.textContent = `文/${data.article?.author || '佚名'}`;
        const content = previewCard.querySelector('#article-content');
        if (content) content.innerHTML = (data.article?.content || '').replace(/\n/g, '<br>');
        const img = previewCard.querySelector('#article .bg-img img');
        if (img && data.article?.image) img.src = data.article.image;
    }

    const containerWidth = document.querySelector('.card-container').clientWidth;
    const startOffset = direction === 'left' ? containerWidth : -containerWidth;
    previewCard.style.transform = `translateX(${startOffset}px)`;

    const container = document.querySelector('.card-container');
    container.appendChild(previewCard);
        previewCard.style.transition = 'opacity 0.15s ease-out';
    requestAnimationFrame(() => {
        previewCard.style.opacity = '0';
    });
    return previewCard;
}

function updatePreviewCardOffset(previewCard, offset, direction, containerWidth) {
    if (!previewCard) return;
    let previewOffset;
    if (direction === 'left') {
        previewOffset = containerWidth + offset;
    } else {
        previewOffset = -containerWidth + offset;
    }
    previewCard.style.transform = `translateX(${previewOffset}px)`;
    // 修正透明度基准：基于预览卡片实际进入屏幕的比例
    const visibleAmount = containerWidth - Math.abs(previewOffset);
    const progress = Math.min(1, Math.max(0, visibleAmount / (containerWidth * 0.5)));
    previewCard.style.opacity = progress;
    // 添加轻微缩放，增强立体感
    const scale = 0.92 + progress * 0.08;
    previewCard.style.transform = `translateX(${previewOffset}px) scale(${scale})`;
}
function destroyPreviewCard() {
    if (window._previewCard && window._previewCard.parentNode) {
        window._previewCard.parentNode.removeChild(window._previewCard);
    }
    window._previewCard = null;
}
// ========== 文章滚动条自动隐藏 ==========
function initArticleScrollbarAutoHide() {
    const articleInner = document.querySelector('#article .card-inner');
    if (!articleInner) return;
    let scrollTimeout;
    articleInner.addEventListener('scroll', () => {
        if (!articleInner.classList.contains('scrolling')) {
            articleInner.classList.add('scrolling');
        }
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            articleInner.classList.remove('scrolling');
        }, 1000); // 停止滚动 1 秒后再隐藏，更从容
    }, { passive: true });
}
// 预加载相邻日期数据（静默，不阻塞UI）
let pendingPrefetch = new Set();
async function prefetchDateData(date) {
    if (!date || pendingPrefetch.has(date)) return;
    pendingPrefetch.add(date);
    try {
        // 如果已在缓存中则跳过
        if (dateDataCache.has(date)) return;
        const cached = await getCachedPost(date);
        if (cached) {
            dateDataCache.set(date, cached);
            return;
        }
        // 从网络获取并缓存
        const fresh = await fetchPostFromNetwork(date);
        await cachePost(date, fresh);
        dateDataCache.set(date, fresh);
    } catch (err) {
        console.warn(`预加载日期 ${date} 失败`, err);
    } finally {
        pendingPrefetch.delete(date);
    }
}
function highlightText(text, keyword) {
    if (!keyword || !text) return text;
    // 转义正则特殊字符
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
return text.replace(regex, '<span class="search-highlight">$1</span>');
}

function getKeywordContext(text, keyword, contextLen = 80) {
    if (!text || !keyword) {
        return escapeHtml((text || '').substring(0, contextLen));
    }

    // 1. 先在原始文本中定位关键词（避免转义后长度变化导致偏移错误）
    const lowerText = text.toLowerCase();
    const lowerKeyword = keyword.toLowerCase();
    const rawIndex = lowerText.indexOf(lowerKeyword);

    if (rawIndex === -1) {
        // 原始文本中找不到，尝试在转义后文本中查找（处理边缘情况）
        const escapedText = escapeHtml(text);
        const escapedLower = escapedText.toLowerCase();
        const escapedIndex = escapedLower.indexOf(lowerKeyword);
        if (escapedIndex === -1) {
            // 完全找不到，返回纯文本片段
            const plain = escapeHtml(text);
            return plain.substring(0, contextLen) + (text.length > contextLen ? '...' : '');
        }
        // 在转义文本中找到了，使用转义后的位置
        const half = Math.floor(contextLen / 2);
        const kwLenInEscaped = keyword.length; // 在转义文本中，简单关键词长度通常不变
        let start = Math.max(0, escapedIndex - half);
        let end = Math.min(escapedText.length, escapedIndex + kwLenInEscaped + half);
        let snippet = escapedText.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < escapedText.length) snippet += '...';
        return highlightText(snippet, keyword);
    }

    // 2. 在原始文本中找到了，基于原始位置截取上下文
    const half = Math.floor(contextLen / 2);
    const rawStart = Math.max(0, rawIndex - half);
    const rawEnd = Math.min(text.length, rawIndex + keyword.length + half);

    // 3. 截取原始文本片段，然后安全构建 HTML
    const before = text.substring(rawStart, rawIndex);
    const match = text.substring(rawIndex, rawIndex + keyword.length);
    const after = text.substring(rawIndex + keyword.length, rawEnd);

    // 4. 转义各部分并拼接高亮
    let result = '';
    if (rawStart > 0) result += '...';
    result += escapeHtml(before);
    result += '<span class="search-highlight">' + escapeHtml(match) + '</span>';
    result += escapeHtml(after);
    if (rawEnd < text.length) result += '...';
    const afterHighlighted = highlightText(escapeHtml(after), keyword);
    // 重新构建
    result = '';
    if (rawStart > 0) result += '...';
    result += escapeHtml(before);
    result += '<span class="search-highlight">' + escapeHtml(match) + '</span>';
    result += afterHighlighted;
    if (rawEnd < text.length) result += '...';

    return result;
}
function closeUpdateModal() {
    const modal = document.getElementById('updateModal');
    if (!modal || !modal.classList.contains('active')) return;
    
    // 如果有正在进行的下载任务，取消它
    if (window._updateDownloadTask) {
        try {
            window._updateDownloadTask.abort();
        } catch (e) {}
        window._updateDownloadTask = null;
    }
    
    // 重置进度显示
    const progressDiv = document.getElementById('updateProgress');
    const progressFill = document.getElementById('progressFill');
    const percentSpan = document.getElementById('downloadPercent');
    if (progressDiv) progressDiv.classList.remove('active');
    if (progressFill) progressFill.style.width = '0%';
    if (percentSpan) percentSpan.innerText = '0';
    
    // 恢复按钮状态
    const confirmBtn = document.getElementById('updateConfirmBtn');
    if (confirmBtn) confirmBtn.disabled = false;
    
    modal.classList.remove('active');
}