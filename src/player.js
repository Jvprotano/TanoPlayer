import { api, esc, icon, time, watchedButton } from './ui.js'

let current

function capture(state) {
  const { video } = state
  if (!state.hasPlayed || video.seeking || !Number.isFinite(video.duration) || !video.played.length) return null
  const ranges = Array.from({ length: video.played.length }, (_, index) => [video.played.start(index), video.played.end(index)])
  return { position: video.currentTime, duration: video.duration, ranges }
}

function applyProgress(state, progress) {
  if (!progress) return
  const wasWatched = state.lesson.progress.watched
  state.lesson.progress = progress
  if (current === state && wasWatched !== progress.watched) state.onWatched()
}

function persist(state) {
  if (state.resetting) return
  const data = capture(state)
  if (!data) return
  state.lastSave = performance.now()
  state.pending = api.saveProgress(state.lesson.id, data)
    .then(progress => { if (current === state) applyProgress(state, progress) })
    .catch(state.onError)
}

export function closePlayer() {
  const state = current
  if (!state) return
  current = null
  const data = !state.resetting && capture(state)
  if (data) applyProgress(state, api.flushProgress(state.lesson.id, data))
  state.events.abort()
  state.video.pause()
  state.video.removeAttribute('src')
  state.video.load()
}

window.addEventListener('beforeunload', () => {
  if (!current) return
  const data = !current.resetting && capture(current)
  if (data) api.flushProgress(current.lesson.id, data)
})

function controlsMarkup() {
  return `<div class="player-controls">
    <input class="seek" type="range" aria-label="Posição do vídeo" min="0" max="1" step="0.01" value="0">
    <div class="control-row">
      <button class="icon-button" data-player="play" type="button" aria-label="Pausar" title="Reproduzir ou pausar">${icon('pause')}</button>
      <button class="icon-button time-button" data-player="back" type="button" title="Voltar 10 segundos" aria-label="Voltar 10 segundos">${icon('rotate-ccw')}<span>10</span></button>
      <button class="icon-button time-button" data-player="forward" type="button" title="Avançar 10 segundos" aria-label="Avançar 10 segundos">${icon('rotate-cw')}<span>10</span></button>
      <span class="video-time">0:00 / 0:00</span>
      <div class="control-spacer"></div>
      <button class="icon-button" data-player="mute" type="button" aria-label="Silenciar" title="Silenciar ou ativar som">${icon('volume-2')}</button>
      <input class="volume" type="range" aria-label="Volume" min="0" max="1" step="0.01" value="1">
      <select class="rate" aria-label="Velocidade do vídeo">
        ${[0.75, 1, 1.25, 1.5, 1.75, 2].map(rate => `<option value="${rate}">${String(rate).replace('.', ',')}×</option>`).join('')}
      </select>
      <button class="icon-button" data-player="fullscreen" type="button" aria-label="Tela cheia" title="Tela cheia">${icon('maximize')}</button>
    </div>
  </div>`
}

export function playerMarkup(lesson, prev, next) {
  return `<div class="player-stage">
    <video playsinline preload="metadata" aria-label="${esc(lesson.title)}"></video>
    <button class="big-play" data-player="play" type="button" aria-label="Reproduzir">${icon('play')}</button>
    <div class="player-error" hidden></div>
    ${controlsMarkup()}
  </div>
  <div class="lesson-tools">
    <div id="current-watched">${watchedButton(lesson, true)}</div>
    <div class="lesson-nav">
      ${prev ? `<button type="button" class="button secondary" data-action="play" data-lesson="${esc(prev.id)}">${icon('chevron-left')} Anterior</button>` : ''}
      ${next ? `<button type="button" class="button secondary" data-action="play" data-lesson="${esc(next.id)}">Próxima aula ${icon('chevron-right')}</button>` : ''}
    </div>
  </div>`
}

const preferences = { rate: 1, volume: 1, muted: false }

function paintRange(slider) {
  const percent = 100 * Number(slider.value) / Number(slider.max)
  slider.style.setProperty('--filled', `${percent}%`)
}

export async function startPlayer(stage, lesson, { onWatched, onError }) {
  const video = stage.querySelector('video')
  const seek = stage.querySelector('.seek')
  const volume = stage.querySelector('.volume')
  const rate = stage.querySelector('.rate')
  const timestamp = stage.querySelector('.video-time')
  const bigPlay = stage.querySelector('.big-play')
  const play = stage.querySelector('.control-row [data-player="play"]')
  const mute = stage.querySelector('[data-player="mute"]')
  const fullscreen = stage.querySelector('[data-player="fullscreen"]')
  const errorBox = stage.querySelector('.player-error')
  const events = new AbortController()
  const state = { lesson, video, hasPlayed: false, lastSave: performance.now(), events,
    onWatched, onError, resume: lesson.progress.watched ? 0 : lesson.progress.position, pending: Promise.resolve() }
  current = state
  const listen = (element, event, callback) => element.addEventListener(event, callback, { signal: events.signal })
  const updateTime = () => {
    seek.value = video.currentTime
    paintRange(seek)
    timestamp.textContent = `${time(video.currentTime)} / ${time(video.duration)}`
  }
  const updateButtons = () => {
    play.innerHTML = icon(video.paused ? 'play' : 'pause')
    play.setAttribute('aria-label', video.paused ? 'Reproduzir' : 'Pausar')
    bigPlay.hidden = !video.paused || !errorBox.hidden
    mute.innerHTML = icon(video.muted || video.volume === 0 ? 'volume-x' : 'volume-2')
    mute.setAttribute('aria-label', video.muted ? 'Ativar som' : 'Silenciar')
  }
  const showError = message => {
    errorBox.innerHTML = `${icon('circle-alert')}<p>${esc(message)}</p>
      <button type="button" class="button secondary" data-player="retry">${icon('rotate-cw')} Tentar novamente</button>
      <button type="button" class="button secondary" data-player="external">${icon('external-link')} Abrir no Windows</button>`
    errorBox.hidden = false
    updateButtons()
  }
  const load = async () => {
    errorBox.hidden = true
    updateButtons()
    try {
      const source = await api.source(lesson.id)
      if (current !== state) return
      video.src = source
    } catch (error) {
      if (current === state) showError(error.message)
    }
  }
  const toggle = () => {
    if (!errorBox.hidden) return
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  }
  const jump = offset => {
    if (Number.isFinite(video.duration)) video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + offset))
  }
  const toggleFull = () => {
    const result = document.fullscreenElement ? document.exitFullscreen() : stage.requestFullscreen()
    result.catch(onError)
  }
  const action = {
    play: toggle, back: () => jump(-10), forward: () => jump(10),
    mute: () => { video.muted = !video.muted },
    fullscreen: toggleFull, retry: load, external: () => api.openExternal(lesson.id).catch(onError)
  }
  listen(stage, 'click', event => {
    const button = event.target.closest('[data-player]')
    if (button) action[button.dataset.player]()
  })
  listen(document, 'fullscreenchange', () => {
    fullscreen.innerHTML = icon(document.fullscreenElement ? 'minimize' : 'maximize')
    fullscreen.setAttribute('aria-label', document.fullscreenElement ? 'Sair da tela cheia' : 'Tela cheia')
  })
  listen(document, 'keydown', event => {
    if (event.target.closest('button, input, select, textarea, dialog') || document.querySelector('dialog[open]') ||
        event.ctrlKey || event.altKey || event.metaKey || !errorBox.hidden) return
    const shortcuts = { ' ': toggle, k: toggle, ArrowLeft: action.back, ArrowRight: action.forward, f: toggleFull, m: action.mute }
    if (!Object.hasOwn(shortcuts, event.key)) return
    event.preventDefault()
    shortcuts[event.key]()
  })
  listen(video, 'click', toggle)
  listen(video, 'loadedmetadata', () => {
    seek.max = Number.isFinite(video.duration) ? video.duration : 1
    if (state.resume > 0 && state.resume < video.duration - 0.3) video.currentTime = state.resume
    updateTime()
    if (state.autoplay !== false) video.play().catch(updateButtons)
  })
  listen(video, 'playing', () => { state.hasPlayed = true; updateButtons() })
  listen(video, 'pause', () => { updateButtons(); if (!state.resetting) persist(state) })
  listen(video, 'ended', () => { updateButtons(); persist(state) })
  listen(video, 'error', () => showError('Não foi possível reproduzir este vídeo. O arquivo pode estar indisponível ou usar um formato incompatível.'))
  listen(video, 'timeupdate', () => {
    updateTime()
    if (!video.paused && performance.now() - state.lastSave >= 4000) persist(state)
  })
  listen(video, 'seeked', updateTime)
  listen(video, 'volumechange', () => {
    preferences.muted = video.muted
    preferences.volume = video.volume
    volume.value = video.muted ? 0 : video.volume
    paintRange(volume)
    updateButtons()
  })
  listen(seek, 'input', () => {
    paintRange(seek)
    if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value)
  })
  listen(volume, 'input', () => { video.volume = Number(volume.value); video.muted = false })
  listen(rate, 'change', () => { preferences.rate = Number(rate.value); video.playbackRate = preferences.rate })
  video.volume = preferences.volume
  video.muted = preferences.muted
  video.defaultPlaybackRate = preferences.rate
  video.playbackRate = preferences.rate
  rate.value = preferences.rate
  volume.value = video.muted ? 0 : video.volume
  paintRange(volume)
  updateButtons()
  await load()
}

export async function changeWatched(lesson) {
  const state = current?.lesson === lesson ? current : null
  if (state) {
    state.resetting = true
    await state.pending
  }
  const watched = !lesson.progress.watched
  try {
    lesson.progress = await api.setWatched(lesson.id, watched)
    if (state && !watched) {
      // Reloading clears Chromium's played ranges so unmarking starts a new coverage record.
      state.resume = 0
      state.hasPlayed = false
      state.autoplay = false
      state.video.load()
    }
    if (state && watched) state.autoplay = true
  } finally {
    if (state) state.resetting = false
  }
}
