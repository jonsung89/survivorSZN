import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { userAPI } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('token', token);
          
          const userData = await userAPI.getOrCreateUser({
            firebaseUid: firebaseUser.uid,
            phone: firebaseUser.phoneNumber,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName
          });
          
          console.log('User data from sync:', userData);
          console.log('Email value:', userData.email, '| Is falsy:', !userData.email);
          
          setUser({ ...userData, firebaseUser });
          
          // Show onboarding for new users
          if (userData.isNewUser) {
            setShowOnboarding(true);
          } else if (!userData.email) {
            // Show email prompt for existing users without email
            console.log('Showing email prompt - no email found');
            setShowEmailPrompt(true);
          }
        } catch (err) {
          console.error('Failed to sync user:', err);
          setUser(null);
        }
      } else {
        localStorage.removeItem('token');
        setUser(null);
        setShowOnboarding(false);
        setShowEmailPrompt(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setShowOnboarding(false);
    setShowEmailPrompt(false);
  };

  const updateDisplayName = async (displayName) => {
    const result = await userAPI.updateDisplayName(displayName);
    if (result.displayName) {
      setUser(prev => ({ ...prev, displayName: result.displayName }));
    }
    return result;
  };

  const updateEmail = async (email) => {
    const result = await userAPI.updateEmail(email);
    if (result.success) {
      setUser(prev => ({ ...prev, email: result.email }));
      setShowEmailPrompt(false);
    }
    return result;
  };

  const completeOnboarding = () => {
    setShowOnboarding(false);
    // Show email prompt if they still don't have one after onboarding
    if (!user?.email) {
      setShowEmailPrompt(true);
    }
  };

  const dismissEmailPrompt = () => {
    setShowEmailPrompt(false);
  };

  const refreshToken = async () => {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      localStorage.setItem('token', token);
    }
  };

  // Get Firebase ID token for socket authentication
  const getIdToken = async () => {
    if (auth.currentUser) {
      return await auth.currentUser.getIdToken();
    }
    return null;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signOut, 
      updateDisplayName,
      updateEmail,
      refreshToken,
      getIdToken,  // Added for chat/socket authentication
      showOnboarding,
      completeOnboarding,
      showEmailPrompt,
      dismissEmailPrompt
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);