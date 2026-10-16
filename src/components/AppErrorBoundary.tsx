import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugLog } from "../debugLog";

type Props = {
  children: ReactNode;
  title?: string;
  onReset?: () => void;
};

type State = {
  error: Error | null;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    debugLog("react-error", {
      message: error.message,
      stack: error.stack ?? "",
      componentStack: info.componentStack ?? "",
    });
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    const reset = () => {
      this.setState({ error: null });
      this.props.onReset?.();
    };
    return (
      <div className={this.props.onReset ? "popover-crash" : "app-crash"} role="alert">
        <div className="card">
          <h2>{this.props.title ?? "Something went wrong."}</h2>
          <p>{error.message}</p>
          <button type="button" onClick={reset}>
            {this.props.onReset ? "Close" : "Try again"}
          </button>
        </div>
      </div>
    );
  }
}
