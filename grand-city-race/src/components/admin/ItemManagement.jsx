import React, { useEffect, useState } from 'react';
import {
	collection,
	onSnapshot,
	addDoc,
	doc,
	deleteDoc,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';

function ItemsManagement({ db }) {
	const [items, setItems] = useState([]);
	const [newItemName, setNewItemName] = useState('');
	const [newItemDescription, setNewItemDescription] = useState('');
	const [newItemEffect, setNewItemEffect] = useState('');
	const [newItemPrice, setNewItemPrice] = useState('');
	const [newItemType, setNewItemType] = useState('');
	const [newItemDuration, setNewItemDuration] = useState('');
	const [isCreateModalOpen, setCreateModalOpen] = useState(false);
	const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);

	// Listen for real‑time updates for the "items" collection.
	useEffect(() => {
		const itemsRef = collection(db, 'items');
		const unsubscribe = onSnapshot(itemsRef, (snapshot) => {
			const itemList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setItems(itemList);
		});
		return () => unsubscribe();
	}, [db]);

	// Create a new item.
	const createItem = async () => {
		if (
			!newItemName.trim() ||
			!newItemDescription.trim() ||
			!newItemEffect.trim() ||
			!newItemPrice ||
			!newItemType.trim() ||
			!newItemDuration.trim()
		)
			return;
		const itemsRef = collection(db, 'items');
		await addDoc(itemsRef, {
			name: newItemName,
			description: newItemDescription,
			effect: newItemEffect,
			price: parseFloat(newItemPrice),
			type: newItemType,
			duration: parseFloat(newItemDuration),
		});
		setNewItemName('');
		setNewItemDescription('');
		setNewItemEffect('');
		setNewItemPrice('');
		setNewItemType('');
		setNewItemDuration('');
		setCreateModalOpen(false);
	};

	// Delete an item.
	const deleteItem = async () => {
		if (!selectedItem) return;
		const itemDoc = doc(db, 'items', selectedItem);
		await deleteDoc(itemDoc);
		setDeleteModalOpen(false);
		setSelectedItem(null);
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
						<Link
							to="/admin/items"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Items
						</Link>
						<Link
							to="/admin/registrations"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Registrations
						</Link>
						<Link
							to="/admin/settings"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Settings
						</Link>
					</nav>
				</aside>

				{/* Main Content */}
				<div className="flex-1">
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							🛍️ Items Management
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Name
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Description
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Effect
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Price
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Type
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Duration
									</th>
									<th className="border border-gray-300 p-4 text-black"></th>
								</tr>
							</thead>
							<tbody>
								{items.map((item) => (
									<tr
										key={item.id}
										className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
									>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											{item.name}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{item.description}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{item.effect}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{item.price}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{item.type}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{item.duration}
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											<button
												onClick={() => {
													setSelectedItem(item.id);
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
						➕ Create Item
					</button>
				</div>
			</div>

			{/* Create Item Modal */}
			{isCreateModalOpen && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">Create New Item</h3>
						<input
							type="text"
							placeholder="Name"
							value={newItemName}
							onChange={(e) => setNewItemName(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Description"
							value={newItemDescription}
							onChange={(e) => setNewItemDescription(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Effect"
							value={newItemEffect}
							onChange={(e) => setNewItemEffect(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="number"
							placeholder="Price"
							value={newItemPrice}
							onChange={(e) => setNewItemPrice(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Type"
							value={newItemType}
							onChange={(e) => setNewItemType(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="number"
							placeholder="Duration"
							value={newItemDuration}
							onChange={(e) => setNewItemDuration(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<div className="flex justify-end space-x-3">
							<button
								onClick={() => setCreateModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={createItem}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Create
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete Item Modal */}
			{isDeleteModalOpen && selectedItem && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg">
						<h3 className="text-lg font-semibold mb-4">Delete Item</h3>
						<p>Are you sure you want to delete this item?</p>
						<div className="flex justify-end space-x-3 mt-4">
							<button
								onClick={() => setDeleteModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={deleteItem}
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

export default ItemsManagement;
