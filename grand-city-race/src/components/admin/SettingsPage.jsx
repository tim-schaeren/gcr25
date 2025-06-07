import React, { useEffect, useState } from 'react';
import { collection, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import AdminSidebar from './AdminSidebar';

function SettingsPage({ db }) {
	const [settings, setSettings] = useState([]);
	const [isEditModalOpen, setEditModalOpen] = useState(false);
	const [selectedSetting, setSelectedSetting] = useState(null);
	const [newSettingValue, setNewSettingValue] = useState('');

	// Fetch settings via onSnapshot for real-time updates.
	useEffect(() => {
		const settingsRef = collection(db, 'settings');
		const unsubscribe = onSnapshot(settingsRef, (snapshot) => {
			const settingsList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setSettings(settingsList);
		});
		return () => unsubscribe();
	}, [db]);

	// Open edit modal and pre-populate the field.
	const openEditModal = (setting) => {
		setSelectedSetting(setting);
		setNewSettingValue(setting.value ?? '');
		setEditModalOpen(true);
	};

	// Update an existing setting.
	const updateSetting = async () => {
		if (!selectedSetting) return;
		const settingRef = doc(db, 'settings', selectedSetting.id);
		await updateDoc(settingRef, {
			value: newSettingValue,
		});
		// Clear fields and close modal.
		setSelectedSetting(null);
		setNewSettingValue('');
		setEditModalOpen(false);
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
				<AdminSidebar db={db} />

				{/* Main Content */}
				<div className="flex-1">
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							⚙️ Settings
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Setting
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Value
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Actions
									</th>
								</tr>
							</thead>
							<tbody>
								{settings.map((setting) => (
									<tr
										key={setting.id}
										className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
									>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											{setting.name}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{typeof setting.value === 'boolean'
												? String(setting.value)
												: setting.value}
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											<button
												onClick={() => openEditModal(setting)}
												className="text-blue-600 hover:text-blue-800"
											>
												Edit
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{/* Edit Setting Modal */}
			{isEditModalOpen && selectedSetting && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">
							Edit "{selectedSetting.id}"
						</h3>
						<label className="block mb-2 font-semibold">Value</label>
						{typeof selectedSetting.value === 'boolean' ? (
							<div className="flex items-center space-x-2 mb-4">
								<input
									type="checkbox"
									checked={newSettingValue === true}
									onChange={(e) => setNewSettingValue(e.target.checked)}
								/>
								<span>{newSettingValue ? 'true ✅' : 'false ❌'}</span>
							</div>
						) : (
							<input
								type="text"
								value={newSettingValue}
								onChange={(e) => setNewSettingValue(e.target.value)}
								className="w-full p-2 border rounded-md mb-4"
							/>
						)}

						<div className="flex justify-end space-x-3">
							<button
								onClick={() => setEditModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={updateSetting}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Save
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default SettingsPage;
