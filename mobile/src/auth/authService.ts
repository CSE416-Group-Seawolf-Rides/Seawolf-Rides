import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';

import { getFirebaseAuth } from '../firebase/firebase';
import { EmailCredentials, isStonyBrookEmail, normalizeEmail } from './authValidation';

export type AuthProvider = 'google' | 'email';

export interface AuthUser {
  id: string;
  email: string;
  provider: AuthProvider;
}

export type AuthServiceErrorCode =
  | 'email-already-in-use'
  | 'email-not-verified'
  | 'invalid-credential'
  | 'invalid-email-domain'
  | 'network-error'
  | 'operation-not-allowed'
  | 'too-many-requests'
  | 'unknown'
  | 'user-disabled'
  | 'weak-password';

export class AuthServiceError extends Error {
  constructor(
    public readonly code: AuthServiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AuthServiceError';
  }
}

function requireStonyBrookEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!isStonyBrookEmail(normalized)) {
    throw new AuthServiceError(
      'invalid-email-domain',
      'Use your @stonybrook.edu email address.',
    );
  }
  return normalized;
}

function firebaseErrorCode(error: unknown): string | null {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code;
  }
  return null;
}

export function toAuthServiceError(error: unknown): AuthServiceError {
  if (error instanceof AuthServiceError) {
    return error;
  }

  switch (firebaseErrorCode(error)) {
    case 'auth/email-already-in-use':
      return new AuthServiceError(
        'email-already-in-use',
        'An account already exists for that email. Sign in instead.',
      );
    case 'auth/invalid-credential':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return new AuthServiceError(
        'invalid-credential',
        'The email or password is incorrect.',
      );
    case 'auth/user-disabled':
      return new AuthServiceError('user-disabled', 'This account has been disabled.');
    case 'auth/weak-password':
      return new AuthServiceError('weak-password', 'Use a stronger password and try again.');
    case 'auth/too-many-requests':
      return new AuthServiceError(
        'too-many-requests',
        'Too many attempts. Wait a few minutes and try again.',
      );
    case 'auth/network-request-failed':
      return new AuthServiceError(
        'network-error',
        'Check your internet connection and try again.',
      );
    case 'auth/operation-not-allowed':
      return new AuthServiceError(
        'operation-not-allowed',
        'Email sign-in is not enabled for this Firebase project yet.',
      );
    case 'auth/configuration-not-found':
      return new AuthServiceError(
        'operation-not-allowed',
        'Firebase Authentication has not been enabled for this project yet.',
      );
    case 'auth/invalid-email':
      return new AuthServiceError(
        'invalid-email-domain',
        'Use your @stonybrook.edu email address.',
      );
    default:
      return new AuthServiceError('unknown', 'Something went wrong. Try again.');
  }
}

export function authUserFromFirebase(user: User): AuthUser {
  if (!user.email || !isStonyBrookEmail(user.email)) {
    throw new AuthServiceError(
      'invalid-email-domain',
      'Only verified @stonybrook.edu accounts can use Seawolf Rides.',
    );
  }

  const provider: AuthProvider = user.providerData.some(
    ({ providerId }) => providerId === 'google.com',
  )
    ? 'google'
    : 'email';
  return { id: user.uid, email: normalizeEmail(user.email), provider };
}

export async function signInWithEmail({ email, password }: EmailCredentials): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      requireStonyBrookEmail(email),
      password,
    );
    authUserFromFirebase(credential.user);

    if (!credential.user.emailVerified) {
      try {
        await sendEmailVerification(credential.user);
      } finally {
        await firebaseSignOut(auth);
      }
      throw new AuthServiceError(
        'email-not-verified',
        'Verify your Stony Brook email before signing in. We sent you a new verification link.',
      );
    }
  } catch (error) {
    throw toAuthServiceError(error);
  }
}

export async function registerWithEmail({ email, password }: EmailCredentials): Promise<void> {
  const auth = getFirebaseAuth();
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      requireStonyBrookEmail(email),
      password,
    );
    try {
      await sendEmailVerification(credential.user);
    } finally {
      await firebaseSignOut(auth);
    }
  } catch (error) {
    throw toAuthServiceError(error);
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), requireStonyBrookEmail(email));
  } catch (error) {
    // Do not reveal whether a campus email has an account.
    if (firebaseErrorCode(error) === 'auth/user-not-found') {
      return;
    }
    throw toAuthServiceError(error);
  }
}

export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(getFirebaseAuth());
  } catch (error) {
    throw toAuthServiceError(error);
  }
}
