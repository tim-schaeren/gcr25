import React, { useState, useEffect, useRef } from 'react';
import compassBase from '../../assets/compass_base.png';
import compassNeedle from '../../assets/compass_needle.png';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	query,
	where,
} from 'firebase/firestore';

// Helper function to compute bearing in degrees from one lat/lng to another.
function calculateBearing(lat1, lon1, lat2, lon2) {
	const toRadians = (deg) => (deg * Math.PI) / 180;
	const toDegrees = (rad) => (rad * 180) / Math.PI;
	const dLon = toRadians(lon2 - lon1);
	const φ1 = toRadians(lat1);
	const φ2 = toRadians(lat2);
	const y = Math.sin(dLon) * Math.cos(φ2);
	const x =
		Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
	let brng = Math.atan2(y, x);
	brng = toDegrees(brng);
	return (brng + 360) % 360;
}

// Helper function to calculate the distance (in meters) between two lat/lng coordinates.
function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
	const R = 6371000; // Earth radius in meters
	const toRadians = (deg) => (deg * Math.PI) / 180;
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(lat1)) *
			Math.cos(toRadians(lat2)) *
			Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

const Compass = ({ team, selectedItem, db, onClose, onUsed }) => {
	const [targetQuest, setTargetQuest] = useState(null);
	const [userLocation, setUserLocation] = useState(null);
	const [deviceHeading, setDeviceHeading] = useState(0);
	const [needleRotation, setNeedleRotation] = useState(0);
	const [distance, setDistance] = useState(null);
	const [arrivalMessage, setArrivalMessage] = useState('');
	// State to mark if the user manually closed the modal.
	const [manualExit, setManualExit] = useState(false);
	// Ref to store the previous rotation (for smoothing transitions)
	const prevRotationRef = useRef(null);

	// Fetch the target quest (next quest to activate) unless a quest is active.
	useEffect(() => {
		const fetchNextQuest = async () => {
			if (team.progress && team.progress.currentQuest) return;
			let nextSequence = 1;
			if (
				team.progress &&
				team.progress.previousQuests &&
				team.progress.previousQuests.length > 0
			) {
				const lastQuestId =
					team.progress.previousQuests[team.progress.previousQuests.length - 1];
				const lastQuestRef = doc(db, 'quests', lastQuestId);
				const lastQuestSnap = await getDoc(lastQuestRef);
				if (lastQuestSnap.exists()) {
					const lastQuestData = lastQuestSnap.data();
					nextSequence = lastQuestData.sequence + 1;
				}
			}
			const questsRef = collection(db, 'quests');
			const qNext = query(questsRef, where('sequence', '==', nextSequence));
			const nextSnap = await getDocs(qNext);
			if (!nextSnap.empty) {
				const questDoc = nextSnap.docs[0];
				setTargetQuest({ id: questDoc.id, ...questDoc.data() });
			}
		};
		fetchNextQuest();
	}, [team, db]);

	// Set up geolocation watcher.
	useEffect(() => {
		if (!navigator.geolocation) {
			console.error('Geolocation is not supported by this browser.');
			return;
		}
		const watchId = navigator.geolocation.watchPosition(
			(position) => {
				const loc = {
					lat: position.coords.latitude,
					lng: position.coords.longitude,
				};
				setUserLocation(loc);
			},
			(error) => console.error('Error watching position:', error),
			{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
		);
		return () => navigator.geolocation.clearWatch(watchId);
	}, []);

	// Set up device orientation listener.
	useEffect(() => {
		const handleOrientation = (event) => {
			const heading = event.alpha || event.webkitCompassHeading || 0;
			setDeviceHeading(heading);
		};
		if (
			typeof DeviceOrientationEvent !== 'undefined' &&
			typeof DeviceOrientationEvent.requestPermission === 'function'
		) {
			DeviceOrientationEvent.requestPermission()
				.then((response) => {
					if (response === 'granted') {
						window.addEventListener(
							'deviceorientation',
							handleOrientation,
							true
						);
					} else {
						console.warn('Device orientation permission denied');
					}
				})
				.catch((error) =>
					console.error(
						'Error requesting device orientation permission:',
						error
					)
				);
		} else {
			window.addEventListener('deviceorientation', handleOrientation, true);
		}
		return () => {
			window.removeEventListener('deviceorientation', handleOrientation);
		};
	}, []);

	// Compute needle rotation and distance.
	useEffect(() => {
		if (!userLocation || !targetQuest) return;
		const bearing = calculateBearing(
			userLocation.lat,
			userLocation.lng,
			targetQuest.location.lat,
			targetQuest.location.lng
		);
		const rawRotation = deviceHeading - bearing;
		const offset = 90;
		let newRotation = (((rawRotation + offset) % 360) + 360) % 360;
		// Smoothing: adjust if the jump is large.
		if (prevRotationRef.current !== null) {
			let diff = newRotation - prevRotationRef.current;
			if (diff > 180) {
				newRotation = prevRotationRef.current + (diff - 360);
			} else if (diff < -180) {
				newRotation = prevRotationRef.current + (diff + 360);
			}
		}
		prevRotationRef.current = newRotation;
		setNeedleRotation(newRotation);

		const dist = getDistanceFromLatLonInMeters(
			userLocation.lat,
			userLocation.lng,
			targetQuest.location.lat,
			targetQuest.location.lng
		);
		setDistance(dist);

		if (dist <= targetQuest.location.fence - 5 && !manualExit) {
			setArrivalMessage(
				"You've reached your destination! Thank you for travelling with GCR25."
			);
			if (typeof onUsed === 'function') {
				onUsed();
			}
			setTimeout(() => {
				onClose();
			}, 5000);
		} else {
			setArrivalMessage('');
		}
	}, [userLocation, targetQuest, deviceHeading, onClose, onUsed, manualExit]);

	// Compute whether the user is already inside the quest's fence.
	const alreadyAtQuest =
		userLocation &&
		targetQuest &&
		getDistanceFromLatLonInMeters(
			userLocation.lat,
			userLocation.lng,
			targetQuest.location.lat,
			targetQuest.location.lng
		) <= targetQuest.location.fence;

	// Compute whether there is an active quest.
	const hasActiveQuest = team && team.progress && team.progress.currentQuest;

	// If an active quest exists or the user is already at the quest location,
	// render a container with the message and an "X" button.
	if (hasActiveQuest || alreadyAtQuest) {
		return (
			<div className="relative flex flex-col items-center p-4">
				<button
					className="absolute top-2 right-2 text-white bg-gray-800 rounded-full p-2 z-10"
					onClick={onClose}
				>
					✕
				</button>
				<div className="p-4 text-center">
					<p>
						Compass not available –{' '}
						{hasActiveQuest
							? 'You already have an active quest.'
							: 'You are already at a quest-location.'}
					</p>
				</div>
			</div>
		);
	}

	// Otherwise, render the normal compass UI.
	return (
		<div className="relative flex flex-col items-center">
			{/* Close (X) Button always visible */}
			<button
				className="absolute top-2 right-2 text-white bg-gray-800 rounded-full p-2 z-10"
				onClick={() => {
					setManualExit(true);
					onClose();
				}}
			>
				✕
			</button>
			<div className="relative" style={{ width: '300px', height: '300px' }}>
				<img
					src={compassBase}
					alt="Compass Base"
					style={{ width: '100%', height: '100%' }}
				/>
				<img
					src={compassNeedle}
					alt="Compass Needle"
					style={{
						width: '55%',
						height: '80%',
						position: 'absolute',
						top: '11%',
						left: '23%',
						transform: `rotate(${needleRotation}deg)`,
						transition: 'transform 0.5s ease-out',
						pointerEvents: 'none',
					}}
				/>
				{arrivalMessage && (
					<div
						className="absolute bg-green-600 bg-opacity-80 text-white p-2 rounded"
						style={{ bottom: '10%', width: '100%', textAlign: 'center' }}
					>
						{arrivalMessage}
					</div>
				)}
			</div>
			<p className="mt-4 font-bold text-gray-300 text-3xl">
				{distance !== null ? `${Math.round(distance)} m` : '-- m'}
			</p>
		</div>
	);
};

export default Compass;
