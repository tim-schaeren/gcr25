import React, { useEffect, useState } from 'react';
import Robbery from '../items/Robbery';
import DefaultItem from '../items/DefaultItem';

import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
	onSnapshot,
} from 'firebase/firestore';

function Shop({ user, db }) {
	// Shop state variables
	const [items, setItems] = useState([]);
	const [currency, setCurrency] = useState(0);
	const [team, setTeam] = useState(null);
	const [error, setError] = useState(null);
	const [activeMessage, setActiveMessage] = useState('');
	const [showItemModal, setShowItemModal] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);

	// Real-time listener for team data (inventory, currency, activeItem)
	useEffect(() => {
		if (!user) return;

		const fetchTeamRealTime = async () => {
			try {
				const userRef = doc(db, 'users', user.uid);
				const userSnap = await getDoc(userRef);
				if (!userSnap.exists()) return;
				const userData = userSnap.data();
				if (!userData.teamId) {
					console.error('User is not assigned to a team.');
					return;
				}
				const teamRef = doc(db, 'teams', userData.teamId);
				const unsubscribeTeam = onSnapshot(teamRef, (snapshot) => {
					const teamData = snapshot.data();
					setTeam({ id: userData.teamId, ...teamData });
					setCurrency(teamData.currency || 0);
				});
				return unsubscribeTeam;
			} catch (err) {
				setError('Error fetching user data.');
				console.error(err);
			}
		};

		fetchTeamRealTime();
	}, [user, db]);

	// Fetch shop items (one-time fetch)
	useEffect(() => {
		const fetchItems = async () => {
			try {
				const querySnapshot = await getDocs(collection(db, 'items'));
				const shopItems = querySnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				setItems(shopItems);
			} catch (err) {
				setError('Error fetching shop items.');
				console.error('Firestore error:', err);
			}
		};

		fetchItems();
	}, [db]);

	// Purchase an item: subtract cost and add one to inventory.
	const handlePurchase = async (item) => {
		if (!team) {
			setError('No team found!');
			setTimeout(() => setError(''), 3000);
			return;
		}
		if (currency < item.price) {
			setError('Not enough team currency!');
			setTimeout(() => setError(''), 3000);
			return;
		}
		try {
			const teamRef = doc(db, 'teams', team.id);
			const teamSnap = await getDoc(teamRef);
			if (!teamSnap.exists()) {
				setError('Team data not found.');
				setTimeout(() => setError(''), 3000);
				return;
			}
			const teamData = teamSnap.data();
			const updatedCurrency = teamData.currency - item.price;
			const inventory = teamData.inventory || {};
			inventory[item.id] = (inventory[item.id] || 0) + 1;

			await updateDoc(teamRef, {
				currency: updatedCurrency,
				inventory: inventory,
			});
			setCurrency(updatedCurrency);
			setTeam({ ...team, inventory });
			setActiveMessage(`Your team purchased: ${item.name}`);
			setTimeout(() => setActiveMessage(''), 3000);
		} catch (err) {
			console.error('Error processing purchase:', err);
			setError('Purchase failed. Try again.');
			setTimeout(() => setError(''), 3000);
		}
	};

	// Handle Activate click: validate conditions then open modal.
	const handleActivateClick = (item) => {
		if (team && team.activeItem) {
			setError('Your team already has an active item at the moment.');
			setTimeout(() => setError(''), 3000);
			return;
		}
		if (!(team && team.inventory && team.inventory[item.id] > 0)) {
			setError(`Your team does not have any ${item.name} items right now.`);
			setTimeout(() => setError(''), 3000);
			return;
		}
		setSelectedItem(item);
		setShowItemModal(true);
	};

	// Mapping of item types to activation components.
	const activationComponents = {
		robbery: Robbery,
	};

	// Callback to close the activation modal.
	const onCloseModal = () => {
		setShowItemModal(false);
		setSelectedItem(null);
	};

	// Render the modal with dynamic content.
	const renderModalContent = () => {
		if (!selectedItem) return null;
		const ActivationComponent =
			activationComponents[selectedItem.type] || DefaultItem;
		return (
			<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
				<div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
					<ActivationComponent
						team={team}
						selectedItem={selectedItem}
						db={db}
						onClose={onCloseModal}
					/>
				</div>
			</div>
		);
	};

	return (
		<>
			{/* Error message overlay */}
			{error && (
				<div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
					<div className="bg-red-600 p-4 rounded-lg text-white shadow-lg">
						{error}
					</div>
				</div>
			)}
			{/* Success message overlay */}
			{activeMessage && (
				<div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50">
					<div className="bg-green-600 p-4 rounded-lg text-white shadow-lg">
						{activeMessage}
					</div>
				</div>
			)}
			<div className="min-h-screen bg-gray-900 text-white p-6">
				<div className="max-w-4xl mx-auto">
					<h2 className="text-3xl font-bold text-center mb-4">
						🛒 In-Game Shop
					</h2>
					<h3 className="text-xl text-center mb-8">
						Your Team's Balance: 💰 {currency}
					</h3>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{items.length === 0 ? (
							<p className="text-center">No items found.</p>
						) : (
							items.map((item) => (
								<div
									key={item.id}
									className="border border-gray-600 p-4 rounded-lg"
								>
									<h4 className="text-2xl font-semibold mb-2">{item.name}</h4>
									<p className="mb-2">{item.description}</p>
									<p className="mb-2">💰 {item.price}</p>
									{item.duration && (
										<p className="mb-2">Duration: {item.duration} s</p>
									)}
									{item.stealAmount && (
										<p className="mb-2">Steal: {item.stealAmount}</p>
									)}
									<div className="flex space-x-2">
										<button
											onClick={() => handlePurchase(item)}
											className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded transition"
										>
											Buy
										</button>
										<button
											onClick={() => handleActivateClick(item)}
											className={`${
												team &&
												team.inventory &&
												team.inventory[item.id] > 0 &&
												!team.activeItem
													? 'bg-green-600 hover:bg-green-700'
													: 'bg-gray-600 cursor-not-allowed'
											} text-white font-semibold py-1 px-3 rounded transition`}
										>
											Activate
										</button>
									</div>
									<p className="text-sm mt-1">
										Owned:{' '}
										{team &&
										team.inventory &&
										team.inventory[item.id] !== undefined
											? team.inventory[item.id]
											: 0}
									</p>
								</div>
							))
						)}
					</div>
				</div>
				{showItemModal && renderModalContent()}
			</div>
		</>
	);
}

export default Shop;
