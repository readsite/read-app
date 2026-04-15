class AudioManager {
  constructor() {
    this.players = new Map()
    this.currentPlayingDate = null
  }
  
  getOrCreate(date, src, title, artist, cover) {
    if (!this.players.has(date)) {
      const audio = new Audio()
      audio.src = src
      audio.preload = 'metadata'
      audio.loop = false
      
      audio.addEventListener('timeupdate', () => this.onTimeUpdate(date, audio))
      audio.addEventListener('ended', () => this.onEnded(date))
      audio.addEventListener('play', () => this.onPlay(date))
      audio.addEventListener('pause', () => this.onPause(date))
      
      this.players.set(date, { audio, playing: false, currentTime: 0, src, title, artist, cover })
    } else {
      const player = this.players.get(date)
      if (player.src !== src && src) {
        player.src = src
        player.audio.src = src
        player.playing = false
        player.currentTime = 0
        player.audio.currentTime = 0
      }
      if (title) player.title = title
      if (artist) player.artist = artist
      if (cover) player.cover = cover
    }
    return this.players.get(date)
  }
  
  play(date) {
    const player = this.players.get(date)
    if (!player || !player.src) return false
    
    if (this.currentPlayingDate && this.currentPlayingDate !== date) {
      this.pause(this.currentPlayingDate)
    }
    
    player.audio.play().then(() => {
      player.playing = true
      this.currentPlayingDate = date
      this.dispatchUpdate(date)
    }).catch(console.warn)
    return true
  }
  
  pause(date) {
    const player = this.players.get(date)
    if (player && !player.audio.paused) {
      player.audio.pause()
      player.playing = false
      if (this.currentPlayingDate === date) this.currentPlayingDate = null
      this.dispatchUpdate(date)
    }
  }
  
  stop(date) {
    const player = this.players.get(date)
    if (player) {
      player.audio.pause()
      player.audio.currentTime = 0
      player.playing = false
      player.currentTime = 0
      if (this.currentPlayingDate === date) this.currentPlayingDate = null
      this.dispatchUpdate(date)
    }
  }
  
  getPlayerState(date) {
    return this.players.get(date) || null
  }
  
  dispatchUpdate(date) {
    window.dispatchEvent(new CustomEvent('audioStateChanged', { detail: { date } }))
  }
  
  onTimeUpdate(date, audio) {
    if (audio.duration) {
      window.dispatchEvent(new CustomEvent('audioTimeUpdate', { 
        detail: { date, currentTime: audio.currentTime, duration: audio.duration }
      }))
    }
  }
  
  onEnded(date) {
    const player = this.players.get(date)
    if (player) {
      player.playing = false
      player.currentTime = 0
      player.audio.currentTime = 0
      if (this.currentPlayingDate === date) this.currentPlayingDate = null
      this.dispatchUpdate(date)
    }
  }
  
  onPlay(date) {
    const player = this.players.get(date)
    if (player) {
      player.playing = true
      if (this.currentPlayingDate !== date) {
        if (this.currentPlayingDate) this.pause(this.currentPlayingDate)
        this.currentPlayingDate = date
      }
      this.dispatchUpdate(date)
    }
  }
  
  onPause(date) {
    const player = this.players.get(date)
    if (player) {
      player.playing = false
      if (this.currentPlayingDate === date) this.currentPlayingDate = null
      this.dispatchUpdate(date)
    }
  }
  
  clear() {
    for (let [date, player] of this.players.entries()) {
      player.audio.pause()
      player.audio.src = ''
    }
    this.players.clear()
    this.currentPlayingDate = null
  }
}

export const audioManager = new AudioManager()