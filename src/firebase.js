import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCI_tVNoyuaW2_HzkgRquLvditvSsElKTM",
  authDomain: "nutrition-tracker-ua.firebaseapp.com",
  projectId: "nutrition-tracker-ua",
  storageBucket: "nutrition-tracker-ua.firebasestorage.app",
  messagingSenderId: "247002137352",
  appId: "1:247002137352:web:3d9eea278b486fecce62bd"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
