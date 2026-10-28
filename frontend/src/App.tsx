import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { ApiError } from './api/client';
import { ContactDetailPage } from './pages/ContactDetailPage';
import { ContactListPage } from './pages/ContactListPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // 4xx won't get better by retrying; 5xx / network get one retry
      retry: (count, err) => count < 1 && !(err instanceof ApiError && err.status >= 400 && err.status < 500),
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <header className="topbar">
          <Link to="/">CRM Contacts</Link>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<ContactListPage />} />
            <Route path="/contacts/:id" element={<ContactDetailPage />} />
            <Route path="*" element={<p>Page not found. <Link to="/">Back to contacts</Link></p>} />
          </Routes>
        </main>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
