import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider } from './context/ThemeContext';
import { ToastProvider } from './components/Toast';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import SplashScreen from './components/SplashScreen';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leagues from './pages/Leagues';
import CreateLeague from './pages/CreateLeague';
import JoinLeague from './pages/JoinLeague';
import JoinByInvite from './components/JoinByInvite';
import LeagueDetail from './pages/LeagueDetail';
import MakePick from './pages/MakePick';
import BracketChallenge from './pages/BracketChallenge';
import BracketFill from './pages/BracketFill';
import Schedule from './pages/Schedule';
import Loading from './components/Loading';
import Onboarding from './components/Onboarding';
import EmailPrompt from './components/EmailPrompt';
import AdminLayout from './pages/admin/AdminLayout';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminLeagues from './pages/admin/AdminLeagues';
import AdminReports from './pages/admin/AdminReports';
import AdminBracketTest from './pages/admin/AdminBracketTest';

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user, loading, showOnboarding, showEmailPrompt } = useAuth();
  
  if (loading) {
    return <Loading fullScreen />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Show onboarding for new users
  if (showOnboarding) {
    return <Onboarding />;
  }
  
  return (
    <>
      {children}
      {showEmailPrompt && <EmailPrompt />}
    </>
  );
}

// Public route (redirect to dashboard if logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <Loading fullScreen />;
  }
  
  if (user) {
    // Check for pending invite after login
    const pendingInvite = sessionStorage.getItem('pendingInvite');
    if (pendingInvite) {
      sessionStorage.removeItem('pendingInvite');
      return <Navigate to={`/join/${pendingInvite}`} replace />;
    }
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
}

// Main layout with navbar and footer
// hideFooterMobile: hides footer on mobile/tablet for pages with bottom chat bar
function AppLayout({ children, hideFooterMobile = false }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="pt-4 flex-1">
        {children}
      </main>
      <div className={hideFooterMobile ? 'hidden lg:block' : ''}>
        <Footer />
      </div>
    </div>
  );
}

// Admin route wrapper — requires admin role
function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading fullScreen />;
  if (!user || !user.isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

// Redirect root based on auth state
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <Loading fullScreen />;
  return <Navigate to={user ? "/dashboard" : "/schedule"} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={
        <PublicRoute>
          <Login />
        </PublicRoute>
      } />
      
      {/* Semi-public route - accessible to all but shows different UI */}
      <Route path="/join/:inviteCode" element={
        <JoinByInvite />
      } />
      
      {/* Protected routes */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <AppLayout>
            <Dashboard />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/leagues" element={
        <ProtectedRoute>
          <AppLayout>
            <Leagues />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/leagues/create" element={
        <ProtectedRoute>
          <AppLayout>
            <CreateLeague />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/leagues/join" element={
        <AppLayout>
          <JoinLeague />
        </AppLayout>
      } />
      
      {/* League detail routes - use singular /league/ */}
      {/* hideFooterMobile: chat bar replaces footer on mobile */}
      <Route path="/league/:leagueId" element={
        <ProtectedRoute>
          <AppLayout hideFooterMobile>
            <LeagueDetail />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/league/:leagueId/pick" element={
        <ProtectedRoute>
          <AppLayout>
            <MakePick />
          </AppLayout>
        </ProtectedRoute>
      } />

      <Route path="/league/:leagueId/bracket" element={
        <ProtectedRoute>
          <AppLayout>
            <BracketChallenge />
          </AppLayout>
        </ProtectedRoute>
      } />

      <Route path="/league/:leagueId/bracket/:bracketId" element={
        <ProtectedRoute>
          <AppLayout>
            <BracketFill />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      <Route path="/schedule" element={
        <AppLayout>
          <Schedule />
        </AppLayout>
      } />
      
      {/* Admin panel */}
      <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="leagues" element={<AdminLeagues />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="bracket-test" element={<AdminBracketTest />} />
      </Route>

      {/* Redirect root to dashboard (logged in) or schedule (public) */}
      <Route path="/" element={<RootRedirect />} />
      
      {/* 404 fallback */}
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-display font-bold text-fg mb-4">404</h1>
            <p className="text-fg/60 mb-6">Page not found</p>
            <a href="/dashboard" className="btn-primary">Go Home</a>
          </div>
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  const [showSplash] = useState(() => !sessionStorage.getItem('splashShown'));
  const [splashDone, setSplashDone] = useState(!showSplash);

  const handleSplashComplete = useCallback(() => {
    sessionStorage.setItem('splashShown', '1');
    setSplashDone(true);
  }, []);

  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <SocketProvider>
              {showSplash && !splashDone && (
                <SplashScreen onComplete={handleSplashComplete} />
              )}
              <AppRoutes />
            </SocketProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}