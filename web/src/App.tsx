import { ReactFlowProvider } from '@xyflow/react'
import { useEffect, useMemo, type DragEvent } from 'react'
import { handleShortcut, MOD, openFile } from './commands'
import { validate } from './core/validate'
import { Canvas } from './editor/Canvas'
import { Library } from './library/Library'
import { Inspector } from './panels/Inspector'
import { MenuBar } from './panels/MenuBar'
import { Problems } from './panels/Problems'
import { useDocument } from './store/document'

export default function App() {
  const doc = useDocument((s) => s.doc)
  const docKey = useDocument((s) => s.docKey)
  const issues = useMemo(() => validate(doc), [doc])
  const errors = issues.filter((i) => i.level === 'error').length
  const sidebarOpen = useDocument((s) => s.sidebarOpen)
  const libraryOpen = useDocument((s) => s.libraryOpen)
  const toggleSidebar = useDocument((s) => s.toggleSidebar)

  useEffect(() => {
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const onDrop = (e: DragEvent) => {
    const file = e.dataTransfer.files[0]
    if (!file) return
    e.preventDefault()
    void openFile(file)
  }

  return (
    <div className="app">
      <MenuBar errors={errors} warnings={issues.length - errors} />
      <div className="workspace">
        {libraryOpen && <Library />}
        <main className="canvas" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlowProvider key={docKey}>
            <Canvas />
          </ReactFlowProvider>
        </main>
        {sidebarOpen ? (
          <aside className="sidebar">
            <button className="sidebar-toggle" onClick={toggleSidebar} title={`Hide side panel (${MOD}\\)`} aria-label="Hide side panel">
              »
            </button>
            <Inspector />
            <Problems issues={issues} />
          </aside>
        ) : (
          <aside className="sidebar-rail">
            <button onClick={toggleSidebar} title={`Show side panel (${MOD}\\)`} aria-label="Show side panel">
              «
            </button>
            {issues.length > 0 && (
              <button
                className={`rail-badge ${errors ? 'has-errors' : 'has-warnings'}`}
                onClick={toggleSidebar}
                title={`${issues.length} problem${issues.length > 1 ? 's' : ''}`}
              >
                {issues.length}
              </button>
            )}
          </aside>
        )}
      </div>
    </div>
  )
}
