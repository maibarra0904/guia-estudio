import React from 'react'
import './App.css'
import GuideForm from './components/GuideForm'

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-2xl font-bold mb-4">Guía de Estudio Inteligente</h1>
      <GuideForm />
    </div>
  )
}

export default App
