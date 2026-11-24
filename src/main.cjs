const { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { Readable } = require('node:stream')
const { pathToFileURL } = require('node:url')
const { Library, formats, extensions, titleOf } = require('./library.cjs')

const selected = { folder: new Set(), files: new Set(), cover: new Set() }
let library
let window
let editing = false

protocol.registerSchemesAsPrivileged([
  { scheme: 'tano-app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  { scheme: 'tano-media', privileges: { standard: true, secure: true, stream: true } }
])

const appFiles = new Set([
  '/index.html', '/style.css', '/app.js', '/ui.js', '/player.js',
  '/assets/icons.svg', '/assets/estudo-financeiro.webp'
])

function assetResponse(request) {
  const { hostname, pathname } = new URL(request.url)
  if (hostname !== 'app' || !appFiles.has(pathname)) return new Response(null, { status: 404 })
  return net.fetch(pathToFileURL(path.join(__dirname, pathname.slice(1))).href)
}

function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 760,
    minHeight: 570,
    backgroundColor: '#101013',
    title: 'TanoPlayer',
    icon: path.join(__dirname, 'assets', 'tanoplayer.ico'),
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#101013', symbolColor: '#a0a0a9', height: 32 },
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), sandbox: true, contextIsolation: true }
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.once('ready-to-show', () => window.show())
  window.on('closed', () => { window = null })
  window.loadURL('tano-app://app/index.html')
}

async function mediaResponse(request) {
  const { hostname, pathname } = new URL(request.url)
  const id = pathname.split('/')[1]
  let filename
  if (hostname === 'lesson') filename = library.findLesson(id)?.filename
  if (hostname === 'cover') {
    const course = library.findCourse(id)
    if (course?.cover && course.cover !== 'sample' && pathname === `/${id}/${course.cover}`) {
      filename = path.join(library.directory, course.cover)
    }
  }
  if (!filename) return new Response(null, { status: 404 })
  const stat = await fs.promises.stat(filename).catch(() => null)
  if (!stat?.isFile()) return new Response(null, { status: 404 })
  const headers = {
    'Content-Type': formats.get(path.extname(filename).toLowerCase()) || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  }
  const size = stat.size
  const range = request.headers.get('range')
  let start = 0
  let end = size - 1
  let status = 200
  if (range) {
    const bounds = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (bounds?.[1]) {
      start = Number(bounds[1])
      if (bounds[2]) end = Math.min(end, Number(bounds[2]))
    } else if (bounds?.[2]) {
      start = Math.max(0, size - Number(bounds[2]))
    }
    if (!bounds || (!bounds[1] && !bounds[2]) || start >= size || end < start) {
      return new Response(null, { status: 416, headers: { ...headers, 'Content-Range': `bytes */${size}` } })
    }
    status = 206
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`
  }
  headers['Content-Length'] = String(end - start + 1)
  const body = request.method === 'HEAD' || !size ? null : Readable.toWeb(fs.createReadStream(filename, { start, end }))
  return new Response(body, { headers, status })
}

function authorized(event) {
  return event.sender === window?.webContents && event.senderFrame === event.sender.mainFrame
}

function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!authorized(event)) return { error: 'Ação indisponível.' }
    try {
      return { value: await callback(...args) }
    } catch (error) {
      console.error(error)
      return { error: error.message }
    }
  })
}

async function pick(kind) {
  const options = {
    folder: { title: 'Escolher pasta do curso', properties: ['openDirectory'] },
    files: { title: 'Adicionar vídeos', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Vídeos', extensions: extensions('video/') }] },
    cover: { title: 'Escolher capa do curso', properties: ['openFile'], filters: [{ name: 'Imagens', extensions: extensions('image/') }] }
  }
  if (!Object.hasOwn(options, kind)) throw new Error('Seleção indisponível.')
  const { filePaths } = await dialog.showOpenDialog(window, options[kind])
  for (const filename of filePaths) selected[kind].add(filename)
  if (kind === 'files') return filePaths.map(filename => ({ filename, title: titleOf(filename) }))
  if (!filePaths[0]) return null
  return kind === 'folder' ? { filename: filePaths[0], title: path.basename(filePaths[0]) } : filePaths[0]
}

async function requireVideo(id) {
  const lesson = library.findLesson(id)
  if (!lesson) throw new Error('Aula indisponível.')
  const stat = await fs.promises.stat(lesson.filename).catch(() => null)
  if (!stat?.isFile()) throw new Error('Vídeo não encontrado. Conecte a unidade original ou atualize a pasta do curso.')
  return lesson
}

function registerActions() {
  handle('catalog', () => library.snapshot())
  handle('pick', pick)
  handle('course:save', async input => {
    if (editing) throw new Error('Aguarde a importação atual.')
    if ((input.folder && !selected.folder.has(input.folder)) ||
        (input.cover && !selected.cover.has(input.cover)) ||
        !Array.isArray(input.files) || input.files.some(filename => !selected.files.has(filename))) {
      throw new Error('Selecione os arquivos pelo aplicativo.')
    }
    editing = true
    try {
      const id = await library.saveCourse(input)
      return { id, courses: library.snapshot() }
    } finally {
      editing = false
    }
  })
  handle('course:remove', async id => {
    if (editing) throw new Error('Aguarde a importação atual.')
    library.removeCourse(id)
    return library.snapshot()
  })
  handle('lesson:remove', id => {
    if (editing) throw new Error('Aguarde a importação atual.')
    library.removeLesson(id)
    return library.snapshot()
  })
  handle('lesson:source', async id => {
    await requireVideo(id)
    return `tano-media://lesson/${id}`
  })
  handle('lesson:external', async id => {
    const lesson = await requireVideo(id)
    const error = await shell.openPath(lesson.filename)
    if (error) throw new Error('Não foi possível abrir o vídeo no player do Windows.')
  })
  handle('lesson:watched', (id, watched) => library.updateProgress(id, { watched: Boolean(watched) }))
  handle('lesson:progress', (id, progress) => library.updateProgress(id, progress))
  ipcMain.on('lesson:flush', (event, id, progress) => {
    let saved = null
    try {
      if (authorized(event)) saved = library.updateProgress(id, progress)
    } catch (error) {
      console.error(error)
    }
    event.returnValue = saved
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.whenReady().then(() => {
    library = new Library(app.getPath('userData'))
    protocol.handle('tano-app', assetResponse)
    protocol.handle('tano-media', mediaResponse)
    registerActions()
    createWindow()
  }).catch(error => {
    dialog.showErrorBox('TanoPlayer', `Não foi possível abrir a biblioteca.\n\n${error.message}`)
    app.quit()
  })
  app.on('window-all-closed', () => app.quit())
}
