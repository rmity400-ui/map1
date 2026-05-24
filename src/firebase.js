// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBGExtb5ZiemY3wWpWj_fbp5rp6BbaDbcc",
  authDomain: "school-app-36954.firebaseapp.com",
  databaseURL: "https://school-app-36954-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "school-app-36954",
  storageBucket: "school-app-36954.firebasestorage.app",
  messagingSenderId: "449537720077",
  appId: "1:449537720077:web:e206b310294713276a7a44",
  measurementId: "G-BBCLLG82HD"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);