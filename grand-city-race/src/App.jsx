import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate, useNavigate } from 'react-router-dom';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import Dashboard from './components/user/Dashboard';
import Chat from './components/user/Chat';
import Shop from './components/user/Shop';
import AdminDashboard from './components/admin/AdminDashboard';
import Login from './components/user/Login';
import Solver from './components/user/Solver';
import GroupManagement from './components/admin/TeamManagement';
import UserManagement from './components/admin/UserManagement';
import QuestManagement from './components/admin/QuestManagement';
import ItemManagement from './components/admin/ItemManagement';
import EventSignup from './components/user/EventSignup';
import RegistrationManagement from './components/admin/RegistrationManagement';
import SettingsPage from './components/admin/SettingsPage';
import MessagesPage from './components/admin/Messages';

const firebaseConfig = {
	apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
	authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
	projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
	storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
	messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
	appId: import.meta.env.VITE_FIREBASE_APP_ID,
	measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

function App() {
	const [user, setUser] = useState(null);
	const [isAdmin, setIsAdmin] = useState(null);
	const [initialRedirect, setInitialRedirect] = useState(false);
	const navigate = useNavigate();

	useEffect(() => {
		const unsubscribe = onAuthStateChanged(auth, async (user) => {
			if (user) {
				setUser(user);
				const userRef = doc(db, 'users', user.uid);
				const userSnap = await getDoc(userRef);
				if (userSnap.exists() && userSnap.data().isAdmin) {
					setIsAdmin(true);
				} else {
					setIsAdmin(false);
				}
			} else {
				setUser(null);
				setIsAdmin(null);
			}
		});
		return () => unsubscribe();
	}, []);

	useEffect(() => {
		if (user !== null && isAdmin !== null && !initialRedirect) {
			if (isAdmin) {
				navigate('/admin');
			} else {
				navigate('/dashboard');
			}
			setInitialRedirect(true);
		}
	}, [user, isAdmin, navigate, initialRedirect]);

	const handleLogout = async () => {
		await signOut(auth);
		setInitialRedirect(false);
		navigate('/login');
	};

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
				<Route path="/" element={<EventSignup db={db} />} />
				<Route path="/login" element={<Login auth={auth} />} />
				<Route path="/event-signup" element={<EventSignup db={db} />} />
				<Route
					path="/thank-you"
					element={
						<div
							style={{
								width: '100vw',
								minHeight: '100vh',
								backgroundColor: '#000000',
								color: '#ffffff',
								display: 'flex',
								justifyContent: 'center',
								alignItems: 'center',
								fontFamily: "'Poppins', sans-serif",
								padding: '0 1.5rem',
								boxSizing: 'border-box',
								textAlign: 'center',
							}}
						>
							Thank you for joining the waitlist.
							<br />
							We will be in touch.
							<br />
							<br />
							<br />
							GCR 25
						</div>
					}
				/>

				<Route
					path="/dashboard"
					element={
						user ? <Dashboard user={user} db={db} /> : <Navigate to="/login" />
					}
				/>
				<Route
					path="/chat"
					element={
						user ? <Chat user={user} db={db} /> : <Navigate to="/login" />
					}
				/>
				<Route
					path="/shop"
					element={
						user ? <Shop user={user} db={db} /> : <Navigate to="/login" />
					}
				/>
				<Route
					path="/solver"
					element={
						user ? <Solver user={user} db={db} /> : <Navigate to="/login" />
					}
				/>
				<Route
					path="/admin"
					element={
						user && isAdmin ? (
							<AdminDashboard db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/teams"
					element={
						user && isAdmin ? (
							<GroupManagement db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/users"
					element={
						user && isAdmin ? (
							<UserManagement db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/quests"
					element={
						user && isAdmin ? (
							<QuestManagement db={db} storage={storage} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/items"
					element={
						user && isAdmin ? (
							<ItemManagement db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/registrations"
					element={
						user && isAdmin ? (
							<RegistrationManagement db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/settings"
					element={
						user && isAdmin ? (
							<SettingsPage db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
				<Route
					path="/admin/messages"
					element={
						user && isAdmin ? (
							<MessagesPage db={db} />
						) : (
							<Navigate to="/login" />
						)
					}
				/>
			</Routes>
		</div>
	);
}

export default App;
