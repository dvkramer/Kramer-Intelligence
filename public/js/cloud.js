import { checkDocument, storedMessage, newId } from "./model.js";

let connection;
export async function connectCloud() {
  if (connection) return connection;
  connection = initialize().catch((error) => {
    connection = null;
    throw error;
  });
  return connection;
}
async function initialize() {
  const [response, appSdk, authSdk, dbSdk] = await Promise.all([
    fetch("/api/config", { signal: AbortSignal.timeout(12_000) }),
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js"),
  ]);
  if (!response.ok)
    throw new Error(
      "Cloud accounts are temporarily unavailable. You can still chat without signing in.",
    );
  const config = await response.json();
  if (!config.apiKey)
    throw new Error(
      "Cloud accounts are not configured. You can still chat without signing in.",
    );
  const app = appSdk.initializeApp({
    apiKey: config.apiKey,
    authDomain: "kramer-intelligence-chat.firebaseapp.com",
    projectId: "kramer-intelligence-chat",
    storageBucket: "kramer-intelligence-chat.firebasestorage.app",
    messagingSenderId: "467599486032",
    appId: "1:467599486032:web:63b0d6510b8cad07477555",
  });
  const auth = authSdk.getAuth(app),
    db = dbSdk.getFirestore(app);
  const {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    arrayUnion,
    writeBatch,
    limit,
  } = dbSdk;
  return {
    onAuth: (callback) => authSdk.onAuthStateChanged(auth, callback),
    login: (email, password) =>
      authSdk.signInWithEmailAndPassword(auth, email, password),
    signup: async (email, password) => {
      const { user } = await authSdk.createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      await setDoc(doc(db, "users", user.uid), { email: user.email });
    },
    logout: () => authSdk.signOut(auth),
    reset: (email) => authSdk.sendPasswordResetEmail(auth, email),
    list: async (uid) => {
      const snapshot = await getDocs(
        query(
          collection(db, "chats"),
          where("collaborators", "array-contains", uid),
        ),
      );
      return snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort(
          (a, b) =>
            (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0),
        );
    },
    get: async (id) => {
      const d = await getDoc(doc(db, "chats", id));
      if (!d.exists()) throw new Error("Chat not found.");
      return { id: d.id, ...d.data() };
    },
    listen: (id, receive, fail) =>
      onSnapshot(
        query(collection(db, "chats", id, "messages"), orderBy("createdAt")),
        (snapshot) => {
          receive(
            snapshot.docs.map((d) => ({
              ...d.data(),
              firestoreId: d.id,
              id: d.data().id || d.id,
            })),
          );
        },
        fail,
      ),
    create: async (id, title, uid) => {
      const ref = doc(db, "chats", id);
      const existing = await getDoc(ref).catch((error) => {
        if (error.code === "permission-denied") return null;
        throw error;
      });
      if (!existing?.exists())
        await setDoc(ref, {
          title,
          ownerId: uid,
          collaborators: [uid],
          createdAt: serverTimestamp(),
        });
    },
    append: async (chatId, message) => {
      checkDocument(message);
      // Stable IDs make retrying an interrupted save idempotent. Old auto IDs still load normally.
      const id = message.firestoreId || message.id || newId();
      const ref = doc(db, "chats", chatId, "messages", id);
      const existing = await getDoc(ref).catch((error) => {
        if (error.code === "permission-denied") return null;
        throw error;
      });
      if (!existing?.exists())
        await setDoc(ref, {
          ...storedMessage(message),
          createdAt: serverTimestamp(),
        });
      return id;
    },
    edit: async (chatId, message) => {
      checkDocument(message);
      await updateDoc(
        doc(db, "chats", chatId, "messages", message.firestoreId || message.id),
        { parts: message.parts },
      );
    },
    share: async (chatId, email) => {
      const users = await getDocs(
        query(collection(db, "users"), where("email", "==", email.trim())),
      );
      if (users.empty)
        throw new Error("No account found with that email address.");
      await updateDoc(doc(db, "chats", chatId), {
        collaborators: arrayUnion(users.docs[0].id),
      });
    },
    remove: async (id) => {
      // Bound batches so large conversations can be deleted without an oversized commit.
      while (true) {
        const messages = await getDocs(
          query(collection(db, "chats", id, "messages"), limit(200)),
        );
        if (messages.empty) break;
        const batch = writeBatch(db);
        messages.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
      await deleteDoc(doc(db, "chats", id));
    },
  };
}
