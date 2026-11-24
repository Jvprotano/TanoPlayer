import { api, esc, icon, count, fold, modules, stats, nextLesson, playLabel, cover, progressLine, watchedButton, time } from './ui.js'
import { startPlayer, closePlayer, playerMarkup, changeWatched } from './player.js'

const content = document.querySelector('#page')
const search = document.querySelector('#search')
const editor = document.querySelector('#editor')
const confirmation = document.querySelector('#confirmation')
const toast = document.querySelector('#toast')
const shell = document.querySelector('.shell')
const sidebarToggle = document.querySelector('#sidebar-toggle')
const narrowWindow = matchMedia('(max-width: 900px)')
const sidebarKey = 'sidebar-display'
const pages = {
  home: ['Início', 'house'],
  catalog: ['Meu catálogo', 'layout-grid'],
  active: ['Em andamento', 'clock-3'],
  completed: ['Concluídos', 'circle-check']
}
let courses = []
let page = 'home'
let currentId
let selectedModule = 'all'
let lessonFilter = 'all'
let toastTimer
let draft
let confirmationAction
const watchedRequests = new Set()
let sidebarPreference = localStorage.getItem(sidebarKey)

document.querySelector('#search-icon').innerHTML = icon('search')
document.querySelector('#add-course').innerHTML = `${icon('plus')} <span>Adicionar curso</span>`

function updateSidebar() {
  const collapsed = sidebarPreference === 'collapsed' ||
    (sidebarPreference !== 'expanded' && narrowWindow.matches)
  const label = collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'
  shell.classList.toggle('is-sidebar-collapsed', collapsed)
  sidebarToggle.setAttribute('aria-expanded', String(!collapsed))
  sidebarToggle.setAttribute('aria-label', label)
  sidebarToggle.title = label
  sidebarToggle.innerHTML = icon(collapsed ? 'panel-left-open' : 'panel-left-close')
}

sidebarToggle.addEventListener('click', () => {
  sidebarPreference = shell.classList.contains('is-sidebar-collapsed') ? 'expanded' : 'collapsed'
  updateSidebar()
  localStorage.setItem(sidebarKey, sidebarPreference)
})
narrowWindow.addEventListener('change', updateSidebar)
updateSidebar()

function notify(message) {
  toast.textContent = message
  toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.hidden = true }, 4500)
}

const onError = error => notify(error.message)
const findCourse = id => courses.find(course => course.id === id)
const courseForLesson = id => courses.find(course => course.lessons.some(lesson => lesson.id === id))
const courseDetails = course => [course.author, course.year].filter(Boolean).join(' · ')
const lessonCount = number => count(number, 'aula', 'aulas')
const moduleCount = number => count(number, 'módulo', 'módulos')

function updateShell() {
  document.querySelector('#nav-items').innerHTML = Object.entries(pages).map(([key, [label, symbol]]) => {
    const active = key === page || (key === 'catalog' && ['detail', 'player'].includes(page))
    return `<button type="button" class="nav-button ${active ? 'selected' : ''}" data-page="${key}"
      ${active ? 'aria-current="page"' : ''} aria-label="${label}" title="${label}">${icon(symbol)}<span>${label}</span></button>`
  }).join('')
  document.querySelector('#local-indicator').innerHTML = `<div class="local-icon">${icon('hard-drive')}</div>
    <div><strong>Biblioteca local</strong><small>${count(courses.length, 'curso', 'cursos')} no catálogo</small></div>`
  const selected = page === 'detail' ? findCourse(currentId) : page === 'player' ? courseForLesson(currentId) : null
  document.querySelector('#breadcrumb').innerHTML = `
    <button type="button" data-page="${selected ? 'catalog' : 'home'}">${selected ? 'Meu catálogo' : 'Biblioteca'}</button>
    ${icon('chevron-right')}
    ${page === 'player' && selected
      ? `<button type="button" data-action="course" data-course="${esc(selected.id)}">${esc(selected.title)}</button>`
      : `<span>${esc(search.value.trim() ? 'Busca' : selected?.title || pages[page]?.[0])}</span>`}`
  document.querySelector('#search-wrap').hidden = page === 'player'
  document.querySelector('#add-course').hidden = page === 'player'
}

function navigate(next, id) {
  closePlayer()
  page = next
  currentId = id
  search.value = ''
  selectedModule = 'all'
  lessonFilter = 'all'
  render()
  content.scrollTop = 0
}

function courseAction(course) {
  const next = nextLesson(course)
  return next ? `<button type="button" class="button primary" data-action="play" data-lesson="${esc(next.id)}">${icon('play', 'fill-icon')} ${playLabel(course)}</button>` : ''
}

function hero(course, detail = false) {
  const groups = modules(course)
  return `<section class="hero ${detail ? 'detail-hero' : ''}">
    ${cover(course, 'hero-image')}
    <div class="hero-shade"></div>
    <div class="hero-content">
      <p class="hero-kind">${icon('graduation-cap')} ${detail ? 'Curso' : 'Em destaque'}</p>
      <h1>${esc(course.title)}</h1>
      <div class="hero-meta">${courseDetails(course) ? `<span>${esc(courseDetails(course))}</span><i></i>` : ''}
        <span>${moduleCount(groups.length)}</span><i></i><span>${lessonCount(course.lessons.length)}</span></div>
      ${course.description ? `<p class="hero-description">${esc(course.description)}</p>` : ''}
      <div class="hero-actions">
        ${courseAction(course)}
        ${detail
          ? `<button type="button" class="button secondary hero-secondary" data-action="edit-course" data-course="${esc(course.id)}">${icon('pencil')} Editar curso</button>`
          : `<button type="button" class="button secondary hero-secondary" data-action="course" data-course="${esc(course.id)}">${icon('list-video')} Ver aulas</button>`}
      </div>
      ${detail || stats(course).started ? progressLine(course, 'hero-progress') : ''}
    </div>
  </section>`
}

function courseCard(course) {
  const { started, completed, total, watched } = stats(course)
  const status = completed ? 'Concluído' : started ? 'Em andamento' : 'A iniciar'
  return `<button class="course-card" type="button" data-action="course" data-course="${esc(course.id)}">
    <div class="card-art">
      ${cover(course)}
      <span class="card-tag">${icon('list-video')}${lessonCount(total)}</span>
      <span class="card-open">${icon('arrow-up-right')}</span>
    </div>
    <div class="card-caption">
      <strong>${esc(course.title)}</strong>
      <div class="card-meta"><span>${esc(courseDetails(course) || moduleCount(modules(course).length))}</span><span class="course-state ${completed ? 'complete' : started ? 'started' : ''}">${status}</span></div>
      <progress value="${watched}" max="${Math.max(1, total)}" aria-label="${watched} de ${total} aulas assistidas"></progress>
    </div>
  </button>`
}

function addCard() {
  return `<button class="course-card add-card" type="button" data-action="add-course">
    <span class="add-card-icon">${icon('plus')}</span>
    <strong>Adicionar curso</strong>
    <span>Importe uma pasta ou selecione vídeos.</span>
  </button>`
}

function empty(title, message, symbol, add = false) {
  return `<div class="empty">
    <span class="empty-icon">${icon(symbol)}</span><h2>${title}</h2><p>${message}</p>
    ${add ? `<button class="button primary" data-action="add-course" type="button">${icon('plus')} Adicionar curso</button>` : ''}
  </div>`
}

function resumeCard(course) {
  const lesson = nextLesson(course)
  if (!lesson) return ''
  const remaining = lesson.progress.duration - lesson.progress.position
  return `<button type="button" class="resume-card" data-action="play" data-lesson="${esc(lesson.id)}">
    <div class="resume-art">${cover(course)}<span>${icon('play', 'fill-icon')}</span></div>
    <div class="resume-content"><small>${esc(course.title)}</small><strong>${esc(lesson.title)}</strong>
      <span>${lesson.progress.position && remaining > 0 ? `${time(remaining)} restantes` : 'Próxima aula'}</span>
      <progress value="${lesson.progress.position}" max="${lesson.progress.duration || 1}" aria-label="Progresso da aula"></progress>
    </div>
  </button>`
}

function home() {
  if (!courses.length) return `<div class="page-inner"><h1 class="page-title">Sua biblioteca</h1>${empty('Adicione seu primeiro curso', 'Escolha uma pasta ou os vídeos que deseja estudar.', 'graduation-cap', true)}</div>`
  const active = courses.filter(course => {
    const { started, completed } = stats(course)
    return started && !completed
  }).sort((a, b) => Math.max(...b.lessons.map(lesson => lesson.progress.updatedAt)) - Math.max(...a.lessons.map(lesson => lesson.progress.updatedAt)))
  const featured = active[0] || courses[0]
  return `<div class="page-inner home-page">
    ${hero(featured)}
    ${active.length ? `<section class="shelf"><div class="section-heading"><h2>Continuar assistindo</h2></div>
      <div class="resume-grid">${active.map(resumeCard).join('')}</div></section>` : ''}
    <section class="shelf">
      <div class="section-heading"><div><h2>Meu catálogo</h2><p>${count(courses.length, 'curso na biblioteca', 'cursos na biblioteca')}</p></div>
        <button type="button" class="text-button" data-page="catalog">Ver catálogo ${icon('arrow-right')}</button>
      </div>
      <div class="catalog-grid">${courses.slice(0, 5).map(courseCard).join('')}${addCard()}</div>
    </section>
  </div>`
}

function catalog() {
  const visible = page === 'catalog' ? courses : courses.filter(course => {
    const { started, completed } = stats(course)
    return page === 'completed' ? completed : started && !completed
  })
  const messages = {
    active: ['Nenhum curso em andamento', 'Os cursos iniciados aparecem aqui.'],
    completed: ['Nenhum curso concluído', 'Os cursos com todas as aulas assistidas aparecem aqui.']
  }
  return `<div class="page-inner">
    <div class="section-heading heading-top"><div><h1 class="page-title">${pages[page][0]}</h1><p>${count(visible.length, 'curso', 'cursos')}</p></div></div>
    ${visible.length || page === 'catalog'
      ? `<div class="catalog-grid">${visible.map(courseCard).join('')}${page === 'catalog' ? addCard() : ''}</div>`
      : empty(...messages[page], pages[page][1])}
  </div>`
}

function lessonRow(lesson, selected, options = {}) {
  const { compact = false, index, secondary = '' } = options
  const status = lesson.missing ? 'Arquivo indisponível' :
    lesson.progress.watched ? 'Assistida' : lesson.progress.position > 0 ? `Retomar em ${time(lesson.progress.position)}` : ''
  return `<li class="lesson-row ${selected ? 'current-lesson' : ''} ${compact ? 'compact' : ''}">
    <button type="button" class="lesson-play" data-action="play" data-lesson="${esc(lesson.id)}" ${selected ? 'aria-current="true"' : ''}>
      <span class="lesson-play-icon">${index ? `<span class="lesson-index">${String(index).padStart(2, '0')}</span>` : ''}${icon('play', 'fill-icon')}</span>
      <span class="lesson-label"><strong>${esc(lesson.title)}</strong>
        ${secondary || status ? `<small>${[secondary, status].filter(Boolean).map(esc).join(' · ')}</small>` : ''}</span>
      ${!compact && lesson.progress.duration ? `<small class="lesson-runtime">${time(lesson.progress.duration)}</small>` : ''}
    </button>
    ${watchedButton(lesson)}
    ${compact || !index ? '' : `<button type="button" class="icon-button remove-lesson" title="Remover aula do curso" aria-label="Remover aula do curso" data-action="remove-lesson" data-lesson="${esc(lesson.id)}">${icon('trash-2')}</button>`}
  </li>`
}

function details(course) {
  if (!course) return empty('Curso indisponível', 'Abra outro curso no catálogo.', 'graduation-cap')
  const groups = modules(course)
  const chosen = selectedModule === 'all' ? groups : groups.filter((_, index) => String(index) === selectedModule)
  const listed = group => group.lessons.filter(lesson => lessonFilter === 'all' || lesson.progress.watched === (lessonFilter === 'watched'))
  const display = chosen.filter(group => listed(group).length)
  return `<div class="page-inner detail-page">
    ${hero(course, true)}
    <section class="shelf">
      <div class="section-heading lesson-heading">
        <h2>Aulas do curso</h2>
        <div class="lesson-filters">
          <select id="module-filter" aria-label="Módulo">
            <option value="all">Todos os módulos</option>
            ${groups.map((group, index) => `<option value="${index}" ${String(index) === selectedModule ? 'selected' : ''}>${esc(group.name)}</option>`).join('')}
          </select>
          <select id="lesson-filter" aria-label="Status da aula">
            ${[['all', 'Todas as aulas'], ['pending', 'Pendentes'], ['watched', 'Assistidas']].map(([value, label]) =>
              `<option value="${value}" ${value === lessonFilter ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </div>
      </div>
      ${display.length ? display.map(group => `<section class="module">
        <h3>${esc(group.name)} <span>${lessonCount(listed(group).length)}</span></h3>
        <ul class="lesson-list">${listed(group).map(lesson => lessonRow(lesson, false, { index: group.lessons.indexOf(lesson) + 1 })).join('')}</ul>
      </section>`).join('') : empty('Nenhuma aula encontrada', 'Altere os filtros ou adicione vídeos em Editar curso.', 'list-video')}
    </section>
  </div>`
}

function playlist(course, id) {
  return `<div class="playlist-header"><h2>Aulas do curso</h2>${progressLine(course)}</div>
    <div class="playlist-scroll">
      ${modules(course).map(group => `<section class="playlist-module"><h3>${esc(group.name)}</h3>
        <ul class="lesson-list">${group.lessons.map(lesson => lessonRow(lesson, id === lesson.id, { compact: true })).join('')}</ul>
      </section>`).join('')}
    </div>`
}

function refreshPlayer(course, lesson) {
  if (page !== 'player' || currentId !== lesson.id) return
  const scroll = document.querySelector('.playlist-scroll')?.scrollTop
  document.querySelector('#current-watched').innerHTML = watchedButton(lesson, true)
  document.querySelector('#playlist').innerHTML = playlist(course, lesson.id)
  if (scroll !== undefined) document.querySelector('.playlist-scroll').scrollTop = scroll
}

function renderPlayer() {
  const course = courseForLesson(currentId)
  const index = course?.lessons.findIndex(lesson => lesson.id === currentId) ?? -1
  if (index < 0) {
    navigate('catalog')
    return
  }
  const lesson = course.lessons[index]
  content.innerHTML = `<div class="page-inner player-page">
    <button type="button" class="text-button back-button" data-action="course" data-course="${esc(course.id)}">${icon('arrow-left')} Voltar ao curso</button>
    <header class="player-heading"><p>${esc(lesson.module || course.title)}</p><h1>${esc(lesson.title)}</h1></header>
    <div class="player-grid">
      <div class="player-main">${playerMarkup(lesson, course.lessons[index - 1], course.lessons[index + 1])}</div>
      <aside id="playlist" class="playlist">${playlist(course, lesson.id)}</aside>
    </div>
  </div>`
  const scroll = content.querySelector('.playlist-scroll')
  const item = content.querySelector('.current-lesson')
  if (item && item.offsetTop + item.offsetHeight > scroll.clientHeight) {
    scroll.scrollTop = item.offsetTop - 40
  }
  startPlayer(content.querySelector('.player-stage'), lesson, { onWatched: () => refreshPlayer(course, lesson), onError }).catch(onError)
}

function results(query) {
  const words = fold(query).trim().split(/\s+/)
  const matches = text => words.every(word => fold(text).includes(word))
  const matchedCourses = courses.filter(course => matches(`${course.title} ${course.author}`))
  const matchedLessons = courses.flatMap(course => course.lessons
    .filter(lesson => matches(`${lesson.title} ${lesson.module}`)).map(lesson => ({ course, lesson })))
  return `<div class="page-inner search-page">
    <h1 class="page-title">Resultados da busca</h1>
    ${matchedCourses.length ? `<section class="shelf"><div class="section-heading"><h2>Cursos</h2></div>
      <div class="catalog-grid">${matchedCourses.map(courseCard).join('')}</div></section>` : ''}
    ${matchedLessons.length ? `<section class="shelf"><div class="section-heading"><h2>Aulas</h2><p>${lessonCount(matchedLessons.length)}</p></div>
      <ul class="lesson-list">${matchedLessons.map(({ course, lesson }) => lessonRow(lesson, false, { secondary: course.title })).join('')}</ul></section>` : ''}
    ${!matchedCourses.length && !matchedLessons.length ? empty('Nenhum resultado', 'Busque pelo nome de um curso, módulo ou aula.', 'search') : ''}
  </div>`
}

function render() {
  updateShell()
  const query = search.value.trim()
  if (page === 'player') renderPlayer()
  else if (query) content.innerHTML = results(query)
  else if (page === 'home') content.innerHTML = home()
  else if (page === 'detail') content.innerHTML = details(findCourse(currentId))
  else content.innerHTML = catalog()
}

function openEditor(course) {
  draft = { course, folder: null, files: new Map(), cover: null, removeCover: false }
  editor.innerHTML = `<form id="course-form">
    <div class="dialog-header"><div><h2 id="editor-title">${course ? 'Editar curso' : 'Adicionar curso'}</h2></div>
      <button class="icon-button" type="button" data-action="close-editor" aria-label="Fechar">${icon('x')}</button></div>
    <div class="dialog-content">
      <label class="field">Nome do curso<input name="title" required maxlength="160" autocomplete="off" value="${esc(course?.title)}" autofocus></label>
      <label class="field">Autor <span>opcional</span><input name="author" maxlength="120" autocomplete="off" value="${esc(course?.author)}"></label>
      <label class="field">Descrição <span>opcional</span><textarea name="description" maxlength="650" rows="2">${esc(course?.description)}</textarea></label>
      <div class="field">
        <span class="field-label">Vídeos do curso</span>
        <div class="source-options">
          <button class="button secondary" type="button" data-action="pick" data-kind="folder">${icon('folder-open')} ${course?.folder ? 'Trocar pasta' : 'Escolher pasta'}</button>
          <button class="button secondary" type="button" data-action="pick" data-kind="files">${icon('file-video')} Adicionar vídeos</button>
        </div>
        <div id="source-summary"></div>
        ${course?.folder ? `<label class="checkbox"><input type="checkbox" name="refresh"> Buscar vídeos novos na pasta</label>` : ''}
      </div>
      <div class="field">
        <span class="field-label">Capa <span>opcional</span></span>
        <div class="cover-options" id="cover-options"></div>
      </div>
      <p id="form-error" role="alert" hidden></p>
    </div>
    <div class="dialog-footer">
      ${course ? `<button class="button danger-quiet" type="button" data-action="remove-course" data-course="${esc(course.id)}">${icon('trash-2')} <span>Remover curso</span></button>` : '<span></span>'}
      <div><button class="button secondary" type="button" data-action="close-editor">Cancelar</button>
      <button class="button primary" type="submit">${course ? 'Salvar curso' : 'Importar curso'}</button></div>
    </div>
  </form>`
  updateEditor()
  editor.showModal()
}

function updateEditor() {
  const folder = draft.folder || draft.course?.folder
  const files = [...draft.files.values()]
  editor.querySelector('#source-summary').innerHTML = `
    ${folder ? `<p class="source-path" title="${esc(folder)}">${icon('folder')} <span>${esc(folder)}</span></p>` : ''}
    ${files.length ? `<details class="file-selection"><summary>${count(files.length, 'vídeo selecionado', 'vídeos selecionados')}</summary>
      <ul>${files.map(file => `<li><span>${esc(file.title)}</span><button class="icon-button" type="button" data-action="unpick" data-file="${esc(file.filename)}" aria-label="Remover da seleção">${icon('x')}</button></li>`).join('')}</ul></details>` : ''}`
  const coverName = draft.cover?.split(/[\\/]/).at(-1)
  const currentCover = draft.course?.cover && !draft.removeCover
  editor.querySelector('#cover-options').innerHTML = `
    ${currentCover && !coverName ? cover(draft.course, 'editor-cover') : ''}
    <button class="button secondary" type="button" data-action="pick" data-kind="cover">${icon('image')}
      ${currentCover || coverName ? 'Trocar imagem' : 'Escolher imagem'}</button>
    ${coverName ? `<span class="cover-filename" title="${esc(coverName)}">${esc(coverName)}</span>` : ''}
    ${currentCover || coverName ? `<button class="icon-button" type="button" data-action="clear-cover" title="Remover capa" aria-label="Remover capa">${icon('x')}</button>` : ''}`
}

async function pickSource(kind) {
  const owner = draft
  const value = await api.pick(kind)
  if (draft !== owner || !editor.open || !value) return
  const nameField = editor.querySelector('[name="title"]')
  if (kind === 'folder') {
    draft.folder = value.filename
    if (!nameField.value.trim()) nameField.value = value.title
  } else if (kind === 'files') {
    for (const file of value) draft.files.set(file.filename, file)
    if (value.length === 1 && !nameField.value.trim()) nameField.value = value[0].title
  } else {
    draft.cover = value
    draft.removeCover = false
  }
  updateEditor()
}

editor.addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.target
  const submit = form.querySelector('[type="submit"]')
  if (submit.disabled) return
  const errorMessage = form.querySelector('#form-error')
  const values = new FormData(form)
  const label = submit.textContent
  editor.dataset.saving = 'true'
  const controls = [...form.querySelectorAll('button, input, textarea')]
  controls.forEach(control => { control.disabled = true })
  submit.textContent = 'Salvando…'
  errorMessage.hidden = true
  try {
    const result = await api.saveCourse({
      id: draft.course?.id,
      title: values.get('title'),
      author: values.get('author'),
      description: values.get('description'),
      folder: draft.folder,
      files: [...draft.files.keys()],
      refresh: values.has('refresh'),
      cover: draft.cover,
      removeCover: draft.removeCover
    })
    courses = result.courses
    editor.close()
    navigate('detail', result.id)
    notify(draft.course ? 'Curso atualizado.' : 'Curso adicionado ao catálogo.')
  } catch (error) {
    errorMessage.textContent = error.message
    errorMessage.hidden = false
  } finally {
    delete editor.dataset.saving
    controls.forEach(control => { control.disabled = false })
    submit.textContent = label
  }
})

editor.addEventListener('cancel', event => {
  if (editor.dataset.saving) event.preventDefault()
})

function askRemove(title, message, action) {
  confirmationAction = action
  confirmation.innerHTML = `<div class="dialog-header"><h2 id="confirm-title">${title}</h2></div>
    <div class="dialog-content"><p>${message}</p></div>
    <div class="dialog-footer"><span></span><div>
      <button class="button secondary" type="button" data-action="cancel-remove" autofocus>Cancelar</button>
      <button class="button primary" type="button" data-action="confirm-remove">Remover</button>
    </div></div>`
  confirmation.showModal()
}

const actions = {
  'add-course': () => openEditor(),
  'edit-course': data => openEditor(findCourse(data.course)),
  course: data => navigate('detail', data.course),
  play: data => {
    if (page !== 'player' || currentId !== data.lesson) navigate('player', data.lesson)
  },
  watched: async (data, button) => {
    if (watchedRequests.has(data.lesson)) return
    const course = courseForLesson(data.lesson)
    const lesson = course?.lessons.find(item => item.id === data.lesson)
    if (!lesson) return
    watchedRequests.add(lesson.id)
    const fromPlaylist = Boolean(button.closest('#playlist'))
    button.disabled = true
    try {
      await changeWatched(lesson)
      if (page === 'player') {
        const currentLesson = course.lessons.find(item => item.id === currentId)
        if (currentLesson) refreshPlayer(course, currentLesson)
      } else render()
      const scope = fromPlaylist ? content.querySelector('#playlist') || content : content
      const replacement = [...scope.querySelectorAll('.watch-button')].find(item => item.dataset.lesson === lesson.id)
      if (replacement) replacement.focus({ preventScroll: true })
    } finally {
      watchedRequests.delete(lesson.id)
      button.disabled = false
    }
  },
  pick: data => pickSource(data.kind),
  unpick: data => { draft.files.delete(data.file); updateEditor() },
  'clear-cover': () => { draft.cover = null; draft.removeCover = true; updateEditor() },
  'close-editor': () => editor.close(),
  'remove-course': data => askRemove('Remover curso?', 'O curso e seu progresso serão removidos do catálogo. Os vídeos originais continuam na pasta.', async () => {
    courses = await api.removeCourse(data.course)
    if (editor.open) editor.close()
    navigate('catalog')
    notify('Curso removido.')
  }),
  'remove-lesson': data => askRemove('Remover aula?', 'A aula será removida deste curso. O vídeo original continua na pasta.', async () => {
    courses = await api.removeLesson(data.lesson)
    render()
    notify('Aula removida.')
  }),
  'cancel-remove': () => confirmation.close(),
  'confirm-remove': async (_, button) => {
    button.disabled = true
    try {
      await confirmationAction()
      confirmation.close()
    } finally {
      button.disabled = false
    }
  }
}

document.addEventListener('click', event => {
  const button = event.target.closest('button')
  if (button?.dataset.page) navigate(button.dataset.page)
  const action = button?.dataset.action
  if (!action || !Object.hasOwn(actions, action)) return
  Promise.resolve().then(() => actions[action](button.dataset, button)).catch(onError)
})

content.addEventListener('change', event => {
  if (event.target.id === 'module-filter') selectedModule = event.target.value
  else if (event.target.id === 'lesson-filter') lessonFilter = event.target.value
  else return
  const id = event.target.id
  render()
  document.getElementById(id).focus({ preventScroll: true })
})

search.addEventListener('input', () => {
  if (page !== 'player') {
    render()
    content.scrollTop = 0
  }
})
document.addEventListener('keydown', event => {
  if (document.querySelector('dialog[open]')) return
  if (event.key.toLowerCase() === 'k' && event.ctrlKey && page !== 'player') {
    event.preventDefault()
    search.focus()
  }
  if (event.key === 'Escape' && search.value && page !== 'player') {
    search.value = ''
    render()
  }
})

api.catalog().then(saved => { courses = saved; render() }).catch(onError)
