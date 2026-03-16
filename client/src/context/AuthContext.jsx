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
    // Safety timeout - never stay stuck on loading screen
    const loadingTimeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.warn('Auth loading timed out after 10s — forcing load');
          return false;
        }
        return prev;
      });
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Use cached token first (fast), authFetch will refresh on 401
          const token = await firebaseUser.getIdToken();
          localStorage.setItem('token', token);

          const userData = await userAPI.getOrCreateUser({
            firebaseUid: firebaseUser.uid,
            phone: firebaseUser.phoneNumber,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName
          });

          setUser({ ...userData, firebaseUser });

          // Show onboarding for users who haven't completed it
          if (!userData.onboardingComplete) {
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

    return () => {
      clearTimeout(loadingTimeout);
      unsubscribe();
    };
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

  const updateEmail = async (email) => {
    const result = await userAPI.updateEmail(email);
    if (result.success) {
      setUser(prev => ({ ...prev, email: result.email }));
    }
    return result;
  };

  const updateProfile = async (data) => {
    const result = await userAPI.updateProfile(data);
    if (result.success) {
      setUser(prev => ({
        ...prev,
        firstName: result.firstName,
        lastName: result.lastName,
        displayName: result.displayName,
        email: result.email,
        phone: result.phone
      }));
    }
    return result;
  };

  const uploadProfileImage = async (imageData) => {
    const result = await userAPI.uploadProfileImage(imageData);
    if (result.success) {
      setUser(prev => ({ ...prev, profileImageUrl: result.profileImageUrl }));
    }
    return result;
  };

  const removeProfileImage = async () => {
    const result = await userAPI.removeProfileImage();
    if (result.success) {
      setUser(prev => ({ ...prev, profileImageUrl: null }));
    }
    return result;
  };

  const completeOnboarding = async () => {
    try {
      await userAPI.completeOnboarding();
      setUser(prev => ({ ...prev, onboardingComplete: true }));
      setShowOnboarding(false);
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    }
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
      updateProfile,
      uploadProfileImage,
      removeProfileImage,
      refreshToken,
      getIdToken,
      showOnboarding,
      completeOnboarding
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
