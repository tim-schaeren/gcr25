import React, { useEffect, useState, useRef } from 'react';
import Robbery from '../items/Robbery';
import Compass from '../items/Compass';
import Curse from '../items/Curse';
import Immunity from '../items/Immunity';
import DefaultItem from '../items/DefaultItem';
import { useTranslation } from 'react-i18next';
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
	const { t } = useTranslation();
	const [items, setItems] = useState([]);
	const [currency, setCurrency] = useState(0);
	const [team, setTeam] = useState(null);

	const [userOwns, setUserOwns] = useState({});
	const [userActiveItem, setUserActiveItem] = useState(null);

	const [error, setError] = useState('');
	const [activeMessage, setActiveMessage] = useState('');
	const [showItemModal, setShowItemModal] = useState(false);
	const [selectedItem, setSelectedItem] = useState(null);

	// confirmation modal state
	const [showConfirmModal, setShowConfirmModal] = useState(false);
	const [confirmItem, setConfirmItem] = useState(null);

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
					const tData = tsnap.data();
					setTeam({ id: data.teamId, ...tData });
					setCurrency(tData.currency || 0);
				});
			})
			.catch((err) => {
				console.error(err);
				setTemporaryError(t('shop.errors.loadTeam'));
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
		if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);

		if (!user || !userActiveItem) return;
		const expiresAtMs = userActiveItem.expiresAt?.toMillis?.();
		if (!expiresAtMs) return;

		const now = Date.now();
		const delta = expiresAtMs - now;
		const userRef = doc(db, 'users', user.uid);
		const runCleanup = async () => {
			const newInv = { ...userOwns, [userActiveItem.id]: false };
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

		if (delta <= 0) runCleanup();
		else cleanupTimerRef.current = setTimeout(runCleanup, delta);

		return () => clearTimeout(cleanupTimerRef.current);
	}, [userActiveItem, userOwns, user, db]);

	// — shop items once
	useEffect(() => {
		getDocs(collection(db, 'items'))
			.then((qs) => setItems(qs.docs.map((d) => ({ id: d.id, ...d.data() }))))
			.catch((err) => {
				console.error(err);
				setTemporaryError(t('shop.errors.loadItems'));
			});
	}, [db]);

	// transient error helper
	const setTemporaryError = (msg) => {
		setError(msg);
		setTimeout(() => setError(''), 3000);
	};

	// — BUY: deduct team funds, set user inventory boolean to true
	const handlePurchase = async (item) => {
		if (!team) return setTemporaryError(t('shop.errors.noTeam'));
		if (currency < item.price)
			return setTemporaryError(t('shop.errors.notEnoughFunds'));

		try {
			const teamRef = doc(db, 'teams', team.id);
			const tSnap = await getDoc(teamRef);
			const newCur = tSnap.data().currency - item.price;
			await updateDoc(teamRef, { currency: newCur });
			setCurrency(newCur);
			setTeam((prev) => ({ ...prev, currency: newCur }));

			const userRef = doc(db, 'users', user.uid);
			const newInv = { ...userOwns, [item.id]: true };
			await updateDoc(userRef, { inventory: newInv });
			setUserOwns(newInv);

			setActiveMessage(t('shop.messages.bought', { name: item.name }));
			setTimeout(() => setActiveMessage(''), 3000);
		} catch (err) {
			console.error(err);
			setTemporaryError(t('shop.errors.purchaseFailed'));
		}
	};

	// open the custom confirm dialog
	const confirmAndPurchase = (item) => {
		setConfirmItem(item);
		setShowConfirmModal(true);
	};

	// — ACTIVATE: now persists id + expiresAt to users/{uid}.activeItem
	const handleActivateClick = async (item) => {
		const now = Date.now();
		if (
			userActiveItem?.type === item.type &&
			userActiveItem.expiresAt?.toMillis() > now
		) {
			setSelectedItem(item);
			setShowItemModal(true);
			return;
		}
		if (userActiveItem) {
			return setTemporaryError(t('shop.errors.alreadyActive'));
		}
		if (!userOwns[item.id]) {
			return setTemporaryError(t('shop.errors.notOwn', { name: item.name }));
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
		immunity: Immunity,
	};

	const onCloseModal = () => {
		setShowItemModal(false);
		setSelectedItem(null);
	};

	const renderModalContent = () => {
		if (!selectedItem) return null;
		const Component = activationComponents[selectedItem.type] || DefaultItem;
		return (
			<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
				<div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-md">
					<Component
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
				<div className="fixed top-2 left-0 right-0 h-16 flex items-center px-4 z-10">
					<button
						onClick={() => navigate('/dashboard')}
						className="mr-4 text-3xl text-parchment bg-charcoal"
					>
						{t('shop.back')}
					</button>
				</div>
				<div className="max-w-4xl mx-auto">
					<h2 className="text-3xl mt-10 font-bold text-center mb-4">
						{t('shop.title')}
					</h2>
					<h3 className="text-xl text-center font-bold mb-8">
						{t('shop.balance', { amount: currency })}
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
									<p className="mb-2 text-xl font-bold">
										{t('shop.itemPrice', { price: item.price })}
									</p>
									{typeof item.duration === 'number' && item.duration >= 1 && (
										<p className="mb-2">
											{t('shop.duration', { duration: item.duration })}
										</p>
									)}
									<div className="flex space-x-2">
										{!owns ? (
											<button
												onClick={() => confirmAndPurchase(item)}
												className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded transition"
											>
												{t('shop.buttons.buy')}
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
												{isSameActive
													? t('shop.buttons.open')
													: t('shop.buttons.use')}
											</button>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Confirmation Modal */}
				{showConfirmModal && confirmItem && (
					<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
						<div className="bg-gray-800 p-6 rounded-lg shadow-lg w-full max-w-sm">
							<h3 className="text-2xl mb-4 text-center">
								{t('shop.confirm.title')}
							</h3>
							<p className="mb-6 text-center">
								{t('shop.confirm.question', {
									name: confirmItem.name,
									price: confirmItem.price,
								})}
							</p>
							<div className="flex justify-around">
								<button
									onClick={() => {
										handlePurchase(confirmItem);
										setShowConfirmModal(false);
										setConfirmItem(null);
									}}
									className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded"
								>
									{t('shop.confirm.yes')}
								</button>
								<button
									onClick={() => {
										setShowConfirmModal(false);
										setConfirmItem(null);
									}}
									className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded"
								>
									{t('shop.confirm.cancel')}
								</button>
							</div>
						</div>
					</div>
				)}

				{showItemModal && renderModalContent()}
			</div>
		</>
	);
}

export default Shop;
