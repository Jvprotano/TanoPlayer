const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const formats = new Map([
  ['.mp4', 'video/mp4'], ['.m4v', 'video/mp4'], ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'], ['.mkv', 'video/x-matroska'], ['.ogv', 'video/ogg'],
  ['.avi', 'video/x-msvideo'], ['.wmv', 'video/x-ms-wmv'], ['.mpg', 'video/mpeg'],
  ['.mpeg', 'video/mpeg'], ['.ts', 'video/mp2t'],
  ['.jpeg', 'image/jpeg'], ['.jpg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.avif', 'image/avif'], ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp']
])

const extensions = type => [...formats].filter(([, mime]) => mime.startsWith(type)).map(([ext]) => ext.slice(1))
const isVideo = filename => formats.get(path.extname(filename).toLowerCase())?.startsWith('video/')
const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })
const sortNames = (a, b) => collator.compare(a.name, b.name)
const titleOf = filename => path.parse(filename).name.replace(/^\d+[ ._-]+(?=\D)/, '').trim() || path.parse(filename).name
const fileKey = filename => process.platform === 'win32' ? filename.toLowerCase() : filename
const freshProgress = () => ({ position: 0, duration: 0, watched: false, ranges: [], updatedAt: 0 })

async function scanFolder(folder) {
  const files = []
  async function visit(directory, moduleName) {
    const entries = (await fs.promises.readdir(directory, { withFileTypes: true })).sort(sortNames)
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const filename = path.join(directory, entry.name)
      if (entry.isFile() && isVideo(filename)) {
        files.push({ filename, module: moduleName, relative: path.relative(folder, filename) })
      }
      if (entry.isDirectory()) {
        await visit(filename, moduleName || titleOf(entry.name))
      }
    }
  }
  await visit(folder, '')
  return files
}

function newLesson(file) {
  return {
    id: randomUUID(),
    ...file,
    title: titleOf(file.filename),
    progress: freshProgress()
  }
}

function mergeRanges(ranges, newRanges, duration) {
  const sorted = [...ranges, ...newRanges]
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && start < duration)
    .map(([start, end]) => [start, Math.min(duration, end)])
    .sort((a, b) => a[0] - b[0])
  const merged = []
  for (const range of sorted) {
    const last = merged.at(-1)
    if (last && range[0] <= last[1] + 0.02) last[1] = Math.max(last[1], range[1])
    else merged.push(range)
  }
  return merged
}

class Library {
  constructor(directory) {
    this.directory = directory
    this.filename = path.join(directory, 'library.json')
    this.courses = []
    fs.mkdirSync(directory, { recursive: true })
    try {
      const saved = JSON.parse(fs.readFileSync(this.filename, 'utf8'))
      if (saved.version !== 1 || !Array.isArray(saved.courses)) throw new Error('Formato de biblioteca desconhecido.')
      this.courses = saved.courses
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }

  persist(courses = this.courses) {
    const temporary = this.filename + '.tmp'
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, courses }), { flush: true })
    fs.renameSync(temporary, this.filename)
    this.courses = courses
  }

  snapshot() {
    return this.courses.map(({ excluded, ...course }) => ({
      ...course,
      cover: course.cover === 'sample' ? './assets/estudo-financeiro.webp' :
        course.cover ? `tano-media://cover/${course.id}/${encodeURIComponent(course.cover)}` : null,
      lessons: course.lessons.map(({ filename, relative, progress, ...lesson }) => ({
        ...lesson,
        filename,
        progress: this.publicProgress(progress)
      }))
    }))
  }

  publicProgress({ ranges, ...progress }) {
    return progress
  }

  findCourse(id) {
    return this.courses.find(course => course.id === id)
  }

  findLesson(id) {
    for (const course of this.courses) {
      const lesson = course.lessons.find(item => item.id === id)
      if (lesson) return lesson
    }
  }

  async saveCourse(input) {
    const title = String(input.title || '').trim().slice(0, 160)
    if (!title) throw new Error('Informe o nome do curso.')
    const previous = input.id ? this.findCourse(input.id) : null
    if (input.id && !previous) throw new Error('Curso indisponível.')
    const folder = input.folder || previous?.folder || null
    const scan = folder && (input.folder || input.refresh)
    let scanned = null
    if (scan) {
      try {
        scanned = await scanFolder(folder)
      } catch {
        throw new Error('Não foi possível ler a pasta. Verifique se a unidade está conectada e tente novamente.')
      }
      if (!scanned.length && input.folder) throw new Error('Nenhum vídeo encontrado na pasta escolhida.')
    }
    const id = previous?.id || randomUUID()
    let cover = input.removeCover ? null : (previous?.cover || null)
    if (input.cover) {
      const extension = path.extname(input.cover).toLowerCase()
      if (!formats.get(extension)?.startsWith('image/')) throw new Error('Selecione um arquivo de imagem compatível.')
      const stat = await fs.promises.stat(input.cover)
      if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw new Error('Escolha uma imagem de até 25 MB.')
      cover = randomUUID() + extension
      await fs.promises.copyFile(input.cover, path.join(this.directory, cover))
    }
    // Read the live course after filesystem operations so saves can overlap playback updates.
    const current = this.findCourse(id)
    const existing = current?.lessons || []
    const excluded = new Set(current?.excluded || [])
    const imported = scanned ? scanned.filter(file => !excluded.has(fileKey(file.relative))) : null
    const matchByRelative = new Map(existing.filter(item => item.relative).map(item => [fileKey(item.relative), item]))
    const entries = imported ? imported.map(file => {
      const old = matchByRelative.get(fileKey(file.relative)) || existing.find(item => fileKey(item.filename) === fileKey(file.filename))
      return old ? { ...old, ...file, missing: false } : newLesson(file)
    }) : [...existing]

    if (imported) {
      const retained = new Set(entries.map(item => item.id))
      for (const item of existing) {
        if (retained.has(item.id)) continue
        entries.push(item.relative ? { ...item, filename: path.join(folder, item.relative), missing: true } : item)
      }
      entries.sort((a, b) => collator.compare(a.relative || '\uffff', b.relative || '\uffff'))
    }
    const present = new Set(entries.map(item => fileKey(item.filename)))
    for (const filename of input.files || []) {
      const key = fileKey(filename)
      if (!isVideo(filename) || present.has(key)) continue
      entries.push(newLesson({ filename, relative: null, module: 'Aulas avulsas' }))
      present.add(key)
    }
    if (!entries.length && !previous) throw new Error('Escolha uma pasta com vídeos ou adicione arquivos de vídeo.')
    const course = {
      id, title, folder, cover, lessons: entries, excluded: [...excluded],
      author: String(input.author || '').trim().slice(0, 120),
      year: previous?.year || '',
      description: String(input.description || '').trim().slice(0, 650)
    }
    try {
      this.persist(current ? this.courses.map(item => item.id === id ? course : item) : [...this.courses, course])
    } catch (error) {
      if (input.cover) this.removeCover(cover)
      throw error
    }
    if (current?.cover && current.cover !== cover) this.removeCover(current.cover)
    return id
  }

  removeCover(cover) {
    if (cover && cover !== 'sample') {
      fs.promises.unlink(path.join(this.directory, cover)).catch(error => console.error(error))
    }
  }

  removeCourse(id) {
    const course = this.findCourse(id)
    if (!course) return
    this.persist(this.courses.filter(item => item.id !== id))
    this.removeCover(course.cover)
  }

  removeLesson(id) {
    const course = this.courses.find(item => item.lessons.some(lesson => lesson.id === id))
    if (!course) return
    const lesson = course.lessons.find(item => item.id === id)
    const revised = {
      ...course,
      lessons: course.lessons.filter(item => item.id !== id),
      excluded: lesson.relative ? [...course.excluded, fileKey(lesson.relative)] : course.excluded
    }
    this.persist(this.courses.map(item => item.id === course.id ? revised : item))
  }

  updateProgress(id, change) {
    const course = this.courses.find(item => item.lessons.some(lesson => lesson.id === id))
    if (!course) return null
    const lesson = course.lessons.find(item => item.id === id)
    const before = lesson.progress
    let progress
    if (typeof change.watched === 'boolean') {
      progress = change.watched ? { ...before, watched: true, updatedAt: Date.now() } : { ...freshProgress(), duration: before.duration }
    } else {
      const { position, duration, ranges } = change
      if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position < 0) {
        return this.publicProgress(before)
      }
      const coverage = mergeRanges(before.ranges, ranges, duration)
      const seconds = coverage.reduce((total, [start, end]) => total + end - start, 0)
      progress = { position: Math.min(position, duration), duration, ranges: coverage,
        watched: before.watched || seconds >= duration * 0.9, updatedAt: Date.now() }
    }
    const revised = { ...course, lessons: course.lessons.map(item => item === lesson ? { ...item, progress } : item) }
    this.persist(this.courses.map(item => item === course ? revised : item))
    return this.publicProgress(progress)
  }
}

module.exports = { Library, formats, extensions, titleOf }
