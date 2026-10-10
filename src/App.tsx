import React, { useState, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Splash } from './components/Splash';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './lib/toast';
import { AuthProvider } from './lib/AuthContext';

// Lazy-loaded routes for performance
const Landing = lazy(() => import('./pages/Landing').then((m) => ({ default: m.Landing })));
const Playground = lazy(() => import('./pages/Playground').then((m) => ({ default: m.Playground })));
const History = lazy(() => import('./pages/History').then((m) => ({ default: m.History })));
const Benchmarks = lazy(() => import('./pages/Benchmarks').then((m) => ({ default: m.Benchmarks })));
const Docs = lazy(() => import('./pages/Docs').then((m) => ({ default: m.Docs })));
const Auth = lazy(() => import('./pages/Auth').then((m) => ({ default: m.Auth })));
const Share = lazy(() => import('./pages/Share').then((m) => ({ default: m.Share })));

function PageLoading() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-[#78716C]">
      <div className="w-5 h-5 border-2 border-[#059669] border-t-transparent rounded-full animate-spin mb-2" />
      <span className="text-xs">Loading page...</span>
    </div>
  );
}

function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-semibold text-[#1C1917] mb-2">Page not found</h1>
      <p className="text-sm text-[#78716C] mb-4">The requested page does not exist.</p>
      <Link
        to="/"
        className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
      >
        Return home
      </Link>
    </div>
  );
}

export default function App() {
  const [splashFinished, setSplashFinished] = useState(() => {
    if (typeof window === 'undefined') return true;
    const seen = sessionStorage.getItem('arbora_splash_seen');
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return seen === 'true' || prefersReduced;
  });

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          {!splashFinished && (
            <Splash onComplete={() => setSplashFinished(true)} />
          )}
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route
                  index
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Landing />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="playground"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Playground />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="history"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <History />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="benchmarks"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Benchmarks />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="docs"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Docs />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="auth"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Auth />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="share"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Share />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route
                  path="share/:slug"
                  element={
                    <ErrorBoundary>
                      <Suspense fallback={<PageLoading />}>
                        <Share />
                      </Suspense>
                    </ErrorBoundary>
                  }
                />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
