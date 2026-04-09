"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class WorkspaceErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Transcribble] Workspace error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-[#efe9dc] px-6 py-12">
        <div className="w-full max-w-lg rounded-[32px] bg-[#faf7f1] px-8 py-10 shadow-[0_18px_60px_rgba(30,35,45,0.08)] ring-1 ring-black/8">
          <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6d6a61]">
            Workspace error
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[#10131a]">
            Something went wrong
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#575c58]">
            The workspace ran into an unexpected error. Your saved projects and
            media files are still stored locally in IndexedDB and will be
            recovered when the page reloads.
          </p>
          {this.state.error ? (
            <div className="mt-4 rounded-[22px] border border-[#f3b3b3] bg-[#fff0ef] px-4 py-3 text-sm text-[#7c2626]">
              {this.state.error.message}
            </div>
          ) : null}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-[#1f4fff] px-5 py-2.5 text-sm font-medium text-white shadow-[0_16px_32px_rgba(31,79,255,0.22)] transition hover:bg-[#1a43d6]"
            >
              Reload workspace
            </button>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-full border border-black/8 bg-white px-5 py-2.5 text-sm font-medium text-[#232730] transition hover:bg-[#f8f3e8]"
            >
              Try to recover
            </button>
          </div>
        </div>
      </div>
    );
  }
}
