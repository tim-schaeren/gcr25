// src/components/admin/AdminSidebar.jsx
import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';

export default function AdminSidebar({ db }) {
	const [unreadTeams, setUnreadTeams] = useState(new Set());
	const location = useLocation();

	useEffect(() => {
		// Listen for any team→admin messages that are still unread
		const unreadGlobalQuery = query(
			collection(db, 'messages'),
			where('to', '==', 'admin'),
			where('readByAdmin', '==', false)
		);
		const unsubscribe = onSnapshot(unreadGlobalQuery, (snapshot) => {
			const newSet = new Set();
			snapshot.docs.forEach((docSnap) => {
				const data = docSnap.data();
				if (data.from) {
					newSet.add(data.from);
				}
			});
			setUnreadTeams(newSet);
		});

		return () => unsubscribe();
	}, [db]);

	// Helper to apply “active” styling if the current path matches
	const linkBaseClasses = 'p-3 rounded-lg text-white';
	const inactiveGray = 'bg-gray-800 hover:bg-gray-700';
	const activeGray = 'bg-gray-700';

	const messagesClasses = `relative p-3 rounded-lg text-white mt-4 ${
		location.pathname === '/admin/messages'
			? 'bg-blue-700'
			: 'bg-blue-600 hover:bg-blue-700'
	}`;

	return (
		<aside className="w-64 bg-white shadow-lg rounded-lg p-6 flex flex-col">
			<h3 className="text-xl font-bold mb-4">Admin Menu</h3>

			<nav className="flex flex-col space-y-4 flex-grow">
				<Link
					to="/admin"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin' ? activeGray : inactiveGray
					}`}
				>
					Leaderboard
				</Link>

				<Link
					to="/admin/users"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin/users' ? activeGray : inactiveGray
					}`}
				>
					Users
				</Link>

				<Link
					to="/admin/teams"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin/teams' ? activeGray : inactiveGray
					}`}
				>
					Teams
				</Link>

				<Link
					to="/admin/quests"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin/quests' ? activeGray : inactiveGray
					}`}
				>
					Quests
				</Link>

				<Link
					to="/admin/items"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin/items' ? activeGray : inactiveGray
					}`}
				>
					Items
				</Link>

				<Link
					to="/admin/registrations"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin/registrations'
							? activeGray
							: inactiveGray
					}`}
				>
					Registrations
				</Link>

				<Link
					to="/admin/settings"
					className={`${linkBaseClasses} ${
						location.pathname === '/admin/settings' ? activeGray : inactiveGray
					}`}
				>
					Settings
				</Link>

				<Link to="/admin/messages" className={messagesClasses}>
					✉️ Messages
					{unreadTeams.size > 0 && (
						<span className="absolute top-2 right-2 block h-4 w-4 bg-red-500 rounded-full" />
					)}
				</Link>
			</nav>
		</aside>
	);
}
