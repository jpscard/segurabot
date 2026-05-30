import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithEmailAndPassword, sendPasswordResetEmail, signInAnonymously, EmailAuthProvider, linkWithCredential } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { OperationType } from '../domain';

// Keep track of Firestore/Auth restricted state locally to prevent slow network blocks when permissions are disabled
export let isFirebaseRestricted = localStorage.getItem('segurabot_firebase_restricted') === 'true';

export function setFirebaseRestricted(val: boolean) {
  isFirebaseRestricted = val;
  localStorage.setItem('segurabot_firebase_restricted', String(val));
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
// Force account selection screen on every login so users can choose another Gmail
googleProvider.setCustomParameters({ prompt: 'select_account' });

export async function loginAnonymously() {
  if (isFirebaseRestricted) {
    throw new Error('auth/admin-restricted-operation (Bypassed)');
  }
  try {
    const result = await signInAnonymously(auth);
    return result.user;
  } catch (error: any) {
    console.error('Anonymous Login error:', error);
    if (error && (error.code === 'auth/admin-restricted-operation' || error.code === 'auth/operation-not-allowed' || error.message?.includes('restricted-operation'))) {
      setFirebaseRestricted(true);
    }
    throw error;
  }
}

export async function linkAnonymousAccount(email: string, password: string) {
  try {
    const user = auth.currentUser;
    if (!user) {
      throw new Error("Nenhum usuário ativo para associar.");
    }
    const credential = EmailAuthProvider.credential(email, password);
    const result = await linkWithCredential(user, credential);
    return result.user;
  } catch (error) {
    console.error('Account Link error:', error);
    throw error;
  }
}

export async function loginWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
}

export async function loginDevAdmin() {
  try {
    const result = await signInWithEmailAndPassword(auth, 'admin@segurabot.com.br', 'password123');
    return result.user;
  } catch (error) {
    console.error('Dev Login error:', error);
    throw error;
  }
}

export async function loginWithEmail(email: string, password: string) {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  } catch (error) {
    console.error('Email Login error:', error);
    throw error;
  }
}

export async function sendPasswordRecovery(email: string) {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    console.error('Password recovery error:', error);
    throw error;
  }
}

export async function logout() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Logout error:', error);
    throw error;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// CRITICAL: Validate connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();
