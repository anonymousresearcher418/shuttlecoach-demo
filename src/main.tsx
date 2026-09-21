import React from 'react'
import ReactDOM from 'react-dom/client'
import PublicApp from './PublicApp'
import './styles.css'
import './enhancements.css'
import './alignment.css'
import './universal.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><PublicApp /></React.StrictMode>,
)
