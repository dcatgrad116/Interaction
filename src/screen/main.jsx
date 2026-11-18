// 展場大螢幕進入點
import React from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/tokens.css';
import './screen.css';
import BigScreen from './BigScreen.jsx';

createRoot(document.getElementById('root')).render(<BigScreen />);
