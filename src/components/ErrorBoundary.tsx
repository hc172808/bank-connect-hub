import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App error boundary caught:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen bg-primary/10 flex items-center justify-center p-6"
          data-testid="error-boundary"
        >
          <div className="max-w-md w-full bg-card border rounded-2xl p-8 text-center shadow-lg">
            <div className="mx-auto mb-4 w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold mb-2" data-testid="text-error-title">
              Something went wrong
            </h1>
            <p className="text-sm text-muted-foreground mb-6" data-testid="text-error-message">
              {this.state.error?.message || "An unexpected error occurred."}
            </p>
            <Button onClick={this.handleReset} className="w-full" data-testid="button-error-reset">
              Reload app
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
