import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from '../i18n';

interface Props {
  children: ReactNode;
  /** muda quando a rota muda, para limpar o erro ao navegar */
  resetKey?: string;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // ponto único para enviar a um serviço de observabilidade
    console.error('[IPMAN] falha de renderização', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error, this.reset)
      ) : (
        <ScreenError onRetry={this.reset} />
      );
    }
    return this.props.children;
  }
}

export function ScreenError({
  onRetry,
  title,
  body,
}: {
  onRetry: () => void;
  title?: string;
  body?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="state-box" role="alert">
      <div>
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="#c9413b"
          strokeWidth="2"
        >
          <path d="M12 3l10 18H2L12 3z" />
          <path d="M12 10v5M12 18v.5" strokeLinecap="round" />
        </svg>
        <h2>{title ?? t('common.errorTitle')}</h2>
        <p>{body ?? t('common.errorBody')}</p>
        <button type="button" className="btn" onClick={onRetry}>
          {t('common.retry')}
        </button>
      </div>
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="state-box" role="status" aria-live="polite">
      <div>
        <span className="spinner" />
        <p>{label ?? t('common.loading')}</p>
      </div>
    </div>
  );
}
