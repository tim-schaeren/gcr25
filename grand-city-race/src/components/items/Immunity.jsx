import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
	doc,
	getDoc,
	updateDoc,
	onSnapshot,
	Timestamp,
} from 'firebase/firestore';

// time format utility
function formatMMSS(totalSeconds) {
	const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
	const s = String(totalSeconds % 60).padStart(2, '0');
	return `${m}:${s}`;
}

const Immunity = ({ user, teamId, selectedItem, db, onClose, onUsed }) => {
	const { t } = useTranslation();
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [refundAvailable, setRefundAvailable] = useState();
	const [hasApplied, setHasApplied] = useState(false);
	const [remainingSeconds, setRemainingSeconds] = useState(0);
	const firedRef = useRef(false);

	// Subscribe to user's activeItem for expiresAt
	const [userActiveItem, setUserActiveItem] = useState(null);
	useEffect(() => {
		if (!user) return;
		const ref = doc(db, 'users', user.uid);
		const unsub = onSnapshot(ref, (snap) => {
			setUserActiveItem(snap.data()?.activeItem || null);
		});
		return () => unsub();
	}, [db, user]);

	const expiresAt =
		userActiveItem?.type === 'immunity' ? userActiveItem.expiresAt : null;

	// Check if we should refund instead of apply
	useEffect(() => {
		if (!expiresAt) return;

		async function clearRefundIfApplicable() {
			try {
				const teamRef = doc(db, 'teams', teamId);
				const snap = await getDoc(teamRef);
				const data = snap.data() || {};
				const nowMs = Timestamp.now().toMillis();
				const stillCursed = (data.cursedUntil?.toMillis() || 0) > nowMs;
				if (!stillCursed) {
					setHasApplied(true);
					setRefundAvailable(false);
				}
			} catch (err) {
				console.error('Failed to re-check curse status:', err);
			}
		}

		clearRefundIfApplicable();
	}, [expiresAt, db, teamId]);

	// On mount or when expiresAt changes: apply immunity if not already
	useEffect(() => {
		let cancelled = false;
		async function init() {
			if (expiresAt || refundAvailable || hasApplied) return;
			try {
				const teamRef = doc(db, 'teams', teamId);
				const snap = await getDoc(teamRef);
				const data = snap.data() || {};
				const now = Timestamp.now();

				if (
					data.immuneUntil?.toMillis() > now.toMillis() ||
					data.cursedUntil?.toMillis() > now.toMillis()
				) {
					setRefundAvailable(true);
				} else {
					const msImmune = selectedItem.duration * 60 * 1000;
					const immuneUntil = Timestamp.fromMillis(now.toMillis() + msImmune);
					await updateDoc(teamRef, { immuneUntil });
					if (!cancelled) setHasApplied(true);
				}
			} catch (err) {
				console.error(err);
				setLocalError(t('immunity.errors.apply'));
			}
		}

		init();
		return () => {
			cancelled = true;
		};
	}, [
		db,
		teamId,
		selectedItem.duration,
		expiresAt,
		refundAvailable,
		hasApplied,
		t,
	]);

	// Countdown for active immunity
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
				onUsed();
			}
		};

		tick();
		const iv = setInterval(tick, 1000);
		return () => clearInterval(iv);
	}, [expiresAt, onClose, onUsed]);

	// Refund handler when already immune
	const handleBonusClaim = async () => {
		setIsProcessing(true);
		try {
			const teamRef = doc(db, 'teams', teamId);
			const snap = await getDoc(teamRef);
			const data = snap.data() || {};
			await updateDoc(teamRef, {
				currency: (data.currency || 0) + selectedItem.price,
			});
			await onUsed();
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError(t('immunity.errors.claimRefund'));
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="relative bg-olive rounded-lg shadow-lg p-6">
			{!refundAvailable && (
				<button
					onClick={onClose}
					aria-label="Close"
					className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl font-bold leading-none"
				>
					×
				</button>
			)}

			{localError && <p className="text-red-500 mb-2">{localError}</p>}

			{refundAvailable ? (
				<div>
					<p className="mb-4">{t('immunity.refundMessage')}</p>
					<button
						onClick={handleBonusClaim}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing
							? t('immunity.processing')
							: t('immunity.claimRefund')}
					</button>
				</div>
			) : hasApplied ? (
				<div className="flex flex-col items-center">
					<p className="mb-2 text-xl font-semibold">
						{t('immunity.active.title')}
					</p>
					<p className="mb-4 text-2xl">{formatMMSS(remainingSeconds)}</p>
				</div>
			) : (
				<div>
					<p>{t('immunity.applying')}</p>
				</div>
			)}
		</div>
	);
};

export default Immunity;
