import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessioneProvider } from './sessione/Sessione';
import App from './App';
import './index.css';

const qc = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // 4xx non si ripetono: la risposta non cambia riprovando.
      retry: (n, e) => !(e?.stato >= 400 && e?.stato < 500) && n < 2
    }
  }
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <SessioneProvider>
        <App />
      </SessioneProvider>
    </QueryClientProvider>
  </StrictMode>
);
