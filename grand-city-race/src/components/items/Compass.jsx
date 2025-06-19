import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import compassBase from '../../assets/compass_base.png';
import compassNeedle from '../../assets/compass_needle.png';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	query,
	where,
	onSnapshot,
	Timestamp,
} from 'firebase/firestore';

// time format utility
function formatMMSS(totalSeconds) {
	const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
	const s = String(totalSeconds % 60).padStart(2, '0');
	return `${m}:${s}`;
}

// Throttle utility
function defaultThrottle(fn, limit) {
	let lastCall = 0;
	return (...args) => {
		const now = Date.now();
		if (now - lastCall >= limit) {
			lastCall = now;
			fn(...args);
		}
	};
}

// Normalize deviceorientation event into a consistent heading (0–360°)
function normalizeHeading(event) {
	let hdg = null;
	if (typeof event.webkitCompassHeading === 'number') {
		hdg = event.webkitCompassHeading;
	} else if (event.absolute === true && typeof event.alpha === 'number') {
		hdg = 360 - event.alpha;
	} else {
		return null;
	}
	const screenAngle =
		window.screen.orientation?.angle ?? window.orientation ?? 0;
	return (hdg + screenAngle + 360) % 360;
}

function toRadians(deg) {
	return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
	return (rad * 180) / Math.PI;
}

// Hook: bearing, distance, rotation, arrival detection
function useCompass(
	userLocation,
	targetLocation,
	deviceHeading,
	fence = 10,
	onUsed
) {
	const [needleRotation, setNeedleRotation] = useState(0);
	const [distance, setDistance] = useState(null);
	const prevRotationRef = useRef(null);
	const [arrivalReached, setArrivalReached] = useState(false);

	useEffect(() => {
		if (
			!userLocation ||
			!targetLocation ||
			deviceHeading == null ||
			arrivalReached
		)
			return;

		const dLon = toRadians(targetLocation.lng - userLocation.lng);
		const φ1 = toRadians(userLocation.lat);
		const φ2 = toRadians(targetLocation.lat);
		const y = Math.sin(dLon) * Math.cos(φ2);
		const x =
			Math.cos(φ1) * Math.sin(φ2) -
			Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
		let brng = (toDegrees(Math.atan2(y, x)) + 360) % 360;

		const R = 6371000;
		const dLat = toRadians(targetLocation.lat - userLocation.lat);
		const dLon2 = toRadians(targetLocation.lng - userLocation.lng);
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(toRadians(userLocation.lat)) *
				Math.cos(toRadians(targetLocation.lat)) *
				Math.sin(dLon2 / 2) ** 2;
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		const dist = R * c;

		const rawRotation = brng - deviceHeading;
		let newRotation = ((rawRotation % 360) + 360) % 360;
		if (prevRotationRef.current !== null) {
			let diff = newRotation - prevRotationRef.current;
			if (diff > 180) newRotation = prevRotationRef.current + (diff - 360);
			else if (diff < -180)
				newRotation = prevRotationRef.current + (diff + 360);
		}
		prevRotationRef.current = newRotation;

		setNeedleRotation(newRotation);
		setDistance(dist);

		const radius = targetLocation.fence ?? fence;
		if (dist <= radius - 5) {
			setArrivalReached(true);
			onUsed();
		}
	}, [
		userLocation,
		targetLocation,
		deviceHeading,
		fence,
		arrivalReached,
		onUsed,
	]);

	return { needleRotation, distance, arrivalReached };
}

// Hook: fetch the next quest from Firestore
function useNextQuest(db, team) {
	const [targetQuest, setTargetQuest] = useState(null);
	const [error, setError] = useState(null);

	useEffect(() => {
		async function fetchNextQuest() {
			try {
				if (team.progress?.currentQuest) return;
				let nextSeq = 1;
				const prev = team.progress?.previousQuests;
				if (Array.isArray(prev) && prev.length) {
					const lastId = prev[prev.length - 1];
					const lastSnap = await getDoc(doc(db, 'quests', lastId));
					if (lastSnap.exists()) {
						nextSeq = lastSnap.data().sequence + 1;
					}
				}
				const q = query(
					collection(db, 'quests'),
					where('sequence', '==', nextSeq)
				);
				const snap = await getDocs(q);
				if (!snap.empty) {
					const d = snap.docs[0];
					setTargetQuest({ id: d.id, ...d.data() });
				}
			} catch (err) {
				console.error(err);
				setError('Failed to load next quest.');
			}
		}
		fetchNextQuest();
	}, [db, team]);

	return [targetQuest, error];
}

const Compass = ({ user, team, db, onClose, onUsed }) => {
	const navigate = useNavigate();
	const [positionError, setPositionError] = useState(null);
	const [orientationError, setOrientationError] = useState(null);
	const [targetQuest, questError] = useNextQuest(db, team);
	const [userLocation, setUserLocation] = useState(null);
	const [deviceHeading, setDeviceHeading] = useState(null);

	// — subscribe to the user's activeItem (from users/{uid})
	const [userActiveItem, setUserActiveItem] = useState(null);
	useEffect(() => {
		if (!user) return;
		const ref = doc(db, 'users', user.uid);
		const unsub = onSnapshot(ref, (snap) => {
			setUserActiveItem(snap.data()?.activeItem || null);
		});
		return () => unsub();
	}, [db, user]);

	// read expiresAt from the user's activeItem
	const expiresAt =
		userActiveItem?.type === 'compass' ? userActiveItem.expiresAt : null;

	const [remainingSeconds, setRemainingSeconds] = useState(0);
	const firedRef = useRef(false);

	// tick the countdown from expiresAt
	useEffect(() => {
		if (!expiresAt) return;
		const tick = () => {
			const secs = Math.max(
				0,
				Math.floor((expiresAt.toMillis() - Date.now()) / 1000)
			);
			setRemainingSeconds(secs);

			if (secs === 0 && !firedRef.current) {
				firedRef.current = true;
				onClose();
				onUsed(); // clear your user inventory/activeItem
			}
		};

		tick();
		const iv = setInterval(tick, 1000);
		return () => clearInterval(iv);
	}, [expiresAt, onClose, onUsed]);

	// Geolocation
	useEffect(() => {
		if (!navigator.geolocation) {
			setPositionError('Geolocation not supported by this browser.');
			return;
		}
		const throttled = defaultThrottle((pos) => {
			setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
		}, 200);

		const id = navigator.geolocation.watchPosition(
			throttled,
			(err) => {
				console.error(err);
				setPositionError(err.message);
			},
			{ enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
		);
		return () => navigator.geolocation.clearWatch(id);
	}, []);

	// Device orientation
	useEffect(() => {
		const handler = defaultThrottle((event) => {
			const hdg = normalizeHeading(event);
			if (hdg != null) setDeviceHeading(hdg);
		}, 200);

		if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
			DeviceOrientationEvent.requestPermission()
				.then((res) => {
					if (res === 'granted')
						window.addEventListener('deviceorientation', handler, true);
					else setOrientationError('Compass permission denied.');
				})
				.catch((err) => {
					console.error(err);
					setOrientationError('Failed to get compass permission.');
				});
		} else {
			window.addEventListener('deviceorientation', handler, true);
		}
		return () => window.removeEventListener('deviceorientation', handler, true);
	}, []);

	const { needleRotation, distance, arrivalReached } = useCompass(
		userLocation,
		targetQuest?.location,
		deviceHeading,
		10,
		onUsed
	);

	const hasActive = Boolean(team.progress?.currentQuest);

	// Error display
	if (positionError || orientationError || questError) {
		return (
			<div className="p-4">
				{positionError && (
					<div role="alert" className="text-red-500 mb-2">
						{positionError}
					</div>
				)}
				{orientationError && (
					<div role="alert" className="text-red-500 mb-2">
						{orientationError}
					</div>
				)}
				{questError && (
					<div role="alert" className="text-red-500">
						{questError}
					</div>
				)}
			</div>
		);
	}

	if (!orientationError && deviceHeading == null) {
		return (
			<div className="p-4 text-yellow-300" role="status">
				Wave your device in a figure-8 to calibrate the compass.
			</div>
		);
	}

	if (hasActive) {
		return (
			<div className="relative flex flex-col items-center p-4">
				<button
					aria-label="Close compass"
					className="absolute top-2 right-2 text-white bg-gray-800 rounded-full p-2 z-10"
					onClick={onClose}
				>
					✕
				</button>
				<p>Compass not available – solve your active quest first.</p>
			</div>
		);
	}

	return (
		<div className="relative flex flex-col items-center p-4">
			<button
				aria-label="Close compass"
				className="absolute top-2 right-2 text-white bg-gray-800 rounded-full p-2 z-10"
				onClick={onClose}
			>
				✕
			</button>

			{/* Countdown badge */}
			{remainingSeconds > 0 && (
				<div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-75 text-parchment px-3 py-1 rounded">
					{formatMMSS(remainingSeconds)}
				</div>
			)}

			{/* Compass UI */}
			<div className="relative" style={{ width: '300px', height: '300px' }}>
				<img src={compassBase} alt="Compass base" className="w-full h-full" />
				<img
					src={compassNeedle}
					alt=""
					role="presentation"
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

				{arrivalReached && (
					<div className="absolute inset-0 bg-white bg-opacity-90 flex flex-col items-center justify-center p-4">
						<div className="text-xl font-bold mb-4 text-center text-charcoal">
							You’ve reached the quest-area!
						</div>
						<button
							onClick={() => {
								navigate('/dashboard');
							}}
							className="px-4 py-2 bg-blue-600 text-white rounded shadow"
						>
							Continue
						</button>
					</div>
				)}
			</div>

			<p className="mt-4 font-bold text-gray-300 text-3xl">
				{distance != null ? `${Math.round(distance)} m` : '-- m'}
			</p>
		</div>
	);
};

export default Compass;
