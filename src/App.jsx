import React from 'react'
import './App.css'
import { HashRouter, Routes, Route, Link } from 'react-router-dom'
import GuideForm from './components/GuideForm'
import GuideViewer from './components/GuideViewer'
import GuideIndex from './components/GuideIndex'

function App() {
  return (
  // Usamos HashRouter para que las rutas funcionen en GitHub Pages
  // (URLs tendrán un '#' y no necesitarán configuración adicional en Pages).
  <HashRouter>
      <div className="min-h-screen bg-gray-100 p-6">
        <header className="mb-4 flex justify-center">
          
          {/* <nav>
            <Link to="/" className="text-sky-700 hover:underline mr-3">Generador</Link>
            <Link to="/guia-1" className="text-sky-700 hover:underline">Ver guía ejemplo</Link>
          </nav> */}
        </header>

        <main>
          <Routes>
      {/* Routes:
        /           -> GuideIndex (home: pedir id y navegar a /{id})
        /generador  -> GuideForm (generador)
        /:id        -> GuideViewer (e.g. /guia-1)
        When deployed with base '/guia-estudio/', the final urls become
        /guia-estudio/, /guia-estudio/generador and /guia-estudio/guia-1 */}
      <Route path="/" element={<GuideIndex />} />
      <Route path="/generador" element={<GuideForm />} />
      <Route path=":id" element={<GuideViewer />} />
          </Routes>
        </main>
      </div>
  </HashRouter>
  )
}

export default App
