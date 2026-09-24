import { Canvas } from './editor/Canvas'
import { examples } from './examples'
import { useDocument } from './store/document'

export default function App() {
  const { doc, setDoc } = useDocument()
  const current = examples.find((e) => e.doc === doc)?.file

  return (
    <div className="app">
      <header className="toolbar">
        <strong className="brand">mdp-designer</strong>
        <span className="doc-name">{doc.metadata?.name ?? 'Untitled'}</span>
        <span className="doc-type">{doc.model.type.toUpperCase()}</span>
        <label className="example-picker">
          Example{' '}
          <select value={current} onChange={(e) => setDoc(examples.find((x) => x.file === e.target.value)!.doc)}>
            {examples.map((e) => (
              <option key={e.file} value={e.file}>
                {e.doc.metadata?.name ?? e.file}
              </option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <span className="notice">Read-only preview. Editing is coming next.</span>
      </header>
      <main className="canvas">
        <Canvas key={current} doc={doc} />
      </main>
    </div>
  )
}
