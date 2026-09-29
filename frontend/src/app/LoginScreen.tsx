// Pantalla de inicio de sesión, con la marca de la empresa y, en entornos de prueba, accesos rápidos.
import { useState, type FormEvent } from 'react';
import FieldError from '../shared/ui/FieldError.tsx';
import { api } from '../api/client.ts';
import type { AppInfo, SessionUser } from '../api/types.ts';

// Usuarios de la instancia de demostración (DEMO_MODE): se muestran solo allí.
const DEMO_TEST_USERS = [
  { label: 'Administrador', user: 'admin', pass: '1234', icon: 'fa-user-shield' },
  { label: 'Vendedor', user: 'vendedor1', pass: '1234', icon: 'fa-cash-register' },
  { label: 'Cajero', user: 'cajero1', pass: '1234', icon: 'fa-vault' },
  { label: 'Repartidor', user: 'repartidor1', pass: '1234', icon: 'fa-truck-fast' },
];

interface Props {
  appInfo: AppInfo | undefined;
  onSignedIn: (user: SessionUser) => void;
}

export default function LoginScreen({ appInfo, onSignedIn }: Props) {
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ user?: string; pass?: string }>({});
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);

  const brand = appInfo?.business;
  const version = appInfo?.version;
  const quickUsers = appInfo?.quickLogin ?? [];
  const testUsers = quickUsers.length > 0
    ? quickUsers.map(u => ({ user: u.user, pass: u.pass, label: u.label, icon: 'fa-user' }))
    : DEMO_TEST_USERS;

  const signIn = async (user: string, pass: string) => {
    setLoginError('');
    const errors: { user?: string; pass?: string } = {};
    if (!user.trim()) errors.user = 'Ingrese su usuario.';
    else if (user.trim().length < 3) errors.user = 'El usuario debe tener al menos 3 caracteres.';
    if (!pass.trim()) errors.pass = 'Ingrese su contraseña.';
    else if (pass.length < 4) errors.pass = 'La contraseña debe tener al menos 4 caracteres.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      setLoading(true);
      const res = await api.post<{ success: boolean; user: SessionUser }>('/auth/login', { user: user.trim(), pass: pass.trim() });
      if (res.success && res.user) onSignedIn(res.user);
    } catch (err) {
      setLoginError((err as Error).message || 'Credenciales incorrectas o usuario inactivo.');
    } finally {
      setLoading(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    signIn(loginUser, loginPass);
  };

  const quickSignIn = (user: string, pass: string) => {
    setLoginUser(user);
    setLoginPass(pass);
    signIn(user, pass);
  };

  const inputClass = (error?: string) =>
    `w-full border p-2.5 rounded-xl outline-none text-sm font-medium focus:ring-2 focus:ring-brand/20 ${error ? 'border-danger' : 'border-line focus:border-brand'}`;

  return (
    <div id="login-screen" className="fixed inset-0 bg-panel z-[100] flex items-center justify-center p-4 transition-all overflow-y-auto">
      <div className="bg-surface rounded-2xl shadow-float w-full max-w-md overflow-hidden flex flex-col my-auto">
        <div className="p-5 bg-panel-strong text-white text-center border-b-2 border-brand">
          {brand?.logo
            ? <img src={brand.logo} alt="" className="h-14 mx-auto mb-2 object-contain" />
            : <i className="fa-solid fa-screwdriver-wrench text-brand text-3xl mb-2"></i>}
          <h2 className="text-xl font-bold tracking-wide">
            {brand?.name || <>FerreSys {version?.number && <span className="text-xs text-brand align-top">v{version.number}</span>}</>}
          </h2>
          <p className="text-muted text-xs mt-0.5">Inicio de sesión</p>
        </div>

        <form onSubmit={submit} className="p-5 flex flex-col gap-3">
          <div>
            <label className="text-xs font-bold text-ink-soft mb-1 block">Usuario</label>
            <input
              type="text"
              value={loginUser}
              onChange={e => { setLoginUser(e.target.value); setFieldErrors(p => ({ ...p, user: '' })); }}
              className={inputClass(fieldErrors.user)}
            />
            <FieldError msg={fieldErrors.user} />
          </div>
          <div>
            <label className="text-xs font-bold text-ink-soft mb-1 block">Contraseña</label>
            <input
              type="password"
              value={loginPass}
              onChange={e => { setLoginPass(e.target.value); setFieldErrors(p => ({ ...p, pass: '' })); }}
              className={inputClass(fieldErrors.pass)}
            />
            <FieldError msg={fieldErrors.pass} />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand hover:bg-brand-strong text-brand-contrast font-bold py-2.5 rounded-xl shadow-card transition-colors text-sm flex items-center justify-center gap-2 mt-1"
          >
            {loading && <i className="fa-solid fa-spinner fa-spin text-xs"></i>}
            {loading ? 'Ingresando...' : 'Ingresar al Sistema'}
          </button>
          {loginError && <p className="text-danger text-xs font-bold text-center mt-1">{loginError}</p>}
        </form>

        {(appInfo?.demoMode || quickUsers.length > 0) && (
          <div className="bg-surface-muted border-t border-line p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] font-bold text-ink-soft uppercase tracking-wider flex items-center gap-1.5">
                <i className="fa-solid fa-flask text-brand"></i> Usuarios de prueba
              </span>
              <span className="text-[10px] text-muted font-medium">Toque para entrar directo</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {testUsers.map(demo => (
                <button
                  key={demo.user}
                  type="button"
                  disabled={loading}
                  onClick={() => quickSignIn(demo.user, demo.pass)}
                  className="flex items-center gap-2.5 p-2 rounded-xl border border-line bg-surface hover:border-brand hover:bg-brand-soft text-left transition-colors group"
                  title={`Ingresar como ${demo.label}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-surface-muted flex items-center justify-center shrink-0">
                    <i className={`fa-solid ${demo.icon} text-muted text-sm group-hover:text-brand`}></i>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-ink truncate">{demo.label}</div>
                    <div className="text-[10px] text-muted truncate font-mono">@{demo.user}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
