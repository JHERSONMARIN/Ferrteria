import React, { useState } from 'react';
import { api } from '../api.js';
import FieldError from './FieldError.jsx';
import { borderClass } from '../utils/validators.js';

const MIN_LENGTH = 8;

function PasswordInput({ label, value, onChange, error, autoFocus, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          className={`w-full border p-2 pr-10 rounded outline-none text-sm font-medium focus:border-orange-500 ${borderClass(error)}`}
        />
        <button
          type="button"
          onClick={() => setVisible(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
          title={visible ? 'Ocultar' : 'Mostrar'}
          tabIndex={-1}
        >
          <i className={`fa-solid ${visible ? 'fa-eye-slash' : 'fa-eye'}`}></i>
        </button>
      </div>
      <FieldError msg={error} />
    </div>
  );
}

// mandatory: la clave actual es temporal y no se puede usar el sistema hasta cambiarla.
export default function ChangePasswordForm({ mandatory, onDone, onCancel, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saving, setSaving] = useState(false);

  const clear = (field) => { setErrors(prev => ({ ...prev, [field]: '' })); setServerError(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = {};
    if (!currentPassword) validation.currentPassword = 'Ingrese su contraseña actual.';
    if (newPassword.trim().length < MIN_LENGTH) validation.newPassword = `Debe tener al menos ${MIN_LENGTH} caracteres.`;
    else if (newPassword === currentPassword) validation.newPassword = 'Debe ser distinta de la actual.';
    if (confirmPassword !== newPassword) validation.confirmPassword = 'Las contraseñas no coinciden.';
    setErrors(validation);
    if (Object.keys(validation).length > 0) return;

    try {
      setSaving(true);
      const res = await api.post('/auth/change-password', { currentPassword, newPassword });
      onDone(res.user);
    } catch (err) {
      setServerError(err.message || 'No se pudo cambiar la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-700/20">
      <div className="p-5 bg-slate-950 text-white text-center border-b border-orange-500">
        <i className="fa-solid fa-key text-orange-500 text-2xl mb-2"></i>
        <h2 className="text-lg font-bold">{mandatory ? 'Elija su contraseña' : 'Cambiar contraseña'}</h2>
        {mandatory && (
          <p className="text-slate-400 text-xs mt-1">
            Ingresó con una contraseña temporal. Por seguridad, cree una propia para continuar.
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3">
        <PasswordInput
          label={mandatory ? 'Contraseña temporal' : 'Contraseña actual'}
          value={currentPassword}
          onChange={v => { setCurrentPassword(v); clear('currentPassword'); }}
          error={errors.currentPassword}
          autoFocus
          autoComplete="current-password"
        />
        <PasswordInput
          label="Nueva contraseña"
          value={newPassword}
          onChange={v => { setNewPassword(v); clear('newPassword'); }}
          error={errors.newPassword}
          autoComplete="new-password"
        />
        <PasswordInput
          label="Repita la nueva contraseña"
          value={confirmPassword}
          onChange={v => { setConfirmPassword(v); clear('confirmPassword'); }}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />
        <p className="text-[11px] text-slate-400">Mínimo {MIN_LENGTH} caracteres.</p>

        {serverError && <p className="text-red-500 text-xs font-bold text-center">{serverError}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 rounded-lg shadow-md transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
          {saving ? 'Guardando…' : 'Guardar contraseña'}
        </button>

        {mandatory ? (
          <button type="button" onClick={onLogout} className="text-xs font-semibold text-slate-500 hover:text-red-600">
            Cerrar sesión
          </button>
        ) : (
          <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
            Cancelar
          </button>
        )}
      </form>
    </div>
  );
}
