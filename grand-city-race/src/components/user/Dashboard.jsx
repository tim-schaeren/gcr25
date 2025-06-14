import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';
import { useTranslation } from 'react-i18next';
import {
	doc,
	getDoc,
	updateDoc,
	collection,
	addDoc,
	query,
	getDocs,
	where,
	onSnapshot,
	runTransaction,
} from 'firebase/firestore';

// CONSTANTS
const CLUE_PRICE = 10;

// Helper functions for distance calculation.
function deg2rad(deg) {
	return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
	const R = 6371000; // Earth's radius in meters
	const dLat = deg2rad(lat2 - lat1);
	const dLon = deg2rad(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(deg2rad(lat1)) *
			Math.cos(deg2rad(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	const d = R * c;
	return d;
}

// Helper for Time formatting
function formatMMSS(totalSeconds) {
	const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
	const s = String(totalSeconds % 60).padStart(2, '0');
	return `${m}:${s}`;
}

function Dashboard({ user, db }) {
	const { t } = useTranslation();
	const [quest, setQuest] = useState(null);
	const [currency, setCurrency] = useState(0);
	const [team, setTeam] = useState(null);
	const [unreadCount, setUnreadCount] = useState(0);
	const [userName, setUserName] = useState('');
	const [nextHint, setNextHint] = useState(null);
	const [locationPermission, setLocationPermission] = useState(null);
	const [fullScreenImageUrl, setFullScreenImageUrl] = useState('');
	const [isFullScreenImageOpen, setIsFullScreenImageOpen] = useState(false);
	const [hotlineNumber, setHotlineNumber] = useState('');
	const [isTextOverlayOpen, setIsTextOverlayOpen] = useState(false);
	const [cursingTeamName, setCursingTeamName] = useState('');
	const [remainingSeconds, setRemainingSeconds] = useState(0);
	const [currentLocation, setCurrentLocation] = useState(null);

	const navigate = useNavigate();
	const lastHistoryLocationRef = useRef(null);

	// Fetch user data, team, and if available, the active quest.
	useEffect(() => {
		if (!user) return;

		const fetchUserData = async () => {
			try {
				const userRef = doc(db, 'users', user.uid);
				const userSnap = await getDoc(userRef);
				if (userSnap.exists()) {
					const userData = userSnap.data();
					setUserName(userData.name || user.email);
					if (!userData.teamId) {
						console.error('User is not assigned to a team.');
						return;
					}
					// Fetch team data.
					const teamRef = doc(db, 'teams', userData.teamId);
					const teamSnap = await getDoc(teamRef);
					if (teamSnap.exists()) {
						const teamData = teamSnap.data();
						// ensure cluePurchased is defined
						const progress = {
							...(teamData.progress || {}),
							cluePurchased: teamData.progress?.cluePurchased || [],
						};
						setTeam({ id: userData.teamId, ...teamData, progress });
						setCurrency(teamData.currency || 0);

						// If there is an active quest, fetch its details.
						if (progress.currentQuest) {
							const questRef = doc(db, 'quests', progress.currentQuest);
							const questSnap = await getDoc(questRef);
							if (questSnap.exists()) {
								setQuest({
									id: progress.currentQuest,
									...questSnap.data(),
								});
							}
						} else if (
							teamData.progress?.previousQuests &&
							teamData.progress.previousQuests.length > 0
						) {
							// If no active quest, get the hint for the next quest.
							const solvedQuests = teamData.progress.previousQuests;
							const lastSolvedQuestId = solvedQuests[solvedQuests.length - 1];
							const lastQuestRef = doc(db, 'quests', lastSolvedQuestId);
							const lastQuestSnap = await getDoc(lastQuestRef);
							if (lastQuestSnap.exists()) {
								const lastQuestData = lastQuestSnap.data();
								const nextSequence = lastQuestData.sequence + 1;
								const questsRef = collection(db, 'quests');
								const qNext = query(
									questsRef,
									where('sequence', '==', nextSequence)
								);
								const nextSnapshot = await getDocs(qNext);
								if (!nextSnapshot.empty) {
									const nextQuestDoc = nextSnapshot.docs[0];
									const nextQuestData = nextQuestDoc.data();
									setNextHint(nextQuestData.hint);
								}
							}
						}
					}
				}
			} catch (error) {
				console.error('Error fetching user data:', error);
			}
		};

		fetchUserData();
	}, [user, db]);

	// Listen for cursed updates
	useEffect(() => {
		if (!team?.id) return;
		const teamRef = doc(db, 'teams', team.id);
		const unsubscribe = onSnapshot(teamRef, (snap) => {
			if (snap.exists()) {
				setTeam((prev) => ({ ...prev, ...snap.data() }));
			}
		});
		return unsubscribe;
	}, [db, team?.id]);

	// fetch cursing team
	useEffect(() => {
		if (!team?.cursedBy) {
			setCursingTeamName('');
			return;
		}
		let cancelled = false;
		getDoc(doc(db, 'teams', team.cursedBy))
			.then((snap) => {
				if (!cancelled && snap.exists()) {
					setCursingTeamName(snap.data().name || 'Unknown');
				}
			})
			.catch(console.error);
		return () => {
			cancelled = true;
		};
	}, [db, team?.cursedBy]);

	// find curse-time
	useEffect(() => {
		const curseMs = team?.cursedUntil?.toMillis() ?? 0;
		if (curseMs > Date.now()) {
			const tick = () => {
				const secs = Math.max(0, Math.floor((curseMs - Date.now()) / 1000));
				setRemainingSeconds(secs);
			};
			tick();
			const iv = setInterval(tick, 1000);
			return () => clearInterval(iv);
		} else {
			setRemainingSeconds(0);
		}
	}, [team?.cursedUntil]);

	// Fetch hotline number from Firestore settings.
	useEffect(() => {
		const fetchHotline = async () => {
			try {
				const hotlineRef = doc(db, 'settings', 'hotlineNumber');
				const hotlineSnap = await getDoc(hotlineRef);
				if (hotlineSnap.exists()) {
					setHotlineNumber(hotlineSnap.data().value || '');
				}
			} catch (error) {
				console.error('Error fetching hotline number:', error);
			}
		};

		fetchHotline();
	}, [db]);

	// Set up a listener for "unread admin→team" messages.
	useEffect(() => {
		if (!user || !team) return;

		// Listen for messages where: to == team.id  AND  readByTeam == false
		const unreadQuery = query(
			collection(db, 'messages'),
			where('to', '==', team.id),
			where('readByTeam', '==', false)
		);
		const unsubscribe = onSnapshot(unreadQuery, (snapshot) => {
			setUnreadCount(snapshot.size); // number of unread admin→team msgs
		});
		return () => unsubscribe();
	}, [db, user, team]);

	// Update location every 30 seconds (for history and Firestore update)
	useEffect(() => {
		if (!user) return;

		const updateLocation = async (position) => {
			const { latitude, longitude } = position.coords;
			try {
				const userRef = doc(db, 'users', user.uid);
				await updateDoc(userRef, {
					location: { lat: latitude, lng: longitude },
					lastUpdated: new Date(),
				});
				// Also update the local currentLocation state.
				setCurrentLocation({ lat: latitude, lng: longitude });

				// Write to locationHistory if moved sufficiently.
				if (!lastHistoryLocationRef.current) {
					await addDoc(collection(db, 'users', user.uid, 'locationHistory'), {
						lat: latitude,
						lng: longitude,
						timestamp: new Date(),
					});
					lastHistoryLocationRef.current = { lat: latitude, lng: longitude };
				} else {
					const distance = getDistanceFromLatLonInMeters(
						lastHistoryLocationRef.current.lat,
						lastHistoryLocationRef.current.lng,
						latitude,
						longitude
					);
					if (distance >= 10) {
						await addDoc(collection(db, 'users', user.uid, 'locationHistory'), {
							lat: latitude,
							lng: longitude,
							timestamp: new Date(),
						});
						lastHistoryLocationRef.current = { lat: latitude, lng: longitude };
					}
				}
			} catch (error) {
				console.error('Error updating location:', error);
			}
		};

		const handleLocationError = (error) => {
			console.error('Error getting location:', error);
		};

		if (navigator.geolocation) {
			// Request initial location.
			navigator.geolocation.getCurrentPosition(
				(position) => {
					setLocationPermission(true);
					updateLocation(position);
				},
				(error) => {
					setLocationPermission(false);
					console.error('Error getting initial location:', error);
				},
				{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
			);
			const interval = setInterval(() => {
				navigator.geolocation.getCurrentPosition(
					updateLocation,
					handleLocationError,
					{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
				);
			}, 30000);
			return () => clearInterval(interval);
		} else {
			console.error('Geolocation is not supported by this browser.');
		}
	}, [user, db]);

	// ------------------- QUEST ACTIVATION LOGIC BASED ON LOCATION -------------------
	// This effect runs every 5 seconds to check if the user is within the fence of the next quest.
	// If the user is within the fence and no quest is active, it activates the quest.
	// If the user leaves the fence, it clears an active quest.
	useEffect(() => {
		if (!user || !db || !team) return;

		const checkQuestActivation = async () => {
			if (!navigator.geolocation) return;

			navigator.geolocation.getCurrentPosition(
				async ({ coords }) => {
					const loc = { lat: coords.latitude, lng: coords.longitude };
					setCurrentLocation(loc);

					const teamRef = doc(db, 'teams', team.id);

					// If a quest is already active, verify they’re still inside its fence
					if (team.progress?.currentQuest) {
						const questSnap = await getDoc(
							doc(db, 'quests', team.progress.currentQuest)
						);
						if (questSnap.exists()) {
							const { location } = questSnap.data();
							const dist = getDistanceFromLatLonInMeters(
								loc.lat,
								loc.lng,
								location.lat,
								location.lng
							);
							if (dist > location.fence) {
								await updateDoc(teamRef, { 'progress.currentQuest': '' });
								setTeam((prev) => ({
									...prev,
									progress: { ...prev.progress, currentQuest: '' },
								}));
								setQuest(null);
							}
						}
					} else {
						// No active quest → figure out next
						let nextSeq = 1;
						if (team.progress?.previousQuests?.length) {
							const lastId = team.progress.previousQuests.slice(-1)[0];
							const lastSnap = await getDoc(doc(db, 'quests', lastId));
							if (lastSnap.exists()) nextSeq = lastSnap.data().sequence + 1;
						}

						const qNext = query(
							collection(db, 'quests'),
							where('sequence', '==', nextSeq)
						);
						const nextDocs = await getDocs(qNext);
						if (!nextDocs.empty) {
							const nextData = nextDocs.docs[0].data();
							const dist = getDistanceFromLatLonInMeters(
								loc.lat,
								loc.lng,
								nextData.location.lat,
								nextData.location.lng
							);
							if (dist <= nextData.location.fence) {
								await updateDoc(teamRef, {
									'progress.currentQuest': nextDocs.docs[0].id,
								});
								setTeam((prev) => ({
									...prev,
									progress: {
										...prev.progress,
										currentQuest: nextDocs.docs[0].id,
									},
								}));
								setQuest({ id: nextDocs.docs[0].id, ...nextData });
							}
						}
					}
				},
				(err) => console.error('Error checking quest activation:', err),
				{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
			);
		};

		// **run immediately** when team/user/db is ready
		checkQuestActivation();

		// then keep checking every 5s
		const interval = setInterval(checkQuestActivation, 5000);
		return () => clearInterval(interval);
	}, [team, user, db]);

	// Handler to buy clue
	const handleBuyClue = async () => {
		if (!quest || !team) return;
		if (currency < CLUE_PRICE) {
			alert(t('notEnough'));
			return;
		}
		try {
			await runTransaction(db, async (transaction) => {
				const teamRef = doc(db, 'teams', team.id);
				const teamDoc = await transaction.get(teamRef);
				if (!teamDoc.exists()) throw new Error('Team not found');
				const data = teamDoc.data();
				const current = data.currency || 0;
				if (current < CLUE_PRICE) throw new Error('NOT_ENOUGH_CURRENCY');

				const newCurrency = current - CLUE_PRICE;
				const purchased = data.progress?.cluePurchased || [];
				const newClues = [...purchased, quest.id];

				transaction.update(teamRef, {
					currency: newCurrency,
					'progress.cluePurchased': newClues,
				});
			});

			// Update local state once transaction commits
			setCurrency((c) => c - CLUE_PRICE);
			setTeam((t) => ({
				...t,
				currency: (t.currency || 0) - CLUE_PRICE,
				progress: {
					...t.progress,
					cluePurchased: [...(t.progress?.cluePurchased || []), quest.id],
				},
			}));
		} catch (e) {
			if (e.message === 'NOT_ENOUGH_CURRENCY') {
				alert(t('notEnough'));
			} else {
				console.error('Failed to purchase clue:', e);
			}
		}
	};

	return (
		<div className="bg-charcoal flex flex-col items-center justify-center min-h-screen p-6">
			{/* Messages Icon */}
			{team && (
				<div className="absolute top-3 left-3">
					<button
						onClick={() => navigate('/chat')}
						className="border border-charcoal text-charcoal bg-parchment hover:bg-parchment rounded-full px-4 py-4 shadow-sm"
					>
						<svg
							className="w-8 h-8"
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							width="22"
							height="22"
							fill="none"
							viewBox="0 0 24 24"
						>
							<path
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="2"
								d="M16 10.5h.01m-4.01 0h.01M8 10.5h.01M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-6.6a1 1 0 0 0-.69.275l-2.866 2.723A.5.5 0 0 1 8 18.635V17a1 1 0 0 0-1-1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"
							/>
						</svg>

						{/* Red dot if unreadCount > 0 */}
						{unreadCount > 0 && (
							<span className="absolute -top-1 -right-1 block h-4 w-4 rounded-full bg-red-500" />
						)}
					</button>
				</div>
			)}

			{/* Main Card */}
			<div className="bg-charcoal p-6 rounded-xl shadow-md border-2 shadow-lg">
				<h2 className="text-2xl font-bold text-center text-parchment">
					{userName}
				</h2>
				{team && (
					<h3 className="text-lg text-center mt-2 text-white">
						<span>{team.name}</span>
					</h3>
				)}

				{/* Quest Box */}
				{remainingSeconds > 0 ? (
					<div className="mt-5 p-5 mb-10 bg-red-100 border border-red-400 text-red-700 rounded-xl text-center">
						<p className="font-semibold text-lg">You have been cursed by</p>
						<p className="font-semibold text-lg">{cursingTeamName}!</p>
						<p className="mt-2 text-2xl">{formatMMSS(remainingSeconds)}</p>
					</div>
				) : (
					<div className="mt-5 p-5 mb-10 bg-parchment rounded-xl;border-2 text-center">
						{quest ? (
							<>
								{quest.imageUrl && (
									<div
										onClick={() => {
											setFullScreenImageUrl(quest.imageUrl);
											setIsFullScreenImageOpen(true);
										}}
										className="cursor-pointer mx-auto mb-4 mt-2"
										style={{ maxWidth: '300px' }}
									>
										<img
											src={quest.imageUrl}
											alt="Quest"
											style={{
												width: '100%',
												height: '100%',
												maxHeight: '300px',
												objectFit: 'contain',
											}}
											className="rounded-md border-2 border-charcoal"
										/>
									</div>
								)}
								{quest.videoUrl && (
									<div className="mx-auto mb-4" style={{ maxWidth: '300px' }}>
										<ReactPlayer
											url={quest.videoUrl}
											controls
											width="100%"
											height="300px"
										/>
									</div>
								)}
								{/* Scrollable, tappable text box */}
								<div
									onClick={() => setIsTextOverlayOpen(true)}
									className="mt-2 text-charcoal text-lg max-h-48 overflow-y-auto p-2 cursor-pointer text-left"
								>
									{quest.text}
								</div>
								<button
									onClick={() => navigate('/solver')}
									className="text-lg font-bold mt-10 w-full bg-charcoal hover:bg-green-800 text-parchment py-2 px-4 rounded-md shadow-md transition"
								>
									{t('solve')}
								</button>

								{/* Clue section */}
								{quest.clue &&
								(team.progress?.cluePurchased ?? []).includes(quest.id) ? (
									<p className="mt-4 text-gray-800 text-lg">
										{t('clue')}: {quest.clue}
									</p>
								) : (
									<button
										onClick={handleBuyClue}
										className="text-lg font-bold mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-md shadow-md transition"
									>
										{t('buyClue')} – {CLUE_PRICE}$
									</button>
								)}
							</>
						) : nextHint ? (
							<div>
								<h3 className="mt-6 text-xl font-bold text-charcoal">
									{t('hint')}:
								</h3>
								<p className="mt-2 text-charcoal text-xl">{nextHint}</p>
								<p className="mt-6 mb-6 text-charcoal text-sm">
									{t('findLocation')}
								</p>
							</div>
						) : (
							<p className="text-gray-400">⚡ {t('askGM')}</p>
						)}
					</div>
				)}

				{/* Team Currency Display */}
				{team && (
					<div className="mb-6 text-white text-center text-xl font-bold">
						{t('currency')}: {currency}💰
					</div>
				)}

				{locationPermission === false && (
					<p className="mt-4 text-red-400 text-center">
						⚠️ {t('locationDenied')}
					</p>
				)}

				<div className="flex flex-row flex-wrap justify-between gap-4 mt-6">
					<button
						onClick={() => navigate('/shop')}
						className="text-xl flex-1 min-w-[120px] px-4 py-2 bg-gold hover:text-parchment font-semibold rounded-md shadow-md hover:bg-yellow-500 transition border border-1 border-white"
					>
						{t('items')}
					</button>

					<a
						href={hotlineNumber ? `tel:${hotlineNumber}` : '#'}
						onClick={(e) => {
							if (!hotlineNumber) e.preventDefault();
						}}
						className={`flex-1 min-w-[120px] px-4 py-2 rounded-md shadow-md font-semibold text-center transition
						${
							hotlineNumber
								? 'text-lg bg-indigo text-parchment border border-1'
								: 'text-lg bg-parchment text-charcoal border border-charcoal cursor-not-allowed'
						}`}
					>
						📞 {userName === 'Kylie' ? 'Call Boyfriend' : t('callHotline')}
					</a>
				</div>
			</div>

			{/* Full-Screen Text Overlay */}
			{isTextOverlayOpen && (
				<div
					onClick={() => setIsTextOverlayOpen(false)}
					className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-6"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="bg-white max-w-3xl w-full max-h-full overflow-y-auto p-6 rounded-lg"
					>
						<button
							onClick={() => setIsTextOverlayOpen(false)}
							className="mb-4 text-parchment bg-charcoal font-bold absolute top-7 right-7"
						>
							X
						</button>
						<div className="text-charcoal text-xl whitespace-pre-wrap">
							{quest.text}
						</div>
					</div>
				</div>
			)}

			{/* Full-Screen Image Overlay */}
			{isFullScreenImageOpen && (
				<div
					onClick={() => setIsFullScreenImageOpen(false)}
					className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 cursor-pointer"
				>
					<div onClick={(e) => e.stopPropagation()}>
						<img
							src={fullScreenImageUrl}
							alt="Full Screen"
							style={{
								maxWidth: '90%',
								maxHeight: '90%',
								objectFit: 'contain',
							}}
							className="rounded-md"
						/>
					</div>
				</div>
			)}
		</div>
	);
}

export default Dashboard;
