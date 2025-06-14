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
	Timestamp,
	updateDoc,
	onSnapshot,
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
	// iOS Safari provides magnetic heading directly
	if (typeof event.webkitCompassHeading === 'number') {
		hdg = event.webkitCompassHeading;
	} else if (event.absolute === true && typeof event.alpha === 'number') {
		hdg = 360 - event.alpha;
	} else {
		return null;
	}
	// Compensate for screen orientation
	const screenAngle =
		window.screen.orientation?.angle ?? window.orientation ?? 0;
	return (hdg + screenAngle + 360) % 360;
}

// Math helpers
function toRadians(deg) {
	return (deg * Math.PI) / 180;
}

function toDegrees(rad) {
	return (rad * 180) / Math.PI;
}

// Hook: bearing, distance, rotation, arrival detection
function useCompass(userLocation, targetLocation, deviceHeading, fence = 10) {
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

		// Calculate bearing to target
		const dLon = toRadians(targetLocation.lng - userLocation.lng);
		const φ1 = toRadians(userLocation.lat);
		const φ2 = toRadians(targetLocation.lat);
		const y = Math.sin(dLon) * Math.cos(φ2);
		const x =
			Math.cos(φ1) * Math.sin(φ2) -
			Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
		let brng = (toDegrees(Math.atan2(y, x)) + 360) % 360;

		// Haversine distance
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

		// Needle rotation
		const rawRotation = brng - deviceHeading;
		let newRotation = ((rawRotation % 360) + 360) % 360;
		// Smooth large jumps
		if (prevRotationRef.current !== null) {
			let diff = newRotation - prevRotationRef.current;
			if (diff > 180) newRotation = prevRotationRef.current + (diff - 360);
			else if (diff < -180)
				newRotation = prevRotationRef.current + (diff + 360);
		}
		prevRotationRef.current = newRotation;

		setNeedleRotation(newRotation);
		setDistance(dist);

		// Arrival detection
		const radius = targetLocation.fence ?? fence;
		if (dist <= radius - 5) {
			setArrivalReached(true);
		}
	}, [userLocation, targetLocation, deviceHeading, fence, arrivalReached]);

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

const Compass = ({ team, db, onClose, onUsed, selectedItem }) => {
	const durationMinutes = selectedItem.duration;
	const navigate = useNavigate();
	const [positionError, setPositionError] = useState(null);
	const [orientationError, setOrientationError] = useState(null);
	const [targetQuest, questError] = useNextQuest(db, team);
	const [userLocation, setUserLocation] = useState(null);
	const [deviceHeading, setDeviceHeading] = useState(null);

	// countdown
	const [compassActiveUntil, setCompassActiveUntil] = useState(null);
	const [remainingSeconds, setRemainingSeconds] = useState(0);
	// guard to fire onUsed only once
	const hasFiredUsed = useRef(false);

	// set compassActiveUntil
	useEffect(() => {
		if (!team?.id) return;
		const teamRef = doc(db, 'teams', team.id);
		const unsub = onSnapshot(teamRef, (snap) => {
			if (!snap.exists()) return;
			const ts = snap.data().compassActiveUntil;
			setCompassActiveUntil(ts ?? null);
		});
		return unsub;
	}, [db, team?.id]);

	useEffect(() => {
		// if there's no timestamp or it's already expired, write a fresh one
		if (!compassActiveUntil || compassActiveUntil.toMillis() <= Date.now()) {
			const now = Date.now();
			const newTs = Timestamp.fromMillis(now + durationMinutes * 60_000);
			updateDoc(doc(db, 'teams', team.id), {
				compassActiveUntil: newTs,
			});
			hasFiredUsed.current = false; // reset our guard
		}
	}, [compassActiveUntil, db, team.id, durationMinutes]);

	// tick the timer
	useEffect(() => {
		if (!compassActiveUntil) return;
		const tick = () => {
			const secs = Math.max(
				0,
				Math.floor((compassActiveUntil.toMillis() - Date.now()) / 1000)
			);
			setRemainingSeconds(secs);

			// once it hits zero, fire onUsed exactly once, then clear the field
			if (secs === 0 && !hasFiredUsed.current) {
				hasFiredUsed.current = true;
				onUsed();
				updateDoc(doc(db, 'teams', team.id), {
					compassActiveUntil: null,
				});
			}
		};

		tick();
		const iv = setInterval(tick, 1000);
		return () => clearInterval(iv);
	}, [compassActiveUntil, db, team.id, onUsed]);

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
		10
	);

	const hasActive = Boolean(team.progress?.currentQuest);

	const handleContinue = () => {
		onUsed?.();
		navigate('/dashboard');
	};

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

			{remainingSeconds > 0 && (
				<div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-75 text-white px-3 py-1 rounded">
					{formatMMSS(remainingSeconds)}
				</div>
			)}

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
							onClick={handleContinue}
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
