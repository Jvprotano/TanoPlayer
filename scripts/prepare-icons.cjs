const fs = require('node:fs')
const path = require('node:path')

const source = path.dirname(require.resolve('lucide-static/package.json'))
const target = path.resolve(__dirname, '../src/assets')
const names = [
  'arrow-left', 'arrow-right', 'arrow-up-right', 'chevron-left', 'chevron-right', 'circle', 'circle-alert',
  'circle-check', 'clock-3', 'external-link', 'file-video', 'folder', 'folder-open', 'graduation-cap', 'hard-drive',
  'house', 'image', 'layout-grid', 'list-video', 'maximize', 'minimize', 'panel-left-close', 'panel-left-open',
  'pause', 'pencil', 'play', 'plus',
  'rotate-ccw', 'rotate-cw', 'search', 'trash-2', 'volume-2', 'volume-x', 'x'
]

const symbols = names.map(name => {
  const markup = fs.readFileSync(path.join(source, 'icons', name + '.svg'), 'utf8')
  const body = markup.slice(markup.indexOf('>', markup.indexOf('<svg')) + 1, markup.lastIndexOf('</svg>'))
  return `  <symbol id="${name}" viewBox="0 0 24 24">
    <g stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>
  </symbol>`
})

fs.writeFileSync(path.join(target, 'icons.svg'), `<svg xmlns="http://www.w3.org/2000/svg" fill="none">\n${symbols.join('\n')}\n</svg>\n`)
fs.copyFileSync(path.join(source, 'LICENSE'), path.join(target, 'LICENSE-Lucide.txt'))
