import React, { useState, useEffect } from 'react'
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom'
import { initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth'
import { getFirestore, doc, getDoc } from 'firebase/firestore'
import Dashboard from './components/Dashboard'
import QRScanner from './components/QRScanner'
import Shop from './components/Shop'
import AdminDashboard from './components/AdminDashboard'
import Login from './components/Login'
import Solver from './components/Solver'
import GroupManagement from './components/TeamManagement'
import UserManagement from './components/UserManagement'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

function App () {
  const [user, setUser] = useState(null)
  const [isAdmin, setIsAdmin] = useState(null)
  const [initialRedirect, setInitialRedirect] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        setUser(user)
        const userRef = doc(db, 'users', user.uid)
        const userSnap = await getDoc(userRef)
        if (userSnap.exists() && userSnap.data().isAdmin) {
          setIsAdmin(true)
        } else {
          setIsAdmin(false)
        }
      } else {
        setUser(null)
        setIsAdmin(null)
      }
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (user !== null && isAdmin !== null && !initialRedirect) {
      if (isAdmin) {
        navigate('/admin')
      } else {
        navigate('/dashboard')
      }
      setInitialRedirect(true)
    }
  }, [user, isAdmin, navigate, initialRedirect])

  const handleLogout = async () => {
    await signOut(auth)
    setInitialRedirect(false)
    navigate('/login')
  }

  return (
    <div>
      {user && (
        <button
          onClick={handleLogout}
          style={{ position: 'absolute', top: 10, right: 10 }}
        >
          Logout
        </button>
      )}
      <Routes>
        <Route path='/login' element={<Login auth={auth} />} />
        <Route
          path='/dashboard'
          element={
            user ? <Dashboard user={user} db={db} /> : <Navigate to='/login' />
          }
        />
        <Route
          path='/qrscanner'
          element={
            user ? <QRScanner user={user} db={db} /> : <Navigate to='/login' />
          }
        />
        <Route
          path='/shop'
          element={
            user ? <Shop user={user} db={db} /> : <Navigate to='/login' />
          }
        />
        <Route
          path='/solver'
          element={
            user ? <Solver user={user} db={db} /> : <Navigate to='/login' />
          }
        />
        <Route
          path='/admin'
          element={
            user && isAdmin ? (
              <AdminDashboard db={db} />
            ) : (
              <Navigate to='/login' />
            )
          }
        />
        <Route
          path='/admin/teams'
          element={
            user && isAdmin ? (
              <GroupManagement db={db} />
            ) : (
              <Navigate to='/login' />
            )
          }
        />
        <Route
          path='/admin/users'
          element={
            user && isAdmin ? (
              <UserManagement db={db} />
            ) : (
              <Navigate to='/login' />
            )
          }
        />
      </Routes>
    </div>
  )
}

export default App
