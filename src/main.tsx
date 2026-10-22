import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n';
import { Boundary } from './ui';
import './styles.css';
import './imported-twin/digital-twin.css';
import './operational.css';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <Boundary>
        <App />
      </Boundary>
    </I18nProvider>
  </React.StrictMode>,
);
