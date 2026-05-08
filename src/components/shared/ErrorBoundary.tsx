"use client";

import { Component } from "react";
import type { ReactNode, ErrorInfo } from "react";
import { Button } from "@/components/ui/Button";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-full min-h-[200px] items-center justify-center">
          <div className="text-center">
            <h2 className="font-[var(--font-display)] text-lg font-semibold text-text-secondary">
              Something went wrong
            </h2>
            <p className="mt-2 text-sm text-text-tertiary">
              An unexpected error occurred in this section.
            </p>
            <Button variant="primary" size="lg" onClick={this.handleRetry} className="mt-4">
              Try again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
