const { contextBridge, ipcRenderer } = require('electron')

async function invoke(channel, ...args) {
  const result = await ipcRenderer.invoke(channel, ...args)
  if (result.error) throw new Error(result.error)
  return result.value
}

contextBridge.exposeInMainWorld('tano', {
  catalog: () => invoke('catalog'),
  pick: kind => invoke('pick', kind),
  saveCourse: course => invoke('course:save', course),
  removeCourse: id => invoke('course:remove', id),
  removeLesson: id => invoke('lesson:remove', id),
  source: id => invoke('lesson:source', id),
  openExternal: id => invoke('lesson:external', id),
  setWatched: (id, watched) => invoke('lesson:watched', id, watched),
  saveProgress: (id, progress) => invoke('lesson:progress', id, progress),
  flushProgress: (id, progress) => ipcRenderer.sendSync('lesson:flush', id, progress)
})
