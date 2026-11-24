import { getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getAuth,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  type FirestoreSettings,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  initializeFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  sanitizeAdminRecordPayload,
  sanitizeBlogPayload,
  sanitizeCertificatePayload,
  sanitizeId,
  sanitizePlanPayload,
  sanitizeSiteConfigPayload,
  sanitizeUserPrivatePayload,
  sanitizeUserPublicPayload,
} from "./firebase-schema";

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

function createFirestoreDb() {
  const isBrowser = typeof window !== "undefined" && !isVitestEnv();
  if (isBrowser) {
    try {
      const settings: FirestoreSettings & { useFetchStreams?: boolean } = {
        experimentalForceLongPolling: true,
        useFetchStreams: false,
      };
      return initializeFirestore(
        app,
        settings,
        firebaseConfig.firestoreDatabaseId,
      );
    } catch {
      return getFirestore(app, firebaseConfig.firestoreDatabaseId);
    }
  }
  return getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

// CRITICAL: Always bind the provisioned named Firestore database from firebase-applet-config.json
export const db = createFirestoreDb();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
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
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid ?? null,
      email: auth.currentUser?.email ?? null,
      emailVerified: auth.currentUser?.emailVerified ?? null,
      isAnonymous: auth.currentUser?.isAnonymous ?? null,
      tenantId: auth.currentUser?.tenantId ?? null,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) ?? [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isVitestEnv(): boolean {
  return (
    typeof process !== "undefined" &&
    Boolean(process.env["VITEST"] || process.env["NODE_ENV"] === "test")
  );
}

let connectionTested = false;

export async function testConnection(): Promise<boolean> {
  if (typeof window === "undefined" || isVitestEnv()) return false;
  if (connectionTested) return true;
  connectionTested = true;
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
    return false;
  }
}

export function isFirebaseAdminUser(
  user: FirebaseUser | null | undefined = auth.currentUser,
) {
  return Boolean(
    user?.emailVerified &&
    user.email?.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL,
  );
}

export async function signInWithGooglePopup() {
  googleProvider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, googleProvider);
}

export async function signOutFirebaseSafely() {
  try {
    await firebaseSignOut(auth);
  } catch (err) {
    console.warn("[firebase] Sign-out error handled gracefully:", err);
  }
}

export async function upsertUserProfileInFirestore(firebaseUser: FirebaseUser) {
  if (!firebaseUser?.uid) return null;
  const uid = sanitizeId(firebaseUser.uid, firebaseUser.uid);
  const userPath = `users/${uid}`;
  const privatePath = `users/${uid}/private/info`;
  const isAdminEmail =
    Boolean(firebaseUser.emailVerified) &&
    firebaseUser.email?.trim().toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL;

  let existingPublic = null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) existingPublic = snap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, userPath);
  }

  const publicPayload = sanitizeUserPublicPayload({
    uid,
    displayName: firebaseUser.displayName,
    email: firebaseUser.email,
    role: isAdminEmail
      ? "admin"
      : existingPublic?.["role"] === "admin"
        ? "admin"
        : "user",
  });

  if (!existingPublic) {
    try {
      await setDoc(doc(db, "users", uid), {
        ...publicPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, userPath);
    }
  } else {
    try {
      await updateDoc(doc(db, "users", uid), {
        displayName: publicPayload.displayName,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, userPath);
    }
  }

  let existingPrivate = null;
  try {
    const privSnap = await getDoc(doc(db, "users", uid, "private", "info"));
    if (privSnap.exists()) existingPrivate = privSnap.data();
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, privatePath);
  }

  const privatePayload = sanitizeUserPrivatePayload({
    uid,
    email: firebaseUser.email || `${uid}@users.indifunded.com`,
    phone: firebaseUser.phoneNumber || "",
    kycStatus: "none",
  });

  if (!existingPrivate) {
    try {
      await setDoc(doc(db, "users", uid, "private", "info"), {
        ...privatePayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, privatePath);
    }
  } else {
    try {
      await updateDoc(doc(db, "users", uid, "private", "info"), {
        email: privatePayload.email,
        phone: privatePayload.phone,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, privatePath);
    }
  }

  return publicPayload;
}

export async function fetchPublicSiteConfigFromFirestore(): Promise<Record<
  string,
  unknown
> | null> {
  if (typeof window === "undefined" || isVitestEnv()) return null;
  const path = "site_config/public";
  try {
    const snap = await getDoc(doc(db, "site_config", "public"));
    if (!snap.exists()) return null;
    const data = snap.data();
    return data && typeof data === "object"
      ? (data as Record<string, unknown>)
      : null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/offline|unavailable|network/i.test(msg)) return null;
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function savePublicSiteConfigToFirestore(
  settings: Record<string, unknown>,
) {
  const path = "site_config/public";
  const sanitized = sanitizeSiteConfigPayload(settings, "public");
  try {
    await setDoc(doc(db, "site_config", "public"), {
      ...sanitized,
      id: "public",
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function fetchPublicPlansFromFirestore(): Promise<
  Record<string, unknown>[]
> {
  if (typeof window === "undefined" || isVitestEnv()) return [];
  const path = "plans";
  try {
    const q = query(collection(db, path), where("account_size", ">=", 0));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/offline|unavailable|network/i.test(msg)) return [];
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function savePlanToFirestore(plan: Record<string, unknown>) {
  const sanitized = sanitizePlanPayload(plan);
  const planId = String(sanitized["id"]);
  const path = `plans/${planId}`;
  try {
    await setDoc(doc(db, "plans", planId), {
      ...sanitized,
      updatedAt: serverTimestamp(),
    });
    return sanitized;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePlanFromFirestore(planId: string) {
  const safeId = sanitizeId(planId, "plan");
  const path = `plans/${safeId}`;
  try {
    await deleteDoc(doc(db, "plans", safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchPublishedBlogsFromFirestore(): Promise<
  Record<string, unknown>[]
> {
  if (typeof window === "undefined" || isVitestEnv()) return [];
  const path = "blogs";
  try {
    const q = query(collection(db, path), where("published", "==", true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/offline|unavailable|network/i.test(msg)) return [];
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveBlogToFirestore(blog: Record<string, unknown>) {
  const sanitized = sanitizeBlogPayload(blog);
  const blogId = String(sanitized["id"]);
  const path = `blogs/${blogId}`;
  try {
    await setDoc(doc(db, "blogs", blogId), {
      ...sanitized,
      updatedAt: serverTimestamp(),
    });
    return sanitized;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteBlogFromFirestore(blogId: string) {
  const safeId = sanitizeId(blogId, "blog");
  const path = `blogs/${safeId}`;
  try {
    await deleteDoc(doc(db, "blogs", safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchVisibleCertificatesFromFirestore(): Promise<
  Record<string, unknown>[]
> {
  if (typeof window === "undefined" || isVitestEnv()) return [];
  const path = "certificates";
  try {
    const q = query(collection(db, path), where("visible", "==", true));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/offline|unavailable|network/i.test(msg)) return [];
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveCertificateToFirestore(
  cert: Record<string, unknown>,
) {
  const sanitized = sanitizeCertificatePayload(cert);
  const certId = String(sanitized["id"]);
  const path = `certificates/${certId}`;
  try {
    await setDoc(doc(db, "certificates", certId), {
      ...sanitized,
      updatedAt: serverTimestamp(),
    });
    return sanitized;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCertificateFromFirestore(certId: string) {
  const safeId = sanitizeId(certId, "cert");
  const path = `certificates/${safeId}`;
  try {
    await deleteDoc(doc(db, "certificates", safeId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function fetchMyTraderAccountsFromFirestore(
  uid: string,
): Promise<Record<string, unknown>[]> {
  if (typeof window === "undefined" || isVitestEnv() || !uid) return [];
  const safeUid = sanitizeId(uid, uid);
  const path = "trader_accounts";
  try {
    const q = query(collection(db, path), where("uid", "==", safeUid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Record<string, unknown>);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function syncCollectionsToFirestore(
  collectionsMap: Record<string, Record<string, unknown>[]>,
  siteSettings?: Record<string, unknown> | null,
): Promise<{ syncedCount: number; updatedAt: string }> {
  const currentUser = auth.currentUser;
  if (!isFirebaseAdminUser(currentUser)) {
    throw new Error(
      "Sign in with your verified Google Admin account (growthloopp@gmail.com) first.",
    );
  }
  const updatedBy = currentUser?.email || BOOTSTRAPPED_ADMIN_EMAIL;
  const tasks: Array<() => Promise<unknown>> = [];

  if (
    siteSettings &&
    typeof siteSettings === "object" &&
    Object.keys(siteSettings).length > 0
  ) {
    tasks.push(() => savePublicSiteConfigToFirestore(siteSettings));
  }

  for (const [colName, docs] of Object.entries(collectionsMap || {})) {
    if (!Array.isArray(docs)) continue;
    for (const rawDoc of docs) {
      if (!rawDoc || typeof rawDoc !== "object") continue;
      if (colName === "plans") {
        tasks.push(() => savePlanToFirestore(rawDoc));
      } else if (colName === "blogs") {
        tasks.push(() => saveBlogToFirestore(rawDoc));
      } else if (colName === "certificates") {
        tasks.push(() => saveCertificateToFirestore(rawDoc));
      }
      const record = sanitizeAdminRecordPayload(colName, rawDoc, updatedBy);
      const recordId = record.id;
      tasks.push(async () => {
        try {
          await setDoc(doc(db, "admin_records", recordId), {
            ...record,
            updatedAt: serverTimestamp(),
          });
        } catch (err) {
          handleFirestoreError(
            err,
            OperationType.WRITE,
            `admin_records/${recordId}`,
          );
        }
      });
    }
  }

  const chunkSize = 12;
  for (let i = 0; i < tasks.length; i += chunkSize) {
    await Promise.all(tasks.slice(i, i + chunkSize).map((fn) => fn()));
  }

  return { syncedCount: tasks.length, updatedAt: new Date().toISOString() };
}

export async function fetchCloudDatabaseSummary(): Promise<{
  connected: boolean;
  email: string;
  totalRecords: number;
  counts: Record<string, number>;
}> {
  if (
    typeof window === "undefined" ||
    isVitestEnv() ||
    !isFirebaseAdminUser()
  ) {
    return {
      connected: false,
      email: auth.currentUser?.email || "",
      totalRecords: 0,
      counts: {},
    };
  }
  const path = "admin_records";
  try {
    const snap = await getDocs(collection(db, path));
    const counts: Record<string, number> = {};
    for (const d of snap.docs) {
      const data = d.data() as Record<string, unknown>;
      const col = String(data["collection"] || "unknown");
      counts[col] = (counts[col] || 0) + 1;
    }
    return {
      connected: true,
      email: auth.currentUser?.email || BOOTSTRAPPED_ADMIN_EMAIL,
      totalRecords: snap.size,
      counts,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/offline|unavailable|network/i.test(msg)) {
      return {
        connected: false,
        email: auth.currentUser?.email || "",
        totalRecords: 0,
        counts: {},
      };
    }
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function fetchCloudDatabaseSnapshot(): Promise<{
  collections: Record<string, Record<string, unknown>[]>;
  siteConfig: Record<string, unknown> | null;
  totalRecords: number;
}> {
  if (!isFirebaseAdminUser()) {
    throw new Error(
      "Sign in with your verified Google Admin account (growthloopp@gmail.com) first.",
    );
  }
  const path = "admin_records";
  try {
    const [recordsSnap, siteConfig] = await Promise.all([
      getDocs(collection(db, path)),
      fetchPublicSiteConfigFromFirestore().catch(() => null),
    ]);
    const collections: Record<string, Record<string, unknown>[]> = {};
    for (const d of recordsSnap.docs) {
      const data = d.data() as Record<string, unknown>;
      const colName = String(data["collection"] || "").trim();
      const payload = data["payload"];
      if (
        !colName ||
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)
      )
        continue;
      if (!collections[colName]) collections[colName] = [];
      collections[colName]!.push(payload as Record<string, unknown>);
    }
    return { collections, siteConfig, totalRecords: recordsSnap.size };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}
