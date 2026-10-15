import React, { Suspense, lazy, useEffect } from 'react';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import { navigate, usePathname } from './lib/router';
import LandingPage from './pages/LandingPage';

// The translator pulls in MediaPipe and TF.js, so it loads only when opened.
const TranslatorPage = lazy(() => import('./pages/TranslatorPage'));
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const SignupPage = lazy(() => import('./pages/auth/SignupPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const AccountPage = lazy(() => import('./pages/AccountPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const PageFallback = () => (
  <div className="min-h-dvh grid place-items-center bg-black" role="status" aria-label="Loading">
    <div className="h-px w-40 overflow-hidden bg-white/15">
      <div className="h-full w-full bg-ink animate-[sweep_1.6s_ease_infinite]" />
    </div>
  </div>
);

/** Sends signed-out visitors to /login and back here afterwards. */
const RequireAccount: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading, enabled } = useAuth();
  const shouldRedirect = !loading && (!user || !enabled);
  useEffect(() => {
    if (shouldRedirect) navigate(`/login?next=${encodeURIComponent(location.pathname)}`, { replace: true });
  }, [shouldRedirect]);
  return loading || shouldRedirect ? <PageFallback /> : <>{children}</>;
};

/** Signed-in visitors don't need the login or signup pages. */
const GuestOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (!loading && user) navigate('/app', { replace: true });
  }, [loading, user]);
  return <>{children}</>;
};

function Routes() {
  const path = usePathname().replace(/\/+$/, '') || '/';
  switch (path) {
    case '/':
      return <LandingPage />;
    case '/app':
      return <TranslatorPage />;
    case '/login':
      return (
        <GuestOnly>
          <LoginPage />
        </GuestOnly>
      );
    case '/signup':
      return (
        <GuestOnly>
          <SignupPage />
        </GuestOnly>
      );
    case '/forgot-password':
      return <ForgotPasswordPage />;
    case '/reset-password':
      return <ResetPasswordPage />;
    case '/account':
      return (
        <RequireAccount>
          <AccountPage />
        </RequireAccount>
      );
    default:
      return <NotFoundPage />;
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageFallback />}>
        <Routes />
      </Suspense>
    </AuthProvider>
  );
}
