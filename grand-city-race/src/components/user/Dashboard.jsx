import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactPlayer from 'react-player';
import {
	doc,
	getDoc,
	updateDoc,
	collection,
	addDoc,
	query,
	getDocs,
	where,
} from 'firebase/firestore';

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

function Dashboard({ user, db }) {
	const [quest, setQuest] = useState(null);
	const [currency, setCurrency] = useState(0);
	const [team, setTeam] = useState(null);
	const [userName, setUserName] = useState('');
	const [nextHint, setNextHint] = useState(null);
	const [locationPermission, setLocationPermission] = useState(null);
	const [currentLocation, setCurrentLocation] = useState(null);
	const [fullScreenImageUrl, setFullScreenImageUrl] = useState('');
	const [isFullScreenImageOpen, setIsFullScreenImageOpen] = useState(false);
	const [hotlineNumber, setHotlineNumber] = useState('');

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
						setTeam({ id: userData.teamId, ...teamData });
						setCurrency(teamData.currency || 0);

						// If there is an active quest, fetch its details.
						if (teamData.progress?.currentQuest) {
							const questRef = doc(
								db,
								'quests',
								teamData.progress.currentQuest
							);
							const questSnap = await getDoc(questRef);
							if (questSnap.exists()) {
								setQuest({
									id: teamData.progress.currentQuest,
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
	// This effect runs every 2 seconds to check if the user is within the fence of the next quest.
	// If the user is within the fence and no quest is active, it activates the quest.
	// If the user leaves the fence, it clears an active quest.
	useEffect(() => {
		if (!user || !db) return;

		const checkQuestActivation = async () => {
			if (!team) return;
			if (!navigator.geolocation) return;
			navigator.geolocation.getCurrentPosition(
				async (position) => {
					const loc = {
						lat: position.coords.latitude,
						lng: position.coords.longitude,
					};
					setCurrentLocation(loc); // update local state

					const teamRef = doc(db, 'teams', team.id);

					// If a quest is already active, verify that the user is still within its fence.
					if (team.progress?.currentQuest) {
						const questRef = doc(db, 'quests', team.progress.currentQuest);
						const questSnap = await getDoc(questRef);
						if (questSnap.exists()) {
							const questData = questSnap.data();
							const distance = getDistanceFromLatLonInMeters(
								loc.lat,
								loc.lng,
								questData.location.lat,
								questData.location.lng
							);
							// If the user left the fence, clear the active quest.
							if (distance > questData.location.fence) {
								await updateDoc(teamRef, { 'progress.currentQuest': '' });
								setTeam((prev) => ({
									...prev,
									progress: { ...prev.progress, currentQuest: '' },
								}));
								setQuest(null);
							}
						}
					} else {
						// No active quest – determine the next quest.
						let nextSequence = 1;
						if (
							team.progress?.previousQuests &&
							team.progress.previousQuests.length > 0
						) {
							const lastQuestId =
								team.progress.previousQuests[
									team.progress.previousQuests.length - 1
								];
							const lastQuestRef = doc(db, 'quests', lastQuestId);
							const lastQuestSnap = await getDoc(lastQuestRef);
							if (lastQuestSnap.exists()) {
								const lastQuestData = lastQuestSnap.data();
								nextSequence = lastQuestData.sequence + 1;
							}
						}
						// Query for the quest with the nextSequence.
						const questsRef = collection(db, 'quests');
						const qNext = query(
							questsRef,
							where('sequence', '==', nextSequence)
						);
						const nextSnap = await getDocs(qNext);
						if (!nextSnap.empty) {
							const nextDoc = nextSnap.docs[0];
							const nextQuestData = nextDoc.data();
							const distance = getDistanceFromLatLonInMeters(
								loc.lat,
								loc.lng,
								nextQuestData.location.lat,
								nextQuestData.location.lng
							);
							// If the user is within the quest fence, activate this quest.
							if (distance <= nextQuestData.location.fence) {
								await updateDoc(teamRef, {
									'progress.currentQuest': nextDoc.id,
								});
								setTeam((prev) => ({
									...prev,
									progress: { ...prev.progress, currentQuest: nextDoc.id },
								}));
								setQuest({ id: nextDoc.id, ...nextQuestData });
							}
						}
					}
				},
				(err) => {
					console.error('Error checking quest activation:', err);
				},
				{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
			);
		};

		const activationInterval = setInterval(() => {
			checkQuestActivation();
		}, 2000);

		return () => clearInterval(activationInterval);
	}, [team, user, db]);

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
			<div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-2xl">
				<h2 className="text-2xl font-bold text-center">Welcome, {userName}</h2>
				{team && (
					<h3 className="text-lg text-gray-400 text-center mt-2">
						Team: <span className="font-semibold text-white">{team.name}</span>
					</h3>
				)}
				<div className="mt-6 p-4 bg-gray-700 rounded-lg text-center">
					{quest ? (
						<>
							<h3 className="text-xl font-semibold">This is your quest:</h3>
							{quest.imageUrl && (
								<div
									onClick={() => {
										setFullScreenImageUrl(quest.imageUrl);
										setIsFullScreenImageOpen(true);
									}}
									className="cursor-pointer mx-auto mb-4"
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
										className="rounded-md"
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
							<p className="text-gray-300 mt-2">{quest.text}</p>
							<button
								onClick={() => navigate('/solver')}
								className="mt-4 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-md"
							>
								🧠 Solve Quest
							</button>
						</>
					) : nextHint ? (
						<div>
							<h3 className="text-xl font-semibold">🔑 Next Hint:</h3>
							<p className="text-gray-300 mt-2">{nextHint}</p>
							<p className="text-gray-400 mt-2">
								Solve the hint and find the quest-area to activate the quest.
							</p>
						</div>
					) : (
						<p className="text-gray-400">
							⚡ Ask your gamemasters to give you a hint on where to go.
						</p>
					)}
				</div>
				<div className="mt-6 p-4 bg-gray-700 rounded-lg text-center">
					<h3 className="text-xl font-semibold">💰 Bank: {currency}</h3>
				</div>
				{locationPermission === false && (
					<p className="mt-4 text-red-400 text-center">
						⚠️ Location access denied. Please enable location services.
					</p>
				)}
				<div className="flex flex-col sm:flex-row justify-between mt-6 space-y-2 sm:space-y-0 sm:space-x-4">
					<button
						onClick={() => navigate('/shop')}
						className="w-full sm:w-auto bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-2 px-6 rounded-md"
					>
						🛒 Shop
					</button>
					{/* Hotline Button (pulls from Firestore “settings” collection) */}
					<a
						href={hotlineNumber ? `tel:${hotlineNumber}` : '#'}
						className={`w-full sm:w-auto flex items-center justify-center font-semibold py-2 px-6 rounded-md ${
							hotlineNumber
								? 'bg-blue-500 hover:bg-blue-600 text-white'
								: 'bg-gray-500 text-gray-300 cursor-not-allowed'
						}`}
						// If not loaded yet, prevent accidental clicks
						onClick={(e) => {
							if (!hotlineNumber) e.preventDefault();
						}}
					>
						📞 Call Hotline
					</a>
				</div>
			</div>
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
