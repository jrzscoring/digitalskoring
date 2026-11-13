import { getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { doc, getDocFromServer, getFirestore, type Firestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

export interface WindowFirebaseConfig extends FirebaseOptions {
  apiKey: string;
  authDomain: string;
  databaseURL?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId: string;
  measurementId?: string;
  firestoreDatabaseId?: string;
}

declare global {
  interface Window {
    firebaseConfig?: WindowFirebaseConfig;
  }
}

export function getWindowFirebaseConfig(): WindowFirebaseConfig | null {
  if (typeof window !== 'undefined' && window.firebaseConfig?.apiKey && window.firebaseConfig?.projectId) {
    return window.firebaseConfig;
  }
  return null;
}

// 1. Initialize Firebase from window.firebaseConfig (from index.html) when available
const windowConfig = getWindowFirebaseConfig();
const primaryConfig: WindowFirebaseConfig = windowConfig || (appletConfig as WindowFirebaseConfig);

const existingPrimary = getApps().find((a) => a.name === '[DEFAULT]');
export const firebaseApp: FirebaseApp = existingPrimary || initializeApp(primaryConfig);

// 2. Also keep AI Studio provisioned Firestore config ready when appletConfig differs from window.firebaseConfig
const hasSeparateAppletProject =
  Boolean(windowConfig) &&
  Boolean(appletConfig.projectId) &&
  appletConfig.projectId !== windowConfig?.projectId;

const appletApp: FirebaseApp = hasSeparateAppletProject
  ? getApps().find((a) => a.name === 'aistudio-firestore') ||
    initializeApp(appletConfig, 'aistudio-firestore')
  : firebaseApp;

export const db: Firestore = appletConfig.firestoreDatabaseId
  ? getFirestore(appletApp, appletConfig.firestoreDatabaseId)
  : getFirestore(appletApp);

export const userFirestore: Firestore = getFirestore(firebaseApp);
export const auth = getAuth(appletApp);
export const googleProvider = new GoogleAuthProvider();

let rtdbInstance: Database | null = null;
let rtdbProjectId: string | null = null;

if (windowConfig?.databaseURL) {
  try {
    rtdbInstance = getDatabase(firebaseApp, windowConfig.databaseURL);
    rtdbProjectId = windowConfig.projectId || null;
  } catch (err) {
    console.warn('Gagal inisialisasi Firebase Realtime Database:', err);
  }
}

export const rtdb = rtdbInstance;
export const userRtdbProjectId = rtdbProjectId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
