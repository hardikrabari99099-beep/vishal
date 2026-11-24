import { Component, type ErrorInfo, type ReactNode } from "react";
import type { FirestoreErrorInfo } from "../lib/firebase";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  firestoreInfo: FirestoreErrorInfo | null;
}

function tryParseFirestoreError(raw: string): FirestoreErrorInfo | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FirestoreErrorInfo>;
    if (
      parsed &&
      typeof parsed.error === "string" &&
      "operationType" in parsed &&
      "path" in parsed
    ) {
      return parsed as FirestoreErrorInfo;
    }
    return null;
  } catch {
    return null;
  }
}

export class FirestoreErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    message: "",
    firestoreInfo: null,
  };

  static getDerivedStateFromError(error: Error): State {
    const firestoreInfo = tryParseFirestoreError(error.message);
    return {
      hasError: true,
      message:
        firestoreInfo?.error ||
        error.message ||
        "Unexpected application error.",
      firestoreInfo,
    };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(
      "[FirestoreErrorBoundary]",
      error.message,
      info.componentStack,
    );
  }

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const fs = this.state.firestoreInfo;
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg-0)] text-white px-4">
        <div className="card-panel max-w-md w-full p-6 sm:p-8 text-center">
          <div className="chip mb-3">Cloud Sync Notice</div>
          <h2 className="font-display text-2xl">
            Could not complete cloud request
          </h2>
          <p className="text-sm text-[var(--muted)] mt-2">
            {fs
              ? `Access check stopped (${fs.operationType} on ${fs.path ?? "unknown"}). Please ensure you are signed in with the right verified account.`
              : this.state.message}
          </p>
          <div className="flex justify-center gap-3 mt-6">
            <button
              type="button"
              onClick={() =>
                this.setState({
                  hasError: false,
                  message: "",
                  firestoreInfo: null,
                })
              }
              className="btn-amber rounded-full px-5 py-2 text-sm"
            >
              Try again
            </button>
            <a href="/" className="btn-ghost rounded-full px-5 py-2 text-sm">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
