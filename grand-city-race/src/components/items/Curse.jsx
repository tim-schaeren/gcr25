import React, { useEffect, useState } from 'react';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
	query,
	where,
	Timestamp,
} from 'firebase/firestore';

const Curse = ({ user, teamId, selectedItem, db, onClose, onUsed }) => {
	const [availableTeams, setAvailableTeams] = useState([]);
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);

	const durationMinutes = selectedItem.duration;
	const coolDownMinutes = selectedItem.coolDownPeriod;
	const price = selectedItem.price; // ← grab the item’s cost so we can refund it

	useEffect(() => {
		console.log('🔥 Curse component received teamId:', teamId);
		const fetchEligible = async () => {
			try {
				// 1) grab *all* teams
				const teamsSnap = await getDocs(collection(db, 'teams'));
				const allTeams = teamsSnap.docs.map((d) => ({
					id: d.id,
					ref: d.ref,
					...d.data(),
				}));

				// 2) filter out your own + already cursed/immune
				const now = Timestamp.now();

				allTeams.forEach((t) => {
					console.log(
						`-- checking team ${t.id}:`,
						`equals current?`,
						t.id === teamId,
						`cursed?`,
						t.cursedUntil?.toMillis() > now.toMillis(),
						`immune?`,
						t.immuneUntil?.toMillis() > now.toMillis()
					);
				});

				const eligible = allTeams.filter((t) => {
					if (t.id === teamId) return false;
					if (t.cursedUntil?.toMillis() > now.toMillis()) return false;
					if (t.immuneUntil?.toMillis() > now.toMillis()) return false;
					return true;
				});

				if (eligible.length === 0) {
					setAvailableTeams([]);
					return;
				}

				// 3) get member names per team
				const ids = eligible.map((t) => t.id);
				const usersQuery = query(
					collection(db, 'users'),
					where('teamId', 'in', ids)
				);
				const usersSnap = await getDocs(usersQuery);
				const membersByTeam = {};
				usersSnap.docs.forEach((u) => {
					const { teamId: tid, name } = u.data();
					membersByTeam[tid] = membersByTeam[tid] || [];
					membersByTeam[tid].push(name);
				});

				setAvailableTeams(
					eligible.map((t) => ({
						...t,
						members: membersByTeam[t.id] || [],
					}))
				);
			} catch (err) {
				console.error(err);
				setLocalError('Failed to fetch teams.');
			}
		};

		fetchEligible();
	}, [db, teamId]);

	// Refund handler when no teams are curse-able
	const handleBonusClaim = async () => {
		setIsProcessing(true);
		try {
			// 1) Top your team’s bank back up by `price`
			const yourTeamRef = doc(db, 'teams', teamId);
			const yourSnap = await getDoc(yourTeamRef);
			const yourData = yourSnap.data() || {};
			await updateDoc(yourTeamRef, {
				currency: (yourData.currency || 0) + price,
			});

			// 2) Clear your activeItem/inventory flag
			await onUsed();

			// 3) Close the modal
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError('Failed to claim refund.');
		} finally {
			setIsProcessing(false);
		}
	};

	const handleTargetSelect = async (targetTeam) => {
		setIsProcessing(true);
		try {
			const now = Timestamp.now();

			// sanity checks
			if (targetTeam.cursedUntil?.toMillis() > now.toMillis()) {
				setLocalError(`Team ${targetTeam.name} is already cursed.`);
				return;
			}
			if (targetTeam.immuneUntil?.toMillis() > now.toMillis()) {
				setLocalError(`Team ${targetTeam.name} is immune right now.`);
				return;
			}

			// compute new timestamps
			const msCurse = durationMinutes * 60 * 1000;
			const msImmune = (durationMinutes + coolDownMinutes) * 60 * 1000;
			const cursedUntil = Timestamp.fromMillis(now.toMillis() + msCurse);
			const immuneUntil = Timestamp.fromMillis(now.toMillis() + msImmune);

			// 1) apply curse to the *target* team
			await updateDoc(targetTeam.ref, {
				cursedUntil,
				cursedBy: teamId,
				immuneUntil,
			});

			// 2) notify Shop to clear *your* inventory/activeItem
			await onUsed();

			// 3) close modal
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError('Failed to process curse.');
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<div className="relative bg-charcoal rounded-lg shadow-lg p-6">
			<button
				onClick={onClose}
				aria-label="Close"
				className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-xl font-bold leading-none"
			>
				×
			</button>

			<h3 className="text-xl font-semibold mb-4">Select a team to curse:</h3>
			{localError && <p className="text-red-500 mb-2">{localError}</p>}

			{availableTeams.length === 0 ? (
				<div>
					<p className="mb-4">
						No teams are currently able to be cursed. Here’s your money back.
					</p>
					<button
						onClick={handleBonusClaim}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing ? 'Processing...' : 'Claim Refund'}
					</button>
				</div>
			) : (
				<div className="space-y-2 max-h-64 overflow-y-auto mb-4">
					{availableTeams.map((t) => (
						<button
							key={t.id}
							onClick={() => handleTargetSelect(t)}
							disabled={isProcessing}
							className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded mb-2 block w-full text-left"
						>
							{t.name}
							{t.members.length > 0 && ` (${t.members.join(', ')})`}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default Curse;
