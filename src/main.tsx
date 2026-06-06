import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { SystemProvider } from './context/SystemContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <SystemProvider>
      <App />
    </SystemProvider>
  </React.StrictMode>
);
