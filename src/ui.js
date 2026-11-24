export const api = window.tano

const sanitize = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = value => String(value ?? '').replace(/[&<>"']/g, character => sanitize[character])
export const icon = (name, className = '') =>
  `<svg class="icon ${className}" aria-hidden="true"><use href="./assets/icons.svg#${name}"></use></svg>`

export const fold = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
export const count = (number, one, many) => `${number} ${number === 1 ? one : many}`
export const time = seconds => {
  const rounded = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor(rounded / 60) % 60
  const tail = String(rounded % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${tail}` : `${minutes}:${tail}`
}

export function modules(course) {
  const groups = new Map()
  for (const lesson of course.lessons) {
    const name = lesson.module || 'Aulas'
    if (!groups.has(name)) groups.set(name, [])
    groups.get(name).push(lesson)
  }
  return [...groups].map(([name, lessons]) => ({ name, lessons }))
}

export function stats(course) {
  const total = course.lessons.length
  const watched = course.lessons.filter(lesson => lesson.progress.watched).length
  const started = watched > 0 || course.lessons.some(lesson => lesson.progress.position > 0)
  return { total, watched, started, completed: total > 0 && watched === total }
}

export function nextLesson(course) {
  const pending = course.lessons.filter(lesson => !lesson.progress.watched)
  const available = pending.filter(lesson => !lesson.missing)
  const resume = available.filter(lesson => lesson.progress.position > 0)
    .sort((a, b) => b.progress.updatedAt - a.progress.updatedAt)[0]
  return resume || available[0] || pending[0] || course.lessons.find(lesson => !lesson.missing) || course.lessons[0]
}

export function playLabel(course) {
  const { started, completed } = stats(course)
  return completed ? 'Rever curso' : started ? 'Continuar curso' : 'Começar curso'
}

export function cover(course, className = '') {
  return course.cover
    ? `<img class="cover ${className}" src="${esc(course.cover)}" alt="">`
    : `<div class="cover cover-fallback ${className}" aria-hidden="true">${icon('graduation-cap')}</div>`
}

export function progressLine(course, className = '') {
  const { watched, total } = stats(course)
  return `<div class="course-progress ${className}">
    <progress value="${watched}" max="${Math.max(1, total)}" aria-label="Aulas assistidas"></progress>
    <span>${watched} de ${total} aulas assistidas</span>
  </div>`
}

export function watchedButton(lesson, text = false) {
  const watched = lesson.progress.watched
  const label = watched ? 'Marcar como pendente' : 'Marcar como assistida'
  return `<button type="button" class="${text ? 'button secondary' : 'icon-button'} watch-button ${watched ? 'is-watched' : ''}"
    data-action="watched" data-lesson="${esc(lesson.id)}" aria-label="${label}" aria-pressed="${watched}" title="${label}">
    ${icon(watched ? 'circle-check' : 'circle')}${text ? `<span>${watched ? 'Aula assistida' : label}</span>` : ''}
  </button>`
}
