// ========== 全局配置 ==========
const API_BASE = 'https://solitudenook.top';
// ========== 全局变量与状态 ==========
const navItems = document.querySelectorAll('.nav-item');
const cards = document.querySelectorAll('.card');
const highlight = document.querySelector('.highlight');
const navContainer = document.querySelector('.nav-container');
const STATE_KEY = 'ios_nav_state';
const DEFAULT_TAB = 'music';

const tabOrder = ['music', 'sentence', 'article'];
let currentIndex = 0;
let isAnimating = false;

const albumImage = document.querySelector('.album-image');
const playPauseIcon = document.querySelector('.play-pause-icon');
const progressFill = document.querySelector('.progress-fill');
const trackAlbum = document.querySelector('.track-album');
const trackSinger = document.querySelector('.track-singer');
let currentDisplayDate = '';
let isUpdatingUI = false;

const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const menuBtn = document.querySelector('.menu');
const closeSidebarBtn = document.querySelector('.close-sidebar');

const timelineModal = document.querySelector('.timeline-modal');
const timelineClose = document.querySelector('.close-timeline');
const timelineTrigger = document.getElementById('timeline-trigger');

let currentDate = '';

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
            
            this.players.set(date, {
                audio: audio,
                playing: false,
                currentTime: 0,
                src: src,
                title: title,
                artist: artist,
                cover: cover
            });
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
        
        if (this.currentPlayingDate && this.currentPlayingDate !== date) {
            this.stop(this.currentPlayingDate);
        }
        
        if (player.audio.paused) {
            player.audio.play().catch(e => console.warn('播放失败', e));
            player.playing = true;
            this.currentPlayingDate = date;
            if (date === currentDisplayDate) {
                this.updateUIForDate(date);
            }
        }
        return true;
    }
    
    pause(date) {
        const player = this.players.get(date);
        if (player && !player.audio.paused) {
            player.audio.pause();
            player.playing = false;
            if (this.currentPlayingDate === date) {
                this.currentPlayingDate = null;
            }
            if (date === currentDisplayDate) {
                this.updateUIForDate(date);
            }
        }
    }
    
    stop(date) {
        const player = this.players.get(date);
        if (player) {
            player.audio.pause();
            player.audio.currentTime = 0;
            player.playing = false;
            player.currentTime = 0;
            if (this.currentPlayingDate === date) {
                this.currentPlayingDate = null;
            }
            if (date === currentDisplayDate) {
                this.updateUIForDate(date);
            }
        }
    }
    
    stopAllExcept(exceptDate) {
        for (let [date, player] of this.players.entries()) {
            if (date !== exceptDate && player.playing) {
                player.audio.pause();
                player.playing = false;
                if (this.currentPlayingDate === date) {
                    this.currentPlayingDate = null;
                }
            }
        }
    }
    
    getPlayerState(date) {
        return this.players.get(date) || null;
    }
    
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
            if (duration && isFinite(duration)) {
                const percent = (player.audio.currentTime / duration) * 100;
                progressFill.style.width = percent + '%';
            } else {
                progressFill.style.width = '0%';
            }
        } else {
            playPauseIcon.classList.remove('play');
            playPauseIcon.classList.add('pause');
            albumImage.classList.remove('rotating');
            progressFill.style.width = '0%';
        }
        
        isUpdatingUI = false;
    }
    
    onTimeUpdate(date, audio) {
        if (date === currentDisplayDate) {
            if (!isUpdatingUI && audio.duration) {
                const percent = (audio.currentTime / audio.duration) * 100;
                progressFill.style.width = percent + '%';
            }
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
            if (this.currentPlayingDate === date) {
                this.currentPlayingDate = null;
            }
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
            if (date === currentDisplayDate) {
                this.updateUIForDate(date);
            }
        }
    }
    
    onPause(date) {
        const player = this.players.get(date);
        if (player) {
            player.playing = false;
            if (this.currentPlayingDate === date) {
                this.currentPlayingDate = null;
            }
            if (date === currentDisplayDate) {
                this.updateUIForDate(date);
            }
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

// ========== 收藏摘要缓存管理 ==========
const FAVORITE_SUMMARY_KEY_PREFIX = 'fav_summary_';

function saveFavoriteSummary(date, type, data) {
    let summary = null;
    if (type === 'music' && data.music) {
        summary = {
            title: data.music.title,
            subtitle: data.music.artist,
            cover: data.music.cover,
            preview: ''
        };
    } else if (type === 'sentence' && data.sentence) {
        summary = {
            title: '',
            subtitle: data.sentence.author,
            cover: data.sentence.image || '',
            preview: data.sentence.text.length > 20 ? data.sentence.text.substring(0, 20) + '...' : data.sentence.text
        };
    } else if (type === 'article' && data.article) {
        summary = {
            title: data.article.title,
            subtitle: data.article.author,
            cover: data.article.image,
            preview: data.article.content ? data.article.content.replace(/\n/g, ' ').substring(0, 24) + '...' : ''
        };
    }
    if (summary) {
        const key = `${FAVORITE_SUMMARY_KEY_PREFIX}${date}_${type}`;
        localStorage.setItem(key, JSON.stringify(summary));
    }
}

function removeFavoriteSummary(date, type) {
    const key = `${FAVORITE_SUMMARY_KEY_PREFIX}${date}_${type}`;
    localStorage.removeItem(key);
}

function getAllFavoriteSummaries() {
    const summaries = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(FAVORITE_SUMMARY_KEY_PREFIX)) {
            const [, dateType] = key.split(FAVORITE_SUMMARY_KEY_PREFIX);
            const [date, type] = dateType.split('_');
            const summaryStr = localStorage.getItem(key);
            if (summaryStr) {
                try {
                    const summary = JSON.parse(summaryStr);
                    summaries.push({ date, type, summary });
                } catch(e) {}
            }
        }
    }
    return summaries;
}

// ========== 卡片垂直居中控制 ==========
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
    const oldIndex = currentIndex;
    currentIndex = newIndex;

    setCardsPosition(newIndex);

    const targetId = tabOrder[newIndex];
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-target="${targetId}"]`).classList.add('active');
    localStorage.setItem(STATE_KEY, targetId);
    updateHighlight();

    setTimeout(() => {
        isAnimating = false;
    }, 400);
}

function getIndexFromId(id) {
    return tabOrder.indexOf(id);
}

// ========== 日期处理 ==========
function getCurrentDate() {
    const urlParams = new URLSearchParams(window.location.search);
    let date = urlParams.get('date');
    if (!date) {
        const today = new Date();
        date = today.toISOString().slice(0,10);
    }
    return date;
}

function displayDateInNav(date) {
    const [year, month, day] = date.split('-');
    const monthNum = parseInt(month, 10);
    document.querySelector('.date-year').innerHTML = `${year}.${monthNum}.<span class="date-day">${day}<span class="date-tag"></span></span>`;
}

function loadLikedStateFromLocalStorage(date) {
    ['music', 'sentence', 'article'].forEach(type => {
        const key = `${date}_${type}_favorite`;
        const isLiked = localStorage.getItem(key) === 'true';
        const btnIcon = document.querySelector(`.stats-actions[data-type="${type}"] .favorite-btn i`);
        if (btnIcon) {
            if (isLiked) {
                btnIcon.classList.remove('ri-heart-2-line');
                btnIcon.classList.add('ri-heart-2-fill');
            } else {
                btnIcon.classList.remove('ri-heart-2-fill');
                btnIcon.classList.add('ri-heart-2-line');
            }
        }
    });
}

async function loadDataForDate(date) {
    currentDate = date;
    currentDisplayDate = date;
    
    document.querySelectorAll('.stats-actions .favorite-btn i').forEach(icon => {
        icon.classList.remove('ri-heart-2-fill');
        icon.classList.add('ri-heart-2-line');
    });

    try {
        const response = await fetch(`${API_BASE}/api/posts/${date}`);
        if (!response.ok) throw new Error('No data');
        const data = await response.json();
        updatePage(data, date);
        loadLikedStateFromLocalStorage(date);
        updateCardVerticalPosition();
        displayDateInNav(date);
        audioManager.updateUIForDate(date);
    } catch (e) {
        console.log('No data for this date, clearing content.');
        updatePage({}, date);
        updateCardVerticalPosition();
        audioManager.updateUIForDate(date);
    }
}

async function switchToDate(date) {
    if (date === currentDate) {
        closeTimelineModal();
        return;
    }
    await loadDataForDate(date);
    closeTimelineModal();
    const newUrl = `?date=${date}`;
    window.history.pushState({ date }, '', newUrl);
    if (currentIndex !== 0) {
        switchTo(0);
    }
}

// ========== 时间轴数据加载 ==========
async function loadTimelineData() {
    try {
        // 修改请求 URL，加上 type=published 参数
        const res = await fetch(`${API_BASE}/api/posts?type=published`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let data = await res.json();

        // 从返回的对象数组中提取 date 字段
        let dates = [];
        if (Array.isArray(data)) {
            dates = data.map(item => item.date).filter(d => d);
        }

        // 去重并排序（最新的在上）
        dates = [...new Set(dates)].sort((a, b) => b.localeCompare(a));

        if (!dates.length) {
            document.querySelector('.month-list').innerHTML = '<li>暂无数据</li>';
            document.querySelector('.date-grid').innerHTML = '<p>暂无日期</p>';
            return;
        }

        // 按年月分组
        const monthMap = new Map();
        dates.forEach(date => {
            const [year, month] = date.split('-');
            const key = `${year}-${month}`;
            if (!monthMap.has(key)) monthMap.set(key, []);
            monthMap.get(key).push(date);
        });

        const months = Array.from(monthMap.entries())
            .map(([key, dates]) => ({ key, dates }))
            .sort((a, b) => (a.key < b.key ? 1 : -1)); // 最新的月份在前

        renderTimeline(months);
    } catch (error) {
        console.error('加载时间轴数据失败', error);
        document.querySelector('.month-list').innerHTML = '<li>加载失败</li>';
        document.querySelector('.date-grid').innerHTML = '<p>加载失败，请刷新重试</p>';
    }
}
function renderTimeline(months) {
    const monthList = document.querySelector('.month-list');
    const dateGrid = document.querySelector('.date-grid');
    if (!months.length) {
        monthList.innerHTML = '<li>暂无数据</li>';
        dateGrid.innerHTML = '<p>暂无日期</p>';
        return;
    }
    monthList.innerHTML = months.map((month, index) => {
        const [year, monthNum] = month.key.split('-');
        const label = `${parseInt(monthNum)}月`;
        return `<li class="month-item ${index === 0 ? 'active' : ''}" data-month-key="${month.key}">${label}</li>`;
    }).join('');
    renderDatesForMonth(months[0].key, months);
    document.querySelectorAll('.month-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.month-item').forEach(li => li.classList.remove('active'));
            item.classList.add('active');
            const monthKey = item.dataset.monthKey;
            renderDatesForMonth(monthKey, months);
        });
    });
}

function renderDatesForMonth(monthKey, allMonths) {
    const month = allMonths.find(m => m.key === monthKey);
    if (!month) return;
    const dateGrid = document.querySelector('.date-grid');
    const sortedDates = month.dates.sort((a, b) => (a < b ? 1 : -1));
    dateGrid.innerHTML = sortedDates.map(date => {
        const [year, month, day] = date.split('-');
        return `
            <a class="time-box" href="?date=${date}" data-date="${date}">
                <p class="his-day">${day}</p>
                <span class="his-fix"></span>
                <p class="his-year">${year}</p>
            </a>
        `;
    }).join('');
}

document.addEventListener('click', (e) => {
    const timeBox = e.target.closest('.time-box');
    if (!timeBox) return;
    e.preventDefault();
    const date = timeBox.getAttribute('data-date');
    if (date) {
        switchToDate(date);
    }
});

function updatePage(data, date) {
    const musicTitle = data.music?.title || '';
    const musicArtist = data.music?.artist || '';
    const musicCover = data.music?.cover || '';
    const musicSrc = data.music?.src || '';
    
    trackAlbum.textContent = musicTitle;
    trackSinger.textContent = musicArtist;
    document.getElementById('album-img').src = musicCover;
    
    if (musicSrc) {
        audioManager.getOrCreate(date, musicSrc, musicTitle, musicArtist, musicCover);
    } else {
        const existing = audioManager.getPlayerState(date);
        if (existing) {
            existing.audio.pause();
            existing.playing = false;
        }
    }
    
    const sentenceTextEl = document.getElementById('sentenceText');
    if (sentenceTextEl) {
        const sentenceContent = data.sentence?.text || '';
        sentenceTextEl.innerHTML = sentenceContent.replace(/\n/g, '<br>');
    }
    
    const fromSpan = document.querySelector('#sentence .from span');
    if (fromSpan) {
        fromSpan.textContent = data.sentence?.author ? '—' + data.sentence.author : '';
    }
    
    const sentenceImgContainer = document.getElementById('sentenceImageContainer');
    const sentenceImg = document.getElementById('sentenceImg');
    const sentenceImageUrl = data.sentence?.image || '';
    
    if (sentenceImageUrl && sentenceImgContainer && sentenceImg) {
        sentenceImg.src = sentenceImageUrl;
        sentenceImgContainer.style.display = 'block';
    } else if (sentenceImgContainer) {
        sentenceImgContainer.style.display = 'none';
    }
    
    const fullContent = data.article?.content || '';
    document.getElementById('article-title').textContent = data.article?.title || '';
    document.getElementById('article-author').textContent = `文/${data.article?.author || '佚名'}`;
    document.getElementById('article-content').innerHTML = fullContent.replace(/\n/g, '<br>');
    const articleImg = document.querySelector('#article .bg-img img');
const articleBg = document.querySelector('#article .bg-img');

if (articleImg && articleBg) {
    const imageUrl = data.article?.image || '';
    
    // 重置状态：先隐藏图片，移除加载失败标记
    articleImg.style.display = 'none';
    articleBg.classList.remove('load-failed');
    
    if (imageUrl) {
        // 图片加载成功时显示
        articleImg.onload = () => {
            articleImg.style.display = 'block';
        };
        // 图片加载失败时：保持隐藏，可以添加一个类用于样式（例如显示灰色背景）
        articleImg.onerror = () => {
            articleBg.classList.add('load-failed');
            articleImg.style.display = 'none';
        };
        articleImg.src = imageUrl;
    } else {
        // 没有图片时，标记为失败状态（显示占位背景）
        articleBg.classList.add('load-failed');
    }
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
}

playPauseIcon.addEventListener('click', () => {
    if (!currentDisplayDate) return;
    
    const player = audioManager.getPlayerState(currentDisplayDate);
    if (!player || !player.src) {
        return;
    }
    
    if (player.playing) {
        audioManager.pause(currentDisplayDate);
    } else {
        audioManager.play(currentDisplayDate);
    }
});

function updateHighlight() {
    const activeItem = document.querySelector('.nav-item.active');
    if (!activeItem) return;
    const navRect = navContainer.getBoundingClientRect();
    const itemRect = activeItem.getBoundingClientRect();
    
    highlight.style.width = `${itemRect.width}px`;
    highlight.style.height = `3px`;
    highlight.style.left = `${itemRect.left - navRect.left}px`;
    highlight.style.top = `${itemRect.bottom - navRect.top - 3}px`;
    highlight.style.opacity = '1';
}

navItems.forEach(item => {
    item.addEventListener('click', () => {
        const targetId = item.dataset.target;
        const newIndex = getIndexFromId(targetId);
        switchTo(newIndex);
    });
});

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        updateHighlight();
        updateCardVerticalPosition();
    }, 300);
});

const cardContainerEl = document.querySelector('.card-container');
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

cardContainerEl.addEventListener('touchstart', (e) => {
    if (isAnimating) return;
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStartTime = Date.now();
}, { passive: true });

cardContainerEl.addEventListener('touchmove', (e) => {
    if (!touchStartX) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartX;
    const deltaY = touch.clientY - touchStartY;
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        e.preventDefault();
    }
}, { passive: false });

cardContainerEl.addEventListener('touchend', (e) => {
    if (isAnimating || touchStartX === 0) return;

    const touchEnd = e.changedTouches[0];
    const deltaX = touchEnd.clientX - touchStartX;
    const deltaY = touchEnd.clientY - touchStartY;
    const deltaTime = Date.now() - touchStartTime;

    if (Math.abs(deltaX) > 30 && Math.abs(deltaX) > Math.abs(deltaY) && deltaTime < 300) {
        if (deltaX > 0 && currentIndex > 0) {
            switchTo(currentIndex - 1);
        } else if (deltaX < 0 && currentIndex < cards.length - 1) {
            switchTo(currentIndex + 1);
        }
    }

    touchStartX = 0;
});

function openSidebar() {
    document.body.classList.add('sidebar-open');
    sidebar.classList.add('open');
    overlay.classList.add('active');
    
    closeTimelineModal();
    closeFavoritesModal();
    adjustFixedElements(true);
    updateCardVerticalPosition();
}

function closeSidebar() {
    document.body.classList.remove('sidebar-open');
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
    
    adjustFixedElements(false);
    updateCardVerticalPosition();
}

menuBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openSidebar();
});

closeSidebarBtn.addEventListener('click', closeSidebar);
overlay.addEventListener('click', closeSidebar);

window.addEventListener('resize', () => {
    if (!sidebar.classList.contains('open')) {
        adjustFixedElements(false);
    }
});

function adjustFixedElements(isOpen) {}

function openTimelineModal() {
    if (sidebar.classList.contains('open')) closeSidebar();
    if (document.body.classList.contains('favorites-open')) closeFavoritesModal();
    
    loadTimelineData();
    document.body.classList.add('timeline-open');
}

function closeTimelineModal() {
    document.body.classList.remove('timeline-open');
}

timelineTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    openTimelineModal();
});

timelineClose.addEventListener('click', closeTimelineModal);
timelineModal.addEventListener('click', (e) => {
    if (e.target === timelineModal) closeTimelineModal();
});

document.addEventListener('click', async (e) => {
    const target = e.target.closest('button');
    if (!target) return;

    const isFavorite = target.classList.contains('favorite-btn');
    const isShare = target.classList.contains('share-btn');
    if (!isFavorite && !isShare) return;

    const actionsDiv = target.closest('.stats-actions');
    if (!actionsDiv) return;
    const type = actionsDiv.dataset.type;
    if (!currentDate || !type) return;

    if (isFavorite) {
        const icon = target.querySelector('i');
        if (icon) {
            icon.classList.remove('heart-beat');
            void icon.offsetWidth;
            icon.classList.add('heart-beat');
            
            const onAnimationEnd = () => {
                icon.classList.remove('heart-beat');
                icon.removeEventListener('animationend', onAnimationEnd);
            };
            icon.addEventListener('animationend', onAnimationEnd, { once: true });
        }
        
        const key = `${currentDate}_${type}_favorite`;
        const isLiked = localStorage.getItem(key) === 'true';
        const delta = isLiked ? -1 : 1;

        try {
            const response = await fetch(`${API_BASE}/api/posts/${currentDate}/stats/${type}/favorite`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delta })
            });
            
            if (!response.ok) throw new Error('更新失败');
            const data = await response.json();
            
            const statsKey = type + 'Stats';
            const newStats = data[statsKey];
            if (newStats) {
                const group = actionsDiv;
                const favoriteBtn = group.querySelector('.favorite-btn');
                const shareBtn = group.querySelector('.share-btn');
                if (favoriteBtn) favoriteBtn.querySelector('.count').textContent = newStats.favorites;
                if (shareBtn) shareBtn.querySelector('.count').textContent = newStats.shares;
            }

            const icon = target.querySelector('i');
            if (isLiked) {
                localStorage.removeItem(key);
                icon.classList.remove('ri-heart-2-fill');
                icon.classList.add('ri-heart-2-line');
                removeFavoriteSummary(currentDate, type);
            } else {
                localStorage.setItem(key, 'true');
                icon.classList.remove('ri-heart-2-line');
                icon.classList.add('ri-heart-2-fill');
                // 获取完整数据用于缓存摘要
                try {
                    const detailResponse = await fetch(`${API_BASE}/api/posts/${currentDate}`);
                    if (detailResponse.ok) {
                        const fullData = await detailResponse.json();
                        saveFavoriteSummary(currentDate, type, fullData);
                    }
                } catch (e) {}
            }
            
            if (typeof clearDateCache === 'function') clearDateCache();
        } catch (err) {
            console.error('收藏更新失败', err);
        }
    } else if (isShare) {
        try {
            const response = await fetch(`${API_BASE}/api/posts/${currentDate}/stats/${type}/share`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delta: 1 })
            });
            if (!response.ok) throw new Error('更新失败');
            const data = await response.json();
            
            const statsKey = type + 'Stats';
            const newStats = data[statsKey];
            if (newStats) {
                const shareBtn = actionsDiv.querySelector('.share-btn');
                if (shareBtn) shareBtn.querySelector('.count').textContent = newStats.shares;
            }
        } catch (err) {
            console.error('分享更新失败', err);
        }
    }
});

const dateDataCache = new Map();

function clearDateCache() {
    dateDataCache.clear();
}

function getFavoritesFromStorage() {
    const favorites = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && /^\d{4}-\d{2}-\d{2}_(music|sentence|article)_favorite$/.test(key)) {
            const value = localStorage.getItem(key);
            if (value === 'true') {
                const [date, type] = key.split('_');
                favorites.push({ date, type });
            }
        }
    }
    return favorites;
}

function groupFavoritesByDate(favorites) {
    const groups = new Map();
    favorites.forEach(item => {
        if (!groups.has(item.date)) {
            groups.set(item.date, []);
        }
        groups.get(item.date).push(item.type);
    });
    return groups;
}

async function fetchDateData(date) {
    if (dateDataCache.has(date)) {
        return dateDataCache.get(date);
    }
    try {
        const response = await fetch(`${API_BASE}/api/posts/${date}`);
        if (!response.ok) {
            throw new Error('No data');
        }
        const data = await response.json();
        dateDataCache.set(date, data);
        return data;
    } catch (error) {
        console.warn(`获取日期 ${date} 数据失败`, error);
        return null;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    }).replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function(c) {
        return c;
    });
}

// ========== 左滑删除相关函数 ==========
function buildSwipeCardHTML(contentHtml, date, type) {
    return `
        <div class="swipe-container" data-date="${date}" data-type="${type}">
            <div class="swipe-inner">
                <div class="card-content" data-date="${date}" data-type="${type}">
                    ${contentHtml}
                </div>
                <div class="delete-btn-area" data-delete-date="${date}" data-delete-type="${type}">
                    <i class="ri-delete-bin-line"></i>
                </div>
            </div>
        </div>
    `;
}

function renderFavoriteCardFromSummary(type, summary, date) {
    let contentHtml = '';
    if (type === 'music') {
        contentHtml = `
            <div class="favorite-card music-card">
                <img class="card-cover" src="${escapeHtml(summary.cover || '')}" onerror="this.src='img/default-cover.png'">
                <div class="card-info">
                    <div class="card-title">${escapeHtml(summary.title)}</div>
                    <div class="card-subtitle">${escapeHtml(summary.subtitle || '未知歌手')}</div>
                </div>
                <i class="ri-play-circle-line" style="color: #999; font-size: 22px;"></i>
            </div>
        `;
    } else if (type === 'sentence') {
        contentHtml = `
            <div class="favorite-card sentence-card">
                <img class="card-cover" src="${escapeHtml(summary.cover || '')}" onerror="this.src='img/default-sentence.png'">
                <div class="card-info">
                    <div class="card-preview">“${escapeHtml(summary.preview)}”</div>
                    <div class="card-subtitle">— ${escapeHtml(summary.subtitle || '佚名')}</div>
                </div>
                 <i class="ri-article-line" style="color: #999; font-size: 22px;"></i>
            </div>
        `;
    } else if (type === 'article') {
        contentHtml = `
            <div class="favorite-card article-card">
                <img class="card-cover" src="${escapeHtml(summary.cover || '')}" onerror="this.src='img/default-article.png'">
                <div class="card-info">
                <div class="card-title-row">
                    <div class="card-title">${escapeHtml(summary.title)}</div>
                    <div class="card-subtitle">${escapeHtml(summary.subtitle || '')}</div>
                    </div>
                    <div class="card-preview">${escapeHtml(summary.preview)}</div>
                </div>
                  <i class="ri-newspaper-line" style="color: #999; font-size: 22px;"></i>
            </div>
        `;
    }
    return buildSwipeCardHTML(contentHtml, date, type);
}

function renderFavoriteCard(type, data, date) {
    let contentHtml = '';
    switch (type) {
        case 'music':
            if (!data.music || !data.music.title) return '';
            contentHtml = `
                <div class="favorite-card music-card">
                    <img class="card-cover" src="${data.music.cover || ''}" onerror="this.src='img/default-cover.png'">
                    <div class="card-info">
                        <div class="card-title">${escapeHtml(data.music.title)}</div>
                        <div class="card-subtitle">${escapeHtml(data.music.artist || '未知歌手')}</div>
                    </div>
                    <i class="ri-play-circle-line" style="color: #999; font-size: 22px;"></i>
                </div>
            `;
            break;
        case 'sentence':
            if (!data.sentence || !data.sentence.text) return '';
            const sentenceText = data.sentence.text.length > 12 
                ? data.sentence.text.substring(0, 12) + '...' 
                : data.sentence.text;
            contentHtml = `
                <div class="favorite-card sentence-card">
                    <img class="card-cover" src="${data.sentence.image || ''}" onerror="this.src='img/default-sentence.png'">
                    <div class="card-info">
                        <div class="card-preview">“${escapeHtml(sentenceText)}”</div>
                        <div class="card-subtitle">— ${escapeHtml(data.sentence.author || '佚名')}</div>
                    </div>
                    <i class="ri-article-line" style="color: #999; font-size: 22px;"></i>
                </div>
            `;
            break;
        case 'article':
            if (!data.article || !data.article.title) return '';
            const articlePreview = data.article.content 
                ? data.article.content.replace(/\n/g, ' ').substring(0, 24) + '...' 
                : '';
            contentHtml = `
                <div class="favorite-card article-card">
                    <img class="card-cover" src="${data.article.image || ''}" onerror="this.src='img/default-article.png'">
                    <div class="card-info">
                        <div class="card-title">${escapeHtml(data.article.title)}</div>
                        <div class="card-subtitle">${escapeHtml(data.article.author || '')}</div>
                        <div class="card-preview">${escapeHtml(articlePreview)}</div>
                    </div>
                    <i class="ri-newspaper-line" style="color: #999; font-size: 22px;"></i>
                </div>
            `;
            break;
        default: return '';
    }
    return buildSwipeCardHTML(contentHtml, date, type);
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

    let startX = 0;
    let startY = 0;
    let currentTranslate = 0;
    let isSwiping = false;
    let swipeStartTime = 0;
    let isSwiped = false;
    const swipeInner = container.querySelector('.swipe-inner');
    if (!swipeInner) return;

    function onStart(clientX, clientY) {
        if (event && event.target && event.target.closest('.delete-btn-area')) return;

        closeAllSwipedItems();
        startX = clientX;
        startY = clientY;
        swipeStartTime = Date.now();
        const transform = swipeInner.style.transform;
        if (transform === 'translateX(-70px)') {
            currentTranslate = -70;
        } else {
            currentTranslate = 0;
        }
        isSwiping = true;
        isSwiped = false;
        container.style.transition = 'none';
    }

    function onMove(clientX, clientY) {
        if (!isSwiping) return;
        const deltaX = clientX - startX;
        const deltaY = clientY - startY;
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 8) {
            if (event && event.preventDefault) event.preventDefault();
        }
        let newTranslate = currentTranslate + deltaX;
        newTranslate = Math.min(0, Math.max(-70, newTranslate));
        swipeInner.style.transform = `translateX(${newTranslate}px)`;

        if (Math.abs(deltaX) > 10) {
            isSwiped = true;
        }
    }

    function onEnd(clientX) {
        if (!isSwiping) {
            swipeInner.style.transition = '';
            return;
        }
        isSwiping = false;
        container.style.transition = '';
        const deltaX = clientX - startX;
        const deltaTime = Date.now() - swipeStartTime;

        let finalTranslate = 0;
        if (deltaX < -30 || (currentTranslate + deltaX < -35)) {
            finalTranslate = -70;
            if (currentlyOpenedSwipe && currentlyOpenedSwipe !== container) {
                const prevInner = currentlyOpenedSwipe.querySelector('.swipe-inner');
                if (prevInner) prevInner.style.transform = 'translateX(0px)';
            }
            currentlyOpenedSwipe = container;
        } else {
            finalTranslate = 0;
            if (currentlyOpenedSwipe === container) currentlyOpenedSwipe = null;
        }
        swipeInner.style.transform = `translateX(${finalTranslate}px)`;
        swipeInner.style.transition = 'transform 0.25s cubic-bezier(0.2, 0.9, 0.4, 1.1)';
        startX = 0;

        if (isSwiped) {
            if (window._swipeJustEndedTimer) clearTimeout(window._swipeJustEndedTimer);
            window._swipeJustEnded = true;
            window._swipeJustEndedTimer = setTimeout(() => {
                window._swipeJustEnded = false;
            }, 300);
        }
    }

    const onTouchStart = (e) => {
        if (e.target.closest('.delete-btn-area')) return;
        const touch = e.touches[0];
        onStart(touch.clientX, touch.clientY);
    };
    const onTouchMove = (e) => {
        if (!isSwiping) return;
        const touch = e.touches[0];
        onMove(touch.clientX, touch.clientY);
        if (Math.abs(touch.clientX - startX) > Math.abs(touch.clientY - startY) && Math.abs(touch.clientX - startX) > 8) {
            e.preventDefault();
        }
    };
    const onTouchEnd = (e) => {
        const changed = e.changedTouches[0];
        onEnd(changed.clientX);
    };

    let mouseMoveHandler = null;
    let mouseUpHandler = null;

    const onMouseDown = (e) => {
        if (e.button !== 0) return;
        if (e.target.closest('.delete-btn-area')) return;
        e.preventDefault();
        onStart(e.clientX, e.clientY);

        mouseMoveHandler = (moveEvent) => {
            moveEvent.preventDefault();
            onMove(moveEvent.clientX, moveEvent.clientY);
        };
        mouseUpHandler = (upEvent) => {
            onEnd(upEvent.clientX);
            document.removeEventListener('mousemove', mouseMoveHandler);
            document.removeEventListener('mouseup', mouseUpHandler);
            mouseMoveHandler = null;
            mouseUpHandler = null;
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        document.addEventListener('mouseup', mouseUpHandler);
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd);
    container.addEventListener('mousedown', onMouseDown);

    container._swipeHandlers = { onTouchStart, onTouchMove, onTouchEnd, onMouseDown };
}
function handleCardNavigation(e) {
    if (window._swipeJustEnded) {
        return;
    }

    if (e.target.closest('.delete-btn-area')) return;

    const swipeContainer = e.target.closest('.swipe-container');
    if (!swipeContainer) return;

    const date = swipeContainer.dataset.date;
    const type = swipeContainer.dataset.type;
    if (!date || !type) return;

    if (currentlyOpenedSwipe) {
        closeAllSwipedItems();
        return;
    }

    if (window.navigateToContent) {
        window.navigateToContent(date, type);
    }
}
async function executeDeleteFavorite(swipeContainer, date, type) {
    if (!swipeContainer) return;
    const deleteBtn = swipeContainer.querySelector('.delete-btn-area');
    if (deleteBtn) deleteBtn.style.pointerEvents = 'none';
    
    try {
        const response = await fetch(`${API_BASE}/api/posts/${date}/stats/${type}/favorite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta: -1 })
        });
        if (!response.ok) throw new Error('取消收藏失败');
        const data = await response.json();
        
        const storageKey = `${date}_${type}_favorite`;
        localStorage.removeItem(storageKey);
        removeFavoriteSummary(date, type);
        
    if (currentDate === date) {
        const statsKey = type + 'Stats';
        const newStats = data[statsKey];
        if (newStats) {
            const actionsDiv = document.querySelector(`.stats-actions[data-type="${type}"]`);
            if (actionsDiv) {
                const favCountSpan = actionsDiv.querySelector('.favorite-btn .count');
                if (favCountSpan) favCountSpan.textContent = newStats.favorites;
            }
        }
        const btnIcon = document.querySelector(`.stats-actions[data-type="${type}"] .favorite-btn i`);
        if (btnIcon) {
            btnIcon.classList.remove('ri-heart-2-fill');
            btnIcon.classList.add('ri-heart-2-line');
        }
    }
        
        const groupDiv = swipeContainer.closest('.favorites-date-group');
        swipeContainer.remove();
        
        if (groupDiv && groupDiv.querySelectorAll('.swipe-container').length === 0) {
            groupDiv.remove();
        }
        
        const favoritesBody = document.getElementById('favoritesBody');
        const remainingGroups = favoritesBody.querySelectorAll('.favorites-date-group');
        if (remainingGroups.length === 0) {
            favoritesBody.classList.add('empty');
            favoritesBody.innerHTML = `
                <div class="empty-favorites">
                    <i class="ri-heart-2-fill"></i>
                    <p>暂无收藏内容</p>
                </div>
            `;
            favoritesBody.classList.remove('has-favorites');
        }
        
        clearDateCache();
        
        if (currentlyOpenedSwipe === swipeContainer) currentlyOpenedSwipe = null;
        
    } catch (err) {
        console.error('删除收藏失败', err);
        if (window.showToast) window.showToast('删除失败，请稍后重试');
        if (deleteBtn) deleteBtn.style.pointerEvents = '';
    } finally {
        if (deleteBtn) deleteBtn.style.pointerEvents = '';
    }
}

function bindDeleteButtons() {
    const favoritesBody = document.getElementById('favoritesBody');
    if (!favoritesBody) return;
    favoritesBody.removeEventListener('click', handleDeleteClick);
    favoritesBody.addEventListener('click', handleDeleteClick);
}

async function handleDeleteClick(e) {
    const deleteArea = e.target.closest('.delete-btn-area');
    if (!deleteArea) return;
    e.stopPropagation();
    const swipeContainer = deleteArea.closest('.swipe-container');
    if (!swipeContainer) return;
    const date = swipeContainer.dataset.date;
    const type = swipeContainer.dataset.type;
    if (date && type) {
        await executeDeleteFavorite(swipeContainer, date, type);
    }
}

async function renderFavorites() {
    const favoritesBody = document.getElementById('favoritesBody');
    if (!favoritesBody) return;

    favoritesBody.classList.remove('empty', 'has-favorites');

    const favorites = getFavoritesFromStorage();
    if (favorites.length === 0) {
        favoritesBody.classList.add('empty');
        favoritesBody.innerHTML = `
            <div class="empty-favorites">
                <i class="ri-heart-2-fill"></i>
                <p>暂无收藏内容</p>
            </div>
        `;
        return;
    }

    const summaries = getAllFavoriteSummaries();
    const summaryMap = new Map();
    summaries.forEach(s => {
        const key = `${s.date}_${s.type}`;
        summaryMap.set(key, s.summary);
    });

    const groups = groupFavoritesByDate(favorites);
    const sortedDates = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));

    let html = '';
    const needFetchDates = new Set();

    for (const date of sortedDates) {
        const types = groups.get(date);
        const [year, month, day] = date.split('-');
        const formattedDate = `${year}年${parseInt(month)}月${parseInt(day)}日`;
        html += `<div class="favorites-date-group" data-date="${date}">
                    <div class="date-group-header">-&nbsp;${formattedDate}&nbsp;-</div>`;

        for (const type of ['music', 'sentence', 'article']) {
            if (!types.includes(type)) continue;

            const cacheKey = `${date}_${type}`;
            const summary = summaryMap.get(cacheKey);
            if (summary) {
                html += renderFavoriteCardFromSummary(type, summary, date);
            } else {
                html += `
                    <div class="swipe-container placeholder" data-date="${date}" data-type="${type}">
                        <div class="swipe-inner">
                            <div class="card-content">
                                <div class="favorite-card ${type}-card">
                                    <div class="card-icon"><i class="ri-loader-4-line"></i></div>
                                    <div class="card-info">
                                        <div class="card-title">加载中...</div>
                                    </div>
                                </div>
                            </div>
                            <div class="delete-btn-area" data-delete-date="${date}" data-delete-type="${type}">
                                <i class="ri-delete-bin-line"></i>
                            </div>
                        </div>
                    </div>
                `;
                needFetchDates.add(date);
            }
        }
        html += `</div>`;
    }

    favoritesBody.innerHTML = html;
    favoritesBody.classList.add('has-favorites');

    if (needFetchDates.size > 0) {
        const fetchPromises = Array.from(needFetchDates).map(date => fetchDateData(date));
        const results = await Promise.allSettled(fetchPromises);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const date = Array.from(needFetchDates)[i];
            if (result.status === 'fulfilled' && result.value) {
                const types = groups.get(date);
                for (const type of types) {
                    const cacheKey = `${date}_${type}`;
                    if (!summaryMap.has(cacheKey)) {
                        saveFavoriteSummary(date, type, result.value);
                        const targetCard = document.querySelector(`.swipe-container[data-date="${date}"][data-type="${type}"]`);
                        if (targetCard && targetCard.classList.contains('placeholder')) {
                            const newCardHtml = renderFavoriteCard(type, result.value, date);
                            if (newCardHtml) {
                                targetCard.outerHTML = newCardHtml;
                            }
                        }
                    }
                }
            }
        }
        const containers = document.querySelectorAll('#favoritesBody .swipe-container');
        containers.forEach(container => bindSwipeEvents(container));
        bindDeleteButtons();
    } else {
        const containers = document.querySelectorAll('#favoritesBody .swipe-container');
        containers.forEach(container => bindSwipeEvents(container));
        bindDeleteButtons();
    }
    
    const favoritesBodyDiv = document.getElementById('favoritesBody');
    favoritesBodyDiv.removeEventListener('click', handleCardNavigation);
    favoritesBodyDiv.addEventListener('click', handleCardNavigation);
}

function navigateToContent(date, type) {
    closeFavoritesModal();
    loadDataForDate(date);
    const typeIndex = tabOrder.indexOf(type);
    if (typeIndex !== -1 && typeIndex !== currentIndex) {
        switchTo(typeIndex);
    }
    window.scrollTo(0, 0);
}

const favoritesModal = document.getElementById('favoritesModal');
const closeFavoritesBtn = document.querySelector('.close-favorites');
const favoritesTrigger = document.querySelector('.sidebar-menu .menu-item:first-child');

function openFavoritesModal() {
    if (document.body.classList.contains('timeline-open')) {
        closeTimelineModal();
    }
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    }
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

if (closeFavoritesBtn) {
    closeFavoritesBtn.addEventListener('click', closeFavoritesModal);
}

if (favoritesModal) {
    favoritesModal.addEventListener('click', (e) => {
        if (e.target === favoritesModal) {
            closeFavoritesModal();
        }
    });
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (document.body.classList.contains('favorites-open')) {
            closeFavoritesModal();
        } else if (sidebar.classList.contains('open')) {
            closeSidebar();
        } else if (document.body.classList.contains('timeline-open')) {
            closeTimelineModal();
        }
    }
});

if (favoritesTrigger) {
    favoritesTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        openFavoritesModal();
    });
}

function showToast(message, duration = 2000) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, duration);
}

async function copyEmail() {
    const email = 'cveyo@qq.com';
    try {
        await navigator.clipboard.writeText(email);
        showToast(`邮箱已复制`);
    } catch (err) {
        console.error('Clipboard API 复制失败，尝试降级方案', err);
        const textarea = document.createElement('textarea');
        textarea.value = email;
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (success) {
            showToast(`邮箱已复制: ${email}`);
        } else {
            showToast('复制失败，请手动复制');
        }
    }
}

function bindContactUsCopy() {
    const contactMenuItem = Array.from(document.querySelectorAll('.sidebar-menu .menu-item'))
        .find(item => item.textContent.includes('联系我们'));
    if (contactMenuItem && !contactMenuItem.dataset.copyBound) {
        contactMenuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            copyEmail();
        });
        contactMenuItem.dataset.copyBound = 'true';
    }
}

function bindVersionClick() {
    const versionMenuItem = Array.from(document.querySelectorAll('.sidebar-menu .menu-item'))
        .find(item => item.textContent.includes('当前版本'));
    if (versionMenuItem && !versionMenuItem.dataset.versionBound) {
        versionMenuItem.addEventListener('click', (e) => {
            e.stopPropagation();
            showToast('已是最新版本');
        });
        versionMenuItem.dataset.versionBound = 'true';
    }
}

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
    body.innerHTML = '<div class="loading-state"><i class="ri-loader-4-line"></i> 加载更新日志...</div>';
    try {
        const res = await fetch(`${API_BASE}/api/changelogs`);
        const logs = await res.json();
        if (!logs.length) {
            body.innerHTML = '<div class="empty-favorites"><i class="ri-history-line"></i><p>暂无更新日志</p></div>';
            return;
        }
        body.innerHTML = logs.map(log => `
            <div class="changelog-item">
                <div class="changelog-version">
                    v${escapeHtml(log.version)}
                    <span>${log.date}</span>
                </div>
                <div class="changelog-content">${escapeHtml(log.content).replace(/\n/g, '<br>')}</div>
            </div>
        `).join('');
    } catch (err) {
        body.innerHTML = '<div class="empty-favorites"><i class="ri-error-warning-line"></i><p>加载失败，请稍后重试</p></div>';
    }
}

if (changelogTrigger) {
    changelogTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        openChangelogModal();
    });
}
if (closeChangelogBtn) {
    closeChangelogBtn.addEventListener('click', closeChangelogModal);
}
if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
        if (e.target === changelogModal) closeChangelogModal();
    });
}

window.addEventListener('popstate', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const date = urlParams.get('date') || getCurrentDate();
    if (date !== currentDate) {
        loadDataForDate(date).then(() => {
            if (currentIndex !== 0) switchTo(0);
        });
    }
});

document.addEventListener('DOMContentLoaded', () => {
    window._swipeJustEnded = false;
    window._swipeJustEndedTimer = null;
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
            updateHighlight();
            updateCardVerticalPosition();
        });
    }
    const date = getCurrentDate();
    displayDateInNav(date);
    loadDataForDate(date);

    const savedTab = localStorage.getItem(STATE_KEY) || DEFAULT_TAB;
    const savedIndex = getIndexFromId(savedTab);

    cards.forEach(card => card.style.transition = 'none');
    setCardsPosition(savedIndex);
    cards[0].offsetHeight;
    cards.forEach(card => card.style.transition = '');

    currentIndex = savedIndex;
    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-target="${savedTab}"]`).classList.add('active');
    updateHighlight();

    setTimeout(() => {
        navContainer.style.opacity = '1';
        updateCardVerticalPosition();
    }, 50);
    
    resetPageContentTransform();
    bindContactUsCopy();
    bindVersionClick();
    window.addEventListener('load', () => {
        updateHighlight();
        updateCardVerticalPosition();
    });
});

function resetPageContentTransform() {
    const pageContent = document.querySelector('.page-content');
    if (pageContent && pageContent.classList.contains('favorites-closing-push')) {
        pageContent.classList.remove('favorites-closing-push');
    }
    if (window._favoritesClosing) {
        window._favoritesClosing = false;
    }
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('SW registered', reg))
    .catch(err => console.error('SW failed', err));
}
window.toggleCard = function() {};
window.hideCard = function() {};

// 暴露必要的全局函数供内部调用
window.renderFavoriteCardFromSummary = renderFavoriteCardFromSummary;
window.renderFavoriteCard = renderFavoriteCard;
window.renderFavorites = renderFavorites;
window.navigateToContent = navigateToContent;
window.openFavoritesModal = openFavoritesModal;
window.closeFavoritesModal = closeFavoritesModal;
window.clearDateCache = clearDateCache;
window.showToast = showToast;
window.removeFavoriteSummary = removeFavoriteSummary;