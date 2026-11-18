// 手機 App 進入點
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './phone.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
