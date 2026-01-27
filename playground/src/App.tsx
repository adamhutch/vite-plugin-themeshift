export function App() {
  return (
    <div className="app">
      <h1>Style Dictionary + Vite Plugin Playground</h1>
      <p>Edit tokens/*.json and watch the page reload with updated vars.</p>

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button
          onClick={() =>
            document.documentElement.setAttribute('data-theme', 'light')
          }
        >
          Light
        </button>
        <button
          onClick={() =>
            document.documentElement.setAttribute('data-theme', 'dark')
          }
        >
          Dark
        </button>
        <button
          onClick={() => document.documentElement.removeAttribute('data-theme')}
        >
          Default
        </button>
      </div>
    </div>
  );
}
