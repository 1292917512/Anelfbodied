import { createRoot } from 'react-dom/client';
import { App } from './panel/App';
import { Pet } from './pet/Pet';
import './style.css';
import './styles/models.css';
const overlay = new URLSearchParams(location.search).get('view') === 'pet';
document.body.className = overlay ? 'overlay' : 'console';
const root = document.getElementById('root');
if (root) createRoot(root).render(overlay ? <Pet /> : <App />);
