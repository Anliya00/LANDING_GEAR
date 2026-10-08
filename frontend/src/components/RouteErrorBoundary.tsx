import { Component, type ReactNode } from 'react';

export class RouteErrorBoundary extends Component<
  { children: ReactNode }, { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state">
        <h2>This page could not be displayed</h2>
        <p>{this.state.error.message}</p>
        <button type="button" onClick={() => this.setState({ error: null })}>
          Retry
        </button>
      </div>
    );
  }
}