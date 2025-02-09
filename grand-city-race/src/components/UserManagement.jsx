import React, { useEffect, useState } from 'react';
import {
	collection,
	onSnapshot,
	addDoc,
	doc,
	updateDoc,
	deleteDoc,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';

function UserManagement({ db }) {
	const [users, setUsers] = useState([]);
	const [teams, setTeams] = useState([]);

	// Modal state variables.
	const [isEditModalOpen, setEditModalOpen] = useState(false);
	const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);

	// The selected user for edit or delete.
	const [selectedUser, setSelectedUser] = useState(null);

	// Fields for creating/editing a user.
	const [newUserName, setNewUserName] = useState('');
	const [newUserEmail, setNewUserEmail] = useState('');
	const [newUserTeamId, setNewUserTeamId] = useState('');
	const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);

	// Fetch users via onSnapshot for real‑time updates.
	useEffect(() => {
		const usersRef = collection(db, 'users');
		const unsubscribe = onSnapshot(usersRef, (snapshot) => {
			const userList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			//userList.sort((a, b) => b.team.name - a.team.name)
			setUsers(userList);
		});
		return () => unsubscribe();
	}, [db]);

	// Fetch teams via onSnapshot.
	useEffect(() => {
		const teamsRef = collection(db, 'teams');
		const unsubscribe = onSnapshot(teamsRef, (snapshot) => {
			const teamList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setTeams(teamList);
		});
		return () => unsubscribe();
	}, [db]);

	// Open edit modal and pre-populate the fields.
	const openEditModal = (user) => {
		setSelectedUser(user);
		setNewUserName(user.name || '');
		setNewUserEmail(user.email || '');
		setNewUserTeamId(user.teamId || '');
		setNewUserIsAdmin(user.isAdmin || false);
		setEditModalOpen(true);
	};

	// Update an existing user.
	const updateUser = async () => {
		if (!selectedUser) return;
		const userRef = doc(db, 'users', selectedUser.id);
		await updateDoc(userRef, {
			name: newUserName,
			email: newUserEmail,
			isAdmin: newUserIsAdmin,
			teamId: newUserIsAdmin ? null : newUserTeamId,
		});
		// Clear fields and close modal.
		setSelectedUser(null);
		setNewUserName('');
		setNewUserEmail('');
		setNewUserTeamId('');
		setNewUserIsAdmin(false);
		setEditModalOpen(false);
	};

	// Delete a user.
	const deleteUser = async () => {
		if (!selectedUser) return;
		const userRef = doc(db, 'users', selectedUser.id);
		await deleteDoc(userRef);
		setSelectedUser(null);
		setDeleteModalOpen(false);
	};

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			{/* Prevent Mobile Access */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>

			{/* Actual Dashboard (only for larger screens) */}
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar */}
				<aside className="w-64 h-screen bg-white shadow-lg rounded-lg p-6 mr-8">
					<h3 className="text-xl font-bold mb-4">Admin Menu</h3>
					<nav className="flex flex-col space-y-4">
						<Link
							to="/admin"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Leaderboard
						</Link>
						<Link
							to="/admin/users"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Users
						</Link>
						<Link
							to="/admin/teams"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Teams
						</Link>
						<Link
							to="/admin/quests"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Quests
						</Link>
					</nav>
				</aside>

				{/* Main Content */}
				<div className="flex-1">
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							👥 User Management
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Name
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Email
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Team
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Is Admin
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{users.map((user) => {
									const userTeam = teams.find(
										(team) => team.id === user.teamId
									);
									return (
										<tr
											key={user.id}
											className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
										>
											<td className="border border-gray-300 p-4 text-black font-semibold">
												{user.name}
											</td>
											<td className="border border-gray-300 p-4 text-black">
												{user.email}
											</td>
											<td className="border border-gray-300 p-4 text-black">
												{userTeam ? userTeam.name : 'Unassigned'}
											</td>
											<td className="border border-gray-300 p-4 text-black">
												{user.isAdmin ? 'Yes' : 'No'}
											</td>
											<td className="border border-gray-300 p-4 text-black font-semibold">
												<button
													onClick={() => openEditModal(user)}
													className="text-blue-600 hover:text-blue-800 mr-2"
												>
													Edit
												</button>
												<button
													onClick={() => {
														setSelectedUser(user);
														setDeleteModalOpen(true);
													}}
													className="text-red-600 hover:text-red-800"
												>
													Delete
												</button>
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Edit User Modal */}
			{isEditModalOpen && selectedUser && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">Edit User</h3>
						<input
							type="text"
							placeholder="Name"
							value={newUserName}
							onChange={(e) => setNewUserName(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="email"
							placeholder="Email"
							value={newUserEmail}
							onChange={(e) => setNewUserEmail(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<div className="flex items-center mb-4">
							<input
								type="checkbox"
								checked={newUserIsAdmin}
								onChange={(e) => setNewUserIsAdmin(e.target.checked)}
								id="isAdminEdit"
								className="mr-2"
							/>
							<label htmlFor="isAdminEdit" className="font-semibold">
								Is Admin?
							</label>
						</div>
						<label className="block mb-2 font-semibold">Team</label>
						<select
							value={newUserIsAdmin ? '' : newUserTeamId}
							onChange={(e) => setNewUserTeamId(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
							disabled={newUserIsAdmin}
						>
							<option value="">Select a team</option>
							{teams.map((team) => (
								<option key={team.id} value={team.id}>
									{team.name}
								</option>
							))}
						</select>
						<div className="flex justify-end space-x-3">
							<button
								onClick={() => setEditModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={updateUser}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Save
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete User Modal */}
			{isDeleteModalOpen && selectedUser && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">Delete User</h3>
						<p>
							Are you sure you want to delete user{' '}
							<strong>{selectedUser.name}</strong>?
						</p>
						<div className="flex justify-end space-x-3 mt-4">
							<button
								onClick={() => setDeleteModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={deleteUser}
								className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default UserManagement;
