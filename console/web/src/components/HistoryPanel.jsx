import React, { useState, useEffect } from 'react';
import { api } from '../api.js';

const formatoFecha = (valor) => new Date(valor).toLocaleString('es-PE', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

// Historial de lo que hizo VALETEC: altas, planes, actualizaciones, suspensiones y bajas.
export default function HistoryPanel({ onClose }) {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api.get('/historial').then(setItems).catch(err => setError(err.message));
  }, []);

  return (
    <div className="fixed inset-0 bg-slate-900/60 z-40 flex items-start justify-center p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-4">
        <header className="p-4 border-b border-gray-200 flex items-center gap-2">
          <h2 className="font-black text-lg text-slate-800">Historial</h2>
          <button onClick={onClose} className="ml-auto text-slate-400 hover:text-slate-700 text-xl px-2"><i className="fa-solid fa-xmark"></i></button>
        </header>
        {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}
        {items.length === 0 && !error && <p className="px-4 py-10 text-center text-sm text-slate-400">Todavía no hay movimientos.</p>}
        <ul className="divide-y divide-gray-100">
          {items.map(item => (
            <li key={item.id}>
              <button onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 tabular-nums w-36">{formatoFecha(item.createdAt)}</span>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${item.ok ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                  {item.action}
                </span>
                <span className="text-sm text-slate-800 flex-1 min-w-0">{item.summary}</span>
                <span className="text-xs text-slate-500">{item.userName}</span>
              </button>
              {expanded === item.id && item.details?.output && (
                <pre className="mx-4 mb-3 text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 max-h-60 overflow-auto whitespace-pre-wrap">{item.details.output}</pre>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
