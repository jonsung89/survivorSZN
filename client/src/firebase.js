import { initializeApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAJcnpe2GXU6PNmefcb3EJko9oDqMxNa3c",
  authDomain: "survivorszn.firebaseapp.com",
  projectId: "survivorszn",
  storageBucket: "survivorszn.firebasestorage.app",
  messagingSenderId: "872512716798",
  appId: "1:872512716798:web:491c590cae0ec0f6cc8aaf"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Phone auth helpers
export const setupRecaptcha = (containerId) => {
  if (!window.recaptchaVerifier) {
    window.recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: 'invisible',
      callback: () => {}
    });
  }
  return window.recaptchaVerifier;
};

export const sendVerificationCode = async (phoneNumber) => {
  const recaptchaVerifier = setupRecaptcha('recaptcha-container');
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
  window.confirmationResult = confirmationResult;
  return confirmationResult;
};

export const verifyCode = async (code) => {
  const result = await window.confirmationResult.confirm(code);
  return result.user;
};

export const signInWithGoogle = async () => {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
};
