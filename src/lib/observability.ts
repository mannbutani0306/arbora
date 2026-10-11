type SentryModule = typeof import('@sentry/react');

let sentryPromise: Promise<SentryModule | undefined> | undefined;
let globalHandlersInstalled = false;

const sentryDsn = import.meta.env.VITE_SENTRY_DSN?.trim();

if (sentryDsn) {
  sentryPromise = import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0,
      });
      return Sentry;
    })
    .catch((error: unknown) => {
      if (import.meta.env.DEV) console.error('Optional error reporting could not start.', error);
      return undefined;
    });
}

export function reportClientError(
  error: Error,
  context?: Record<string, string | null | undefined>,
): void {
  if (import.meta.env.DEV) console.error('Arbora client error:', error);
  if (sentryPromise) {
    void sentryPromise.then((Sentry) => {
      Sentry?.captureException(error, { extra: context });
    });
  }
}

export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') return;
  globalHandlersInstalled = true;
  window.addEventListener('error', (event) => {
    reportClientError(
      event.error instanceof Error ? event.error : new Error('Unhandled client error.'),
    );
  });
  window.addEventListener('unhandledrejection', () => {
    reportClientError(new Error('Unhandled promise rejection.'));
  });
}
