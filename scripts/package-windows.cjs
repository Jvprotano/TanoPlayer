const fs = require('node:fs')
const path = require('node:path')

if (process.platform !== 'win32') throw new Error('Execute o empacotamento no Windows.')

const root = path.resolve(__dirname, '..')
const binary = require('electron')
const target = path.join(root, 'dist', `TanoPlayer-win32-${process.arch}`)
fs.mkdirSync(target, { recursive: true })

const executable = path.join(target, 'TanoPlayer.exe')
fs.copyFileSync(binary, executable)
for (const entry of fs.readdirSync(path.dirname(binary))) {
  if (entry === path.basename(binary) || entry === 'resources') continue
  fs.cpSync(path.join(path.dirname(binary), entry), path.join(target, entry), { recursive: true })
}

const payload = path.join(target, 'resources', 'app')
fs.mkdirSync(payload, { recursive: true })
const { name, productName, version, description, main } = require('../package.json')
fs.writeFileSync(path.join(payload, 'package.json'), JSON.stringify({ name, productName, version, description, main }))
fs.cpSync(path.join(root, 'src'), path.join(payload, 'src'), { recursive: true })
console.log(executable)
