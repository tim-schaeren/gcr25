import React, { useState, useEffect } from 'react';
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

const Compass = ({ team, selectedItem, db, onClose }) => {
	const [targetQuest, setTargetQuest] = useState(null);
	const [userLocation, setUserLocation] = useState(null);
	const [deviceHeading, setDeviceHeading] = useState(0);
	const [needleRotation, setNeedleRotation] = useState(0);
	const [distance, setDistance] = useState(null);
	const [arrivalMessage, setArrivalMessage] = useState('');

	// Fetch the target quest (next quest to activate) unless a quest is already active.
	useEffect(() => {
		const fetchNextQuest = async () => {
			// If an active quest is already set on the team, exit.
			if (team.progress && team.progress.currentQuest) {
				return;
			}

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
			// Query for quest with the desired sequence.
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

	// Set up a geolocation watcher to update the user's location continuously.
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

	// Set up a device orientation listener if available.
	useEffect(() => {
		const handleOrientation = (event) => {
			// event.alpha gives the orientation relative to north.
			const heading = event.alpha || event.webkitCompassHeading || 0;
			setDeviceHeading(heading);
		};

		// Check if permission is required (iOS 13+)
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
			// For browsers that don't require permission
			window.addEventListener('deviceorientation', handleOrientation, true);
		}

		return () => {
			window.removeEventListener('deviceorientation', handleOrientation);
		};
	}, []);

	// Compute the needle rotation and distance whenever userLocation, targetQuest, or deviceHeading changes.
	useEffect(() => {
		if (!userLocation || !targetQuest) return;
		// Calculate the bearing from the user's location to the target.
		const bearing = calculateBearing(
			userLocation.lat,
			userLocation.lng,
			targetQuest.location.lat,
			targetQuest.location.lng
		);
		// The needle should point relative to the device's heading.
		// For a proper compass effect, we subtract the deviceHeading from the bearing.
		let rotation = bearing - deviceHeading;
		// Normalize the rotation to between 0 and 360.
		rotation = ((rotation % 360) + 360) % 360;
		setNeedleRotation(rotation);

		// Compute the distance in meters.
		const dist = getDistanceFromLatLonInMeters(
			userLocation.lat,
			userLocation.lng,
			targetQuest.location.lat,
			targetQuest.location.lng
		);
		setDistance(dist);

		// If the user has reached the fence of the quest (and 5m in)
		if (dist <= targetQuest.location.fence - 5) {
			setArrivalMessage(
				"You've reached your destination! Thank you for travelling with GCR25."
			);
			// After 5 seconds, automatically close the compass.
			setTimeout(() => {
				onClose();
			}, 5000);
		} else {
			setArrivalMessage('');
		}
	}, [userLocation, targetQuest, deviceHeading, onClose]);

	// Render nothing if there is no targetQuest or if an active quest is already set.
	if (!targetQuest || (team.progress && team.progress.currentQuest)) {
		return (
			<div className="p-4 text-center">
				<p>Compass not available – You are already at a quest-location.</p>
			</div>
		);
	}

	return (
		<div className="relative flex flex-col items-center">
			{/* Compass Container */}
			<div className="relative" style={{ width: '300px', height: '300px' }}>
				{/* Compass Base Image (replace with your actual image URL) */}
				<img
					src={compassBase}
					alt="Compass Base"
					style={{ width: '100%', height: '100%' }}
				/>
				{/* Needle Image: absolutely centered and rotated */}
				<img
					src={compassNeedle}
					alt="Compass Needle"
					style={{
						width: '60%',
						height: '60%',
						position: 'absolute',
						top: '20%', // center vertically (adjust as needed)
						left: '20%', // center horizontally (adjust as needed)
						transform: `rotate(${needleRotation}deg)`,
						transition: 'transform 0.5s ease-out',
						pointerEvents: 'none',
					}}
				/>
				{/* Overlay Distance (positioned at the top center) */}
				<div
					className="absolute text-white font-bold"
					style={{ top: '10%', width: '100%', textAlign: 'center' }}
				>
					{distance !== null ? `${Math.round(distance)} m` : '-- m'}
				</div>
				{/* Arrival Message overlay */}
				{arrivalMessage && (
					<div
						className="absolute bg-green-600 bg-opacity-80 text-white p-2 rounded"
						style={{ bottom: '10%', width: '100%', textAlign: 'center' }}
					>
						{arrivalMessage}
					</div>
				)}
			</div>
			{/* Optional: Additional text or instructions */}
			<p className="mt-4 text-sm text-gray-300">
				Point your device and follow the needle to the next quest location.
			</p>
		</div>
	);
};

export default Compass;
