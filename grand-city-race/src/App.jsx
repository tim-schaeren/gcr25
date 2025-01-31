import React, { useState, useEffect } from "react";
import { Route, Routes, Navigate } from "react-router-dom";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import Dashboard from "./components/Dashboard";
import QRScanner from "./components/QRScanner";
import Shop from "./components/Shop";
import AdminDashboard from "./components/AdminDashboard";
import Login from "./components/Login";

const firebaseConfig = {
  apiKey: "AIzaSyDiFZdUCZrpTOq_cfWTziNzvG3jo9oCuOM",
  authDomain: "grand-city-race.firebaseapp.com",
  projectId: "grand-city-race",
  storageBucket: "grand-city-race.firebasestorage.app",
  messagingSenderId: "633865569478",
  appId: "1:633865569478:web:e03a94f2c6c144c6e003c7",
  measurementId: "G-MR1WGD0QVS"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" />} />
      <Route path="/login" element={<Login auth={auth} />} />
      <Route path="/dashboard" element={user ? <Dashboard user={user} db={db} /> : <Navigate to="/login" />} />
      <Route path="/qrscanner" element={user ? <QRScanner user={user} db={db} /> : <Navigate to="/login" />} />
      <Route path="/shop" element={user ? <Shop user={user} db={db} /> : <Navigate to="/login" />} />
      <Route path="/admin" element={user && user.isAdmin ? <AdminDashboard db={db} /> : <Navigate to="/login" />} />
    </Routes>
  );
}

export default App;