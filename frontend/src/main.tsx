import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
// Íconos incluidos en el sistema (no desde internet): funcionan también en una instalación sin conexión.
import '@fortawesome/fontawesome-free/css/all.min.css';
import './index.css';
import { queryClient } from './api/queryClient.ts';
import App from './app/App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
