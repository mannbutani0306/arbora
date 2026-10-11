import React from 'react';

interface State { hasError: boolean }

export class TabErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Playground tab failed to render.', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">This tab could not be displayed. Reload the tab to try again.</div>;
    }
    return this.props.children;
  }
}
