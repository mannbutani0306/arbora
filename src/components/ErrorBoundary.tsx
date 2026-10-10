import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Compiler error boundary caught:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAFAF9] flex flex-col items-center justify-center p-6 text-center">
          <p className="text-sm font-medium text-[#1C1917] mb-3">Something went wrong.</p>
          <button
            type="button"
            onClick={this.handleReset}
            className="px-4 py-2 rounded-xl text-sm font-medium text-white bg-[#059669] hover:bg-[#047857] transition-colors"
          >
            Reload application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
