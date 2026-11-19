import { browserLocalPersistence, Persistence } from 'firebase/auth';

// Browsers keep the signed-in session in local storage so it survives reloads.
export function getAuthPersistence(): Persistence {
  return browserLocalPersistence;
}
