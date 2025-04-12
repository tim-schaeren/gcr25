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
	orderBy,
	limit,
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
	const [nextHint, setNextHint] = useState(null);
	const [locationPermission, setLocationPermission] = useState(null);
	// For full-screen image overlay
	const [fullScreenImageUrl, setFullScreenImageUrl] = useState('');
	const [isFullScreenImageOpen, setIsFullScreenImageOpen] = useState(false);

	const navigate = useNavigate();

	// Use a ref to store the last location that was written to locationHistory.
	const lastHistoryLocationRef = useRef(null);

	// Fetch user data (team, quest, etc.)
	useEffect(() => {
		if (!user) return;

		const fetchUserData = async () => {
			try {
				const userRef = doc(db, 'users', user.uid);
				const userSnap = await getDoc(userRef);
				if (userSnap.exists()) {
					const userData = userSnap.data();
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

						// If there is an active quest, fetch and display it.
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
							// No active quest—but the team has solved at least one quest.
							// Fetch the last solved quest to determine its sequence.
							const solvedQuests = teamData.progress.previousQuests;
							const lastSolvedQuestId = solvedQuests[solvedQuests.length - 1];
							const lastQuestRef = doc(db, 'quests', lastSolvedQuestId);
							const lastQuestSnap = await getDoc(lastQuestRef);
							if (lastQuestSnap.exists()) {
								const lastQuestData = lastQuestSnap.data();
								const nextSequence = lastQuestData.sequence + 1;
								// Query the next quest (by sequence) to get its hint.
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

	// On mount, fetch the most recent location from the user's locationHistory subcollection.
	useEffect(() => {
		if (!user) return;

		const fetchLastHistory = async () => {
			try {
				const historyRef = collection(db, 'users', user.uid, 'locationHistory');
				const q = query(historyRef, orderBy('timestamp', 'desc'), limit(1));
				const historySnap = await getDocs(q);
				if (!historySnap.empty) {
					const lastDoc = historySnap.docs[0];
					const data = lastDoc.data();
					lastHistoryLocationRef.current = { lat: data.lat, lng: data.lng };
				}
			} catch (error) {
				console.error('Error fetching location history:', error);
			}
		};

		fetchLastHistory();
	}, [user, db]);

	// Start location tracking: update location every 30 seconds.
	useEffect(() => {
		if (!user) return;

		console.log('starting to track location');

		const updateLocation = async (position) => {
			const { latitude, longitude } = position.coords;
			try {
				// Update user's current location and lastUpdated in the main document.
				const userRef = doc(db, 'users', user.uid);
				await updateDoc(userRef, {
					location: { lat: latitude, lng: longitude },
					lastUpdated: new Date(),
				});

				// Determine if we should write this new position into locationHistory.
				if (!lastHistoryLocationRef.current) {
					await addDoc(collection(db, 'users', user.uid, 'locationHistory'), {
						lat: latitude,
						lng: longitude,
						timestamp: new Date(),
					});
					lastHistoryLocationRef.current = { lat: latitude, lng: longitude };
				} else {
					// Calculate distance between the last history point and the new position.
					const distance = getDistanceFromLatLonInMeters(
						lastHistoryLocationRef.current.lat,
						lastHistoryLocationRef.current.lng,
						latitude,
						longitude
					);
					console.log(`Distance moved: ${distance.toFixed(2)} meters`);
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
			// Update location every 30 seconds.
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
	}, [user, db]); // Note: lastHistoryLocationRef is not in dependencies

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
			<div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-2xl">
				<h2 className="text-2xl font-bold text-center">
					👋 Welcome, {user?.email}
				</h2>
				{team && (
					<h3 className="text-lg text-gray-400 text-center mt-2">
						Team: <span className="font-semibold text-white">{team.name}</span>
					</h3>
				)}
				<div className="mt-6 p-4 bg-gray-700 rounded-lg text-center">
					{quest ? (
						<>
							<h3 className="text-xl font-semibold">📜 Current Quest:</h3>
							{/* Display quest media based on type */}
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
									{/* Use react-player to render the video */}
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
							<h3 className="text-xl font-semibold">🔑 Next Quest Hint:</h3>
							<p className="text-gray-300 mt-2">{nextHint}</p>
							<p className="text-gray-400 mt-2">
								Find the QR code and scan it!
							</p>
						</div>
					) : (
						<p className="text-gray-400">
							⚡ Scan a QR code to start your first quest!
						</p>
					)}
				</div>
				<div className="mt-6 p-4 bg-gray-700 rounded-lg text-center">
					<h3 className="text-xl font-semibold">
						💰 Team Currency: {currency}
					</h3>
				</div>
				{locationPermission === false && (
					<p className="mt-4 text-red-400 text-center">
						⚠️ Location access denied. Please enable location services.
					</p>
				)}
				<div className="flex flex-col sm:flex-row justify-between mt-6">
					<button
						onClick={() => navigate('/qrscanner')}
						className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-md mb-3 sm:mb-0 sm:mr-2"
					>
						📸 Scan QR Code
					</button>
					<button
						onClick={() => navigate('/shop')}
						className="w-full sm:w-auto bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-2 px-6 rounded-md"
					>
						🛒 Open Shop
					</button>
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
