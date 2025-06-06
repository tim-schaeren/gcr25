import React, { useEffect, useState } from 'react';
import {
	collection,
	onSnapshot,
	addDoc,
	doc,
	deleteDoc,
} from 'firebase/firestore';
import AdminSidebar from './AdminSidebar';

// Define available colors for teams.
const availableColors = [
	{ name: 'beige', hex: '#f5f5dc' },
	{ name: 'black', hex: '#000000' },
	{ name: 'blue', hex: '#0000ff' },
	{ name: 'brown', hex: '#a52a2a' },
	{ name: 'chocolate', hex: '#d2691e' },
	{ name: 'coral', hex: '#ff7f50' },
	{ name: 'crimson', hex: '#dc143c' },
	{ name: 'cyan', hex: '#00ffff' },
	{ name: 'darkviolet', hex: '#9400d3' },
	{ name: 'gold', hex: '#ffd700' },
	{ name: 'gray', hex: '#808080' },
	{ name: 'green', hex: '#008000' },
	{ name: 'khaki', hex: '#f0e68c' },
	{ name: 'lime', hex: '#00ff00' },
	{ name: 'magenta', hex: '#ff00ff' },
	{ name: 'maroon', hex: '#800000' },
	{ name: 'navy', hex: '#000080' },
	{ name: 'olive', hex: '#808000' },
	{ name: 'orange', hex: '#ffa500' },
	{ name: 'pink', hex: '#ffc0cb' },
	{ name: 'purple', hex: '#800080' },
	{ name: 'red', hex: '#ff0000' },
	{ name: 'royalblue', hex: '#4169e1' },
	{ name: 'turquoise', hex: '#40e0d0' },
	{ name: 'violet', hex: '#ee82ee' },
	{ name: 'white', hex: '#ffffff' },
	{ name: 'yellow', hex: '#ffff00' },
];

function TeamManagement({ db }) {
	const [teams, setTeams] = useState([]);
	const [newTeamName, setNewTeamName] = useState('');
	// newTeamColor will hold an object { name, hex }
	const [newTeamColor, setNewTeamColor] = useState(null);
	const [isCreateModalOpen, setCreateModalOpen] = useState(false);
	const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
	const [selectedTeam, setSelectedTeam] = useState(null);

	useEffect(() => {
		const teamsRef = collection(db, 'teams');
		// Subscribe to real-time updates for the teams collection.
		const unsubscribe = onSnapshot(teamsRef, (snapshot) => {
			const teamList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setTeams(teamList);
		});

		// Clean up the listener when the component unmounts.
		return () => unsubscribe();
	}, [db]);

	const createTeam = async () => {
		if (!newTeamName.trim() || !newTeamColor) return;
		const teamsRef = collection(db, 'teams');
		await addDoc(teamsRef, {
			name: newTeamName,
			color: { name: newTeamColor.name, hex: newTeamColor.hex },
			currency: 0,
			inventory: {},
			progress: {
				currentQuest: '',
				previousQuests: [],
			},
		});
		setNewTeamName('');
		setNewTeamColor(null);
		setCreateModalOpen(false);
		// The onSnapshot listener will update the teams array automatically.
	};

	const deleteTeam = async () => {
		if (!selectedTeam) return;
		const teamDoc = doc(db, 'teams', selectedTeam);
		await deleteDoc(teamDoc);
		setDeleteModalOpen(false);
		setSelectedTeam(null);
		// The onSnapshot listener will update the teams array automatically.
	};

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			{/* Prevent Mobile Access */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>

			{/* Actual Dashboard (Only shown on bigger screens) */}
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar */}
				<AdminSidebar db={db} />
				{/* Main Content */}
				<div className="flex-1">
					{/* Team Management */}
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							📂 Team Management
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Name
									</th>
									<th className="border border-gray-300 p-4 text-black">ID</th>
									<th className="border border-gray-300 p-4 text-black">
										Color
									</th>
									<th className="border border-gray-300 p-4 text-black"></th>
								</tr>
							</thead>
							<tbody>
								{teams.map((team) => (
									<tr
										key={team.id}
										className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
									>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											{team.name}
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											{team.id}
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											<div
												className="w-8 h-8 inline-block rounded"
												style={{ backgroundColor: team.color.hex }}
												title={team.color.name}
											></div>
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											<button
												onClick={() => {
													setSelectedTeam(team.id);
													setDeleteModalOpen(true);
												}}
												className="text-red-600 hover:text-red-800"
											>
												❌ Delete
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					<button
						onClick={() => setCreateModalOpen(true)}
						className="bg-blue-300 text-black px-4 py-2 rounded-lg hover:bg-blue-700 transition"
					>
						➕ Create Team
					</button>
				</div>
			</div>

			{/* Create Team Modal */}
			{isCreateModalOpen && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg">
						<h3 className="text-lg font-semibold mb-4">Create New Team</h3>
						<input
							type="text"
							placeholder="Team Name"
							value={newTeamName}
							onChange={(e) => setNewTeamName(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<label className="block mb-2 font-semibold">Team Color</label>
						<div className="flex flex-wrap gap-2 mb-4">
							{availableColors.map((color) => (
								<button
									key={color.name}
									type="button"
									onClick={() => setNewTeamColor(color)}
									className={`w-10 h-10 rounded border-2 ${
										newTeamColor && newTeamColor.name === color.name
											? 'border-blue-500'
											: 'border-transparent'
									}`}
									style={{ backgroundColor: color.hex }}
									title={`${color.name} (${color.hex})`}
								></button>
							))}
						</div>
						<div className="flex justify-end space-x-3">
							<button
								onClick={() => setCreateModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={createTeam}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Create
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete Team Modal */}
			{isDeleteModalOpen && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg">
						<h3 className="text-lg font-semibold mb-4">Delete Team</h3>
						<p>Are you sure you want to delete this team?</p>
						<div className="flex justify-end space-x-3 mt-4">
							<button
								onClick={() => setDeleteModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={deleteTeam}
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

export default TeamManagement;
