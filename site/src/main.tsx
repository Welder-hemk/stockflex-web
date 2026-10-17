import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initAnalytics } from './lib/analytics'
import { initTracker } from './lib/tracker'

initAnalytics();
initTracker();

createRoot(document.getElementById("root")!).render(<App />);
