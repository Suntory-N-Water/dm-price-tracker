import ReactDOM from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';

const rootElement = document.getElementById('app');

if (!rootElement) {
  throw new Error('アプリケーションの描画先が見つかりません');
}

if (!rootElement.innerHTML) {
  ReactDOM.createRoot(rootElement).render(<RouterProvider router={router} />);
}
