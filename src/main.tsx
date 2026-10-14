import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { SpeedInsights } from '@vercel/speed-insights/react';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
      <SpeedInsights />
    </React.StrictMode>
  );
}
