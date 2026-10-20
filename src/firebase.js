import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, initializeFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCI_tVNoyuaW2_HzkgRquLvditvSsElKTM",
  authDomain: "nutrition-tracker-ua.firebaseapp.com",
  projectId: "nutrition-tracker-ua",
  storageBucket: "nutrition-tracker-ua.firebasestorage.app",
  messagingSenderId: "247002137352",
  appId: "1:247002137352:web:3d9eea278b486fecce62bd"
};

export const IS_LOCAL_LAB = process.env.REACT_APP_LOCAL_LAB === '1';
export const IS_PHONE_LAB = process.env.REACT_APP_PHONE_LAB === '1';
if (IS_PHONE_LAB && (!IS_LOCAL_LAB || typeof window === 'undefined' || window.location.protocol !== 'https:' || window.location.origin !== process.env.REACT_APP_PHONE_ORIGIN)) throw new Error('Неправильна адреса захищеної лабораторії.');
if(IS_LOCAL_LAB && !IS_PHONE_LAB && typeof window !== 'undefined' && !['localhost','127.0.0.1'].includes(window.location.hostname)) {
  throw new Error('Лабораторний запуск потребує localhost. Для телефона спочатку налаштуйте погоджений HTTPS-проксі до емуляторів.');
}
const app = initializeApp(IS_LOCAL_LAB ? { apiKey:'demo-key',projectId:'demo-scisense',authDomain:'localhost' } : firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = IS_PHONE_LAB ? initializeFirestore(app,{host:window.location.host,ssl:true,experimentalForceLongPolling:true}) : getFirestore(app);

if (IS_PHONE_LAB) {
  connectAuthEmulator(auth,window.location.origin,{disableWarnings:true});
} else if (IS_LOCAL_LAB) {
  connectAuthEmulator(auth,'http://127.0.0.1:9099',{disableWarnings:true});
  connectFirestoreEmulator(db,'127.0.0.1',8088);
}
