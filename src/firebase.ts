import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyBTO3EozvPHWzOYpRP7ESuRI0bVah5S5vc",
  authDomain: "pamoja-plus-eb0a0.firebaseapp.com",
  projectId: "pamoja-plus-eb0a0",
  storageBucket: "pamoja-plus-eb0a0.firebasestorage.app",
  messagingSenderId: "806015011632",
  appId: "1:806015011632:web:cd1b9ffdf790b95e9fd6f5",
  measurementId: "G-9L6B1V2VS3"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;