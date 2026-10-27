import { Component } from 'react';
import type { ReactNode } from 'react';

/** Keeps one broken screen from blanking the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidUpdate(prev: { resetKey?: string }) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div role="alert" className="h-full flex items-center justify-center p-8 bg-slate-100"><div className="max-w-md text-center bg-white border border-red-200 rounded-2xl p-6 shadow">
        <h2 className="font-bold text-red-700 mb-1">This screen hit a problem</h2>
        <p className="text-sm text-slate-600 mb-3">{this.state.err.message.slice(0, 200)}</p>
        <button onClick={() => this.setState({ err: null })} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold mr-2">Try again</button>
        <button onClick={() => location.reload()} className="px-4 py-2 rounded-lg border border-slate-300 text-sm font-semibold">Reload app</button>
      </div></div>
    );
  }
}
