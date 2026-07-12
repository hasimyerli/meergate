'use client';

import { useState } from 'react';
import { useAuth } from '@/components/auth-provider';
import { useI18n } from '@/lib/i18n';
import { FlaskConical, Loader2, Eye, EyeOff, Shield } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.login.loginFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-[480px] flex-col justify-between bg-slate-950 p-10 text-white">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <FlaskConical className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold">Inkling</div>
              <div className="text-xs text-slate-400">Test Platform</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <h2 className="text-3xl font-bold leading-tight tracking-tight">
            {t.login.enterpriseTest}<br />{t.login.automation}
          </h2>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            {t.login.description}
          </p>
          <div className="flex items-center gap-6 text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              {t.login.internalOnly}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-600">
          &copy; {new Date().getFullYear()} Inkling. {t.login.allRightsReserved}
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center bg-white px-6">
        <div className="w-full max-w-[360px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600">
              <FlaskConical className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-900">Inkling</div>
              <div className="text-xs text-slate-400">Test Platform</div>
            </div>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{t.login.signIn}</h1>
            <p className="mt-1.5 text-sm text-slate-500">{t.login.signInHint}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.login.username}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                placeholder={t.login.usernamePlaceholder}
                autoFocus
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">{t.login.password}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  placeholder={t.login.passwordPlaceholder}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 animate-fadeIn">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t.login.signingIn}
                </span>
              ) : (
                t.login.signIn
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
