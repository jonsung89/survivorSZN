import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { userAPI } from '../api';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
          
          setUser({ ...userData, firebaseUser });
          
          // Show onboarding for new users
          if (userData.isNewUser) {
            setShowOnboarding(true);
          }
        } catch (err) {
          console.error('Failed to sync user:', err);
          setUser(null);
        }
      } else {
        localStorage.removeItem('token');
        setUser(null);
        setShowOnboarding(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUser(null);
    setShowOnboarding(false);
  };

  const updateDisplayName = async (displayName) => {
    const result = await userAPI.updateDisplayName(displayName);
    if (result.displayName) {
      setUser(prev => ({ ...prev, displayName: result.displayName }));
    }
    return result;
  };

  const completeOnboarding = () => {
    setShowOnboarding(false);
  };

  const refreshToken = async () => {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken(true);
      localStorage.setItem('token', token);
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      signOut, 
      updateDisplayName, 
      refreshToken,
      showOnboarding,
      completeOnboarding
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);