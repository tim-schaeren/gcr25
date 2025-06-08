// src/components/Compass.jsx
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
} from 'firebase/firestore';

// Throttle utility
function throttle(fn, limit) {
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
	const final = (hdg + screenAngle + 360) % 360;
	console.log(
		'raw alpha:',
		event.alpha,
		'absolute:',
		event.absolute,
		'webkitHeading:',
		event.webkitCompassHeading,
		'screenAngle:',
		screenAngle,
		'final heading:',
		final
	);
	return final;
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
		if (!userLocation || !targetLocation || deviceHeading == null) return;

		// Calculate bearing to target
		const dLon = toRadians(targetLocation.lng - userLocation.lng);
		const φ1 = toRadians(userLocation.lat);
		const φ2 = toRadians(targetLocation.lat);
		const y = Math.sin(dLon) * Math.cos(φ2);
		const x =
			Math.cos(φ1) * Math.sin(φ2) -
			Math.sin(φ1) * Math.cos(φ2) * Math.cos(dLon);
		let brng = toDegrees(Math.atan2(y, x));
		brng = (brng + 360) % 360;

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

		// Determine needle rotation (bearing relative to deviceHeading)
		const rawRotation = brng - deviceHeading;
		const offset = 0;
		let newRotation = (((rawRotation + offset) % 360) + 360) % 360;

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

		// Arrival detection with jitter guard
		const radius = targetLocation.fence != null ? targetLocation.fence : fence;
		if (dist <= radius - 5) {
			setArrivalReached(true);
		}
	}, [userLocation, targetLocation, deviceHeading, fence]);

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

const Compass = ({ team, db, onClose, onUsed }) => {
	const navigate = useNavigate();
	const [positionError, setPositionError] = useState(null);
	const [orientationError, setOrientationError] = useState(null);
	const [targetQuest, questError] = useNextQuest(db, team);
	const [userLocation, setUserLocation] = useState(null);
	const [deviceHeading, setDeviceHeading] = useState(null);

	// Geolocation with throttling
	useEffect(() => {
		if (!navigator.geolocation) {
			setPositionError('Geolocation not supported by this browser.');
			return;
		}
		const throttled = throttle((pos) => {
			setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
		}, 100);

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

	// Orientation with normalize and throttling
	useEffect(() => {
		const handler = throttle((event) => {
			const hdg = normalizeHeading(event);
			if (hdg != null) setDeviceHeading(hdg);
		}, 100);

		if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
			DeviceOrientationEvent.requestPermission()
				.then((res) => {
					if (res === 'granted') {
						window.addEventListener('deviceorientation', handler, true);
					} else {
						setOrientationError('Compass permission denied.');
					}
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

	// On arrival, trigger onUsed and navigate
	useEffect(() => {
		if (arrivalReached) {
			onUsed?.();
			const t = setTimeout(() => navigate('/dashboard'), 5000);
			return () => clearTimeout(t);
		}
	}, [arrivalReached, onUsed, navigate]);

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
		<div className="relative flex flex-col items-center">
			<button
				aria-label="Close compass"
				className="absolute top-2 right-2 text-white bg-gray-800 rounded-full p-2 z-10"
				onClick={onClose}
			>
				✕
			</button>
			<div className="relative" style={{ width: '300px', height: '300px' }}>
				<img src={compassBase} alt="Compass base" className="w-full h-full" />
				<img
					src={compassNeedle}
					alt="Compass needle"
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
					<div
						className="absolute bg-green-600 bg-opacity-80 text-white p-2 rounded"
						style={{ bottom: '10%', width: '100%', textAlign: 'center' }}
					>
						You've reached your destination!
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
