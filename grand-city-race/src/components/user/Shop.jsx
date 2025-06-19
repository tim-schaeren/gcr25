import React, { useEffect, useState, useRef } from 'react';
import Robbery from '../items/Robbery';
import Compass from '../items/Compass';
import Curse from '../items/Curse';
import DefaultItem from '../items/DefaultItem';

import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
	onSnapshot,
	Timestamp,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

function Shop({ user, db }) {
	const [items, setItems] = useState([]);
	const [currency, setCurrency] = useState(0);
	const [team, setTeam] = useState(null);

	const [userOwns, setUserOwns] = useState({});
	const [userActiveItem, setUserActiveItem] = useState(null);

	const [error, setError] = useState('');
	const [activeMessage, setActiveMessage] = useState('');
	const [showItemModal, setShowItemModal] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);

	const navigate = useNavigate();
	const cleanupTimerRef = useRef(null);

	// — team subscription (for currency)
	useEffect(() => {
		if (!user) return;
		const userRef = doc(db, 'users', user.uid);

		getDoc(userRef)
			.then((snap) => {
				const data = snap.data() || {};
				if (!data.teamId) throw new Error('No team');
				const teamRef = doc(db, 'teams', data.teamId);
				return onSnapshot(teamRef, (tsnap) => {
					const t = tsnap.data();
					setTeam({ id: data.teamId, ...t });
					setCurrency(t.currency || 0);
				});
			})
			.catch((err) => {
				console.error(err);
				setTemporaryError('Couldn’t load team data.');
			});
	}, [user, db]);

	// — user subscription (for owns + activeItem)
	useEffect(() => {
		if (!user) return;
		const userRef = doc(db, 'users', user.uid);
		const unsub = onSnapshot(userRef, (snap) => {
			const d = snap.data() || {};
			setUserOwns(d.inventory || {});
			setUserActiveItem(d.activeItem || null);
		});
		return () => unsub();
	}, [user, db]);

	// — auto-cleanup expired activeItem via timeout
	useEffect(() => {
		// clear any existing timer
		if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);

		if (!user || !userActiveItem) return;
		const expiresAtMs = userActiveItem.expiresAt?.toMillis?.();
		if (!expiresAtMs) return;

		const now = Date.now();
		const delta = expiresAtMs - now;
		const userRef = doc(db, 'users', user.uid);
		const expiredId = userActiveItem.id;
		const newInv = { ...userOwns, [expiredId]: false };

		const runCleanup = async () => {
			try {
				await updateDoc(userRef, {
					inventory: newInv,
					activeItem: null,
				});
				setUserOwns(newInv);
				setUserActiveItem(null);
			} catch (err) {
				console.error('Cleanup error:', err);
			}
		};

		if (delta <= 0) {
			runCleanup();
		} else {
			cleanupTimerRef.current = setTimeout(runCleanup, delta);
		}

		return () => {
			if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
		};
	}, [userActiveItem, userOwns, user, db]);

	// — shop items once
	useEffect(() => {
		getDocs(collection(db, 'items'))
			.then((qs) => setItems(qs.docs.map((d) => ({ id: d.id, ...d.data() }))))
			.catch((err) => {
				console.error(err);
				setTemporaryError('Error loading items.');
			});
	}, [db]);

	// transient error helper
	const setTemporaryError = (msg) => {
		setError(msg);
		setTimeout(() => setError(''), 3000);
	};

	// — BUY: deduct team funds, set user inventory boolean to true
	const handlePurchase = async (item) => {
		if (!team) return setTemporaryError('No team!');
		if (currency < item.price) return setTemporaryError('Not enough funds!');

		try {
			const teamRef = doc(db, 'teams', team.id);
			const tSnap = await getDoc(teamRef);
			const newCur = tSnap.data().currency - item.price;
			await updateDoc(teamRef, { currency: newCur });
			setCurrency(newCur);
			setTeam((t) => ({ ...t, currency: newCur }));

			const userRef = doc(db, 'users', user.uid);
			const newInv = { ...userOwns, [item.id]: true };
			await updateDoc(userRef, { inventory: newInv });
			setUserOwns(newInv);

			setActiveMessage(`You bought: ${item.name}`);
			setTimeout(() => setActiveMessage(''), 3000);
		} catch (err) {
			console.error(err);
			setTemporaryError('Purchase failed.');
		}
	};

	// — ACTIVATE: now persists id + expiresAt to users/{uid}.activeItem
	const handleActivateClick = async (item) => {
		const now = Date.now();
		// reopen active session
		if (
			userActiveItem?.type === item.type &&
			userActiveItem.expiresAt?.toMillis() > now
		) {
			setSelectedItem(item);
			setShowItemModal(true);
			return;
		}
		// block if something else active
		if (userActiveItem) {
			return setTemporaryError('You already have one active.');
		}
		// must own it
		if (!userOwns[item.id]) {
			return setTemporaryError(`You don’t own a ${item.name}.`);
		}

		const expiresAt = Timestamp.fromMillis(now + item.duration * 60 * 1000);
		const userRef = doc(db, 'users', user.uid);
		await updateDoc(userRef, {
			activeItem: { id: item.id, type: item.type, expiresAt },
		});

		setSelectedItem(item);
		setShowItemModal(true);
	};

	// — onUsed: clear ownership & activeItem
	const handleItemUsed = async () => {
		if (!selectedItem) return;
		const userRef = doc(db, 'users', user.uid);
		const updInv = { ...userOwns, [selectedItem.id]: false };
		try {
			await updateDoc(userRef, {
				inventory: updInv,
				activeItem: null,
			});
			setUserOwns(updInv);
			setUserActiveItem(null);
		} catch (err) {
			console.error('Usage error:', err);
		}
	};

	const activationComponents = {
		robbery: Robbery,
		compass: Compass,
		curse: Curse,
	};

	const onCloseModal = () => {
		setShowItemModal(false);
		setSelectedItem(null);
	};

	const renderModalContent = () => {
		if (!selectedItem) return null;
		const ActivationComponent =
			activationComponents[selectedItem.type] || DefaultItem;
		return (
			<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
				<div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
					<ActivationComponent
						user={user}
						teamId={team.id}
						team={team}
						selectedItem={selectedItem}
						db={db}
						onClose={onCloseModal}
						onUsed={handleItemUsed}
					/>
				</div>
			</div>
		);
	};

	return (
		<>
			{error && (
				<div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
					<div className="bg-red-600 p-4 rounded-lg text-white shadow-lg">
						{error}
					</div>
				</div>
			)}
			{activeMessage && (
				<div className="fixed top-16 left-1/2 transform -translate-x-1/2 z-50">
					<div className="bg-green-600 p-4 rounded-lg text-white shadow-lg">
						{activeMessage}
					</div>
				</div>
			)}

			<div className="min-h-screen p-6">
				<div className="bg-charcoal fixed top-2 left-0 right-0 h-16 w-16 flex items-center px-4 z-10">
					<button
						onClick={() => navigate('/dashboard')}
						className="mr-4 text-3xl text-parchment bg-charcoal"
					>
						←
					</button>
				</div>
				<div className="max-w-4xl mx-auto">
					<h2 className="text-3xl mt-10 font-bold text-center mb-4">🛒 Shop</h2>
					<h3 className="text-xl text-center font-bold mb-8">
						In the Bank: {currency}
					</h3>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
						{items.map((item) => {
							const isSameActive =
								userActiveItem?.type === item.type &&
								userActiveItem.expiresAt?.toMillis() > Date.now();
							const owns = !!userOwns[item.id];

							return (
								<div key={item.id} className="border p-4 rounded-lg">
									<h4 className="text-2xl font-semibold mb-2">{item.name}</h4>
									<p className="mb-2">{item.description}</p>
									<p className="mb-2 text-xl font-bold">💰 {item.price}</p>
									{typeof item.duration === 'number' && item.duration >= 1 && (
										<p className="mb-2">Duration: {item.duration} minutes</p>
									)}
									<div className="flex space-x-2">
										{!owns ? (
											<button
												onClick={() => handlePurchase(item)}
												className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded transition"
											>
												Buy
											</button>
										) : (
											<button
												onClick={() => handleActivateClick(item)}
												className={`${
													!userActiveItem || isSameActive
														? 'bg-green-600 hover:bg-green-700'
														: 'bg-gray-600 cursor-not-allowed'
												} text-white font-semibold py-1 px-3 rounded transition`}
											>
												{isSameActive ? 'Open' : 'Use'}
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
				{showItemModal && renderModalContent()}
			</div>
		</>
	);
}

export default Shop;
