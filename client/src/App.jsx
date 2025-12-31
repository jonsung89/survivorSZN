import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/Toast';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Leagues from './pages/Leagues';
import CreateLeague from './pages/CreateLeague';
import JoinLeague from './pages/JoinLeague';
import JoinByInvite from './pages/JoinByInvite';
import LeagueDetail from './pages/LeagueDetail';
import MakePick from './pages/MakePick';
import Schedule from './pages/Schedule';
import Loading from './components/Loading';
import Onboarding from './components/Onboarding';

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user, loading, showOnboarding } = useAuth();
  
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
  
  return children;
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

// Main layout with navbar
function AppLayout({ children }) {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="sm:pt-16">
        {children}
      </main>
    </div>
  );
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
        <ProtectedRoute>
          <AppLayout>
            <JoinLeague />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      {/* League detail routes - use singular /league/ */}
      <Route path="/league/:leagueId" element={
        <ProtectedRoute>
          <AppLayout>
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
      
      <Route path="/schedule" element={
        <ProtectedRoute>
          <AppLayout>
            <Schedule />
          </AppLayout>
        </ProtectedRoute>
      } />
      
      {/* Redirect root to dashboard or login */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      
      {/* 404 fallback */}
      <Route path="*" element={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-display font-bold text-white mb-4">404</h1>
            <p className="text-white/60 mb-6">Page not found</p>
            <a href="/dashboard" className="btn-primary">Go Home</a>
          </div>
        </div>
      } />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}