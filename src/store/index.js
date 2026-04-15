import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { initDB, getCachedPost, cachePost, fetchPostFromNetwork, getCachedDatesList, cacheDatesList } from '../utils/db'
import { getItem, setItem, removeItem, clearAll, initKeyValueStore, migrateFromLocalStorage } from '../utils/kvStore'
import { audioManager } from '../utils/audioManager'
import { API_BASE, fetchDatesList } from '../utils/api'
import { Capacitor } from '@capacitor/core'
import { StatusBar } from '@capacitor/status-bar'

export const useAppStore = defineStore('app', () => {
  // 状态
  const currentDate = ref('')
  const currentTab = ref('music')
  const publishedDates = ref([])
  const sidebarOpen = ref(false)
  const isOnline = ref(navigator.onLine)
  const isLoading = ref(true)
  const isDarkMode = ref(false)
  const toastMessage = ref('')
  const toastVisible = ref(false)
  
  // 日期数据缓存
  const dateDataCache = new Map()
  
  // 初始化
  async function init() {
    await initDB()
    await initKeyValueStore()
    await migrateFromLocalStorage()
    
    // 初始化主题
    const savedTheme = getItem('site_theme')
    isDarkMode.value = savedTheme === 'dark'
    if (isDarkMode.value) {
      document.body.classList.add('dark-mode')
    }
    
    // 设置状态栏
    if (Capacitor.isNativePlatform()) {
      await StatusBar.setOverlaysWebView({ overlay: true })
      await StatusBar.setBackgroundColor({ color: '#00000000' })
      await StatusBar.setStyle({ style: isDarkMode.value ? 'LIGHT' : 'DARK' })
    }
    
    // 加载日期列表
    await loadDatesList()
    
    // 获取初始日期
    const urlParams = new URLSearchParams(window.location.search)
    let initialDate = urlParams.get('date')
    if (!initialDate && publishedDates.value.length) {
      initialDate = publishedDates.value[publishedDates.value.length - 1]
    }
    
    if (initialDate) {
      currentDate.value = initialDate
      await loadDataForDate(initialDate)
    }
    
    isLoading.value = false
    
    // 监听网络状态
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
  }
  
  function cleanup() {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
    audioManager.clear()
  }
  
  function handleOnline() {
    isOnline.value = true
    retryNetworkAndReload()
  }
  
  function handleOffline() {
    isOnline.value = false
  }
  
  async function loadDatesList(forceRefresh = false) {
    const dates = await fetchDatesList(forceRefresh)
    publishedDates.value = dates
    return dates
  }
  
  async function loadDataForDate(date, options = { forceRefresh: false }) {
    if (!date) return
    
    let data = dateDataCache.get(date)
    
    if (!data && !options.forceRefresh) {
      const cached = await getCachedPost(date)
      if (cached) {
        data = cached
        dateDataCache.set(date, data)
      }
    }
    
    if (!data) {
      try {
        data = await fetchPostFromNetwork(date)
        await cachePost(date, data)
        dateDataCache.set(date, data)
      } catch (err) {
        console.error('加载数据失败', err)
        return
      }
    }
    
    // 触发数据更新事件
    window.dispatchEvent(new CustomEvent('dateDataLoaded', { detail: { date, data } }))
    
    // 后台刷新
    if (isOnline.value) {
      fetchPostFromNetwork(date).then(async freshData => {
        if (JSON.stringify(freshData) !== JSON.stringify(data)) {
          await cachePost(date, freshData)
          dateDataCache.set(date, freshData)
          window.dispatchEvent(new CustomEvent('dateDataUpdated', { detail: { date, data: freshData } }))
        }
      }).catch(console.warn)
    }
  }
  
  async function switchToDate(date, targetTab = null) {
    if (date === currentDate.value && targetTab === currentTab.value) return
    
    currentDate.value = date
    if (targetTab) currentTab.value = targetTab
    
    await loadDataForDate(date)
    
    const newUrl = `?date=${date}`
    window.history.pushState({ date }, '', newUrl)
  }
  
  async function switchTab(tab) {
    currentTab.value = tab
  }
  
  async function retryNetworkAndReload() {
    if (!isOnline.value) return false
    
    try {
      await loadDatesList(true)
      if (currentDate.value) {
        dateDataCache.delete(currentDate.value)
        await loadDataForDate(currentDate.value, { forceRefresh: true })
      }
      return true
    } catch (err) {
      console.error('重试失败', err)
      return false
    }
  }
  
  function toggleTheme() {
    isDarkMode.value = !isDarkMode.value
    setItem('site_theme', isDarkMode.value ? 'dark' : 'light')
    
    if (isDarkMode.value) {
      document.body.classList.add('dark-mode')
    } else {
      document.body.classList.remove('dark-mode')
    }
    
    if (Capacitor.isNativePlatform()) {
      StatusBar.setStyle({ style: isDarkMode.value ? 'LIGHT' : 'DARK' })
    }
  }
  
  function showToast(message, duration = 2000) {
    toastMessage.value = message
    toastVisible.value = true
    setTimeout(() => {
      toastVisible.value = false
    }, duration)
  }
  
  function toggleSidebar() {
    sidebarOpen.value = !sidebarOpen.value
  }
  
  function closeSidebar() {
    sidebarOpen.value = false
  }
  
  function getDateData(date) {
    return dateDataCache.get(date)
  }
  
  function setDateData(date, data) {
    dateDataCache.set(date, data)
  }
  
  return {
    currentDate,
    currentTab,
    publishedDates,
    sidebarOpen,
    isOnline,
    isLoading,
    isDarkMode,
    toastMessage,
    toastVisible,
    init,
    cleanup,
    loadDatesList,
    loadDataForDate,
    switchToDate,
    switchTab,
    retryNetworkAndReload,
    toggleTheme,
    showToast,
    toggleSidebar,
    closeSidebar,
    getDateData,
    setDateData
  }
})