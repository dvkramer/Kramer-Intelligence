
import { loadFirebaseConfig } from './firebase-config.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
    getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut, sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
    getFirestore, doc, setDoc, getDoc, addDoc, collection, query, where,
    getDocs, onSnapshot, serverTimestamp, orderBy, updateDoc, arrayUnion,
    writeBatch, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

let auth;
let firestore;
let app;

export async function initFirebase() {
    if (app) return { auth, firestore }; // Already initialized

    const config = await loadFirebaseConfig();
    const firebaseConfig = {
        apiKey: config.apiKey,
        authDomain: "kramer-intelligence-chat.firebaseapp.com",
        projectId: "kramer-intelligence-chat",
        storageBucket: "kramer-intelligence-chat.firebasestorage.app",
        messagingSenderId: "467599486032",
        appId: "1:467599486032:web:63b0d6510b8cad07477555"
    };

    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    firestore = getFirestore(app);
    console.log("Firebase initialized");
    return { auth, firestore };
}

export {
    auth, firestore,
    createUserWithEmailAndPassword, signInWithEmailAndPassword,
    onAuthStateChanged, signOut, sendPasswordResetEmail,
    doc, setDoc, getDoc, addDoc, collection, query, where,
    getDocs, onSnapshot, serverTimestamp, orderBy, updateDoc,
    arrayUnion, writeBatch, deleteDoc
};
