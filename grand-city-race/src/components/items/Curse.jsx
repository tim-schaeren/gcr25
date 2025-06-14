import React, { useEffect, useState } from 'react';
import {
	collection,
	getDocs,
	doc,
	updateDoc,
	query,
	where,
	Timestamp,
} from 'firebase/firestore';

const Curse = ({ team, selectedItem, db, onClose }) => {
	const [availableTeams, setAvailableTeams] = useState([]);
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);

	const durationMinutes = selectedItem.duration;
	const coolDownMinutes = selectedItem.coolDownPeriod;

	useEffect(() => {
		const fetchEligible = async () => {
			try {
				const teamsSnap = await getDocs(collection(db, 'teams'));
				const allTeams = teamsSnap.docs.map((d) => ({
					id: d.id,
					ref: d.ref,
					...d.data(),
				}));

				const now = Timestamp.now();
				const eligible = allTeams.filter((t) => {
					if (t.id === team.id) return false;
					if (t.cursedUntil && t.cursedUntil.toMillis() > now.toMillis())
						return false;
					if (t.immuneUntil && t.immuneUntil.toMillis() > now.toMillis())
						return false;
					return true;
				});

				if (!eligible.length) {
					setAvailableTeams([]);
					return;
				}

				const ids = eligible.map((t) => t.id);
				const usersQuery = query(
					collection(db, 'users'),
					where('teamId', 'in', ids)
				);
				const usersSnap = await getDocs(usersQuery);
				const membersByTeam = {};
				usersSnap.docs.forEach((u) => {
					const { teamId, name } = u.data();
					if (!membersByTeam[teamId]) membersByTeam[teamId] = [];
					membersByTeam[teamId].push(name);
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
	}, [db, team]);

	const handleTargetSelect = async (targetTeam) => {
		setIsProcessing(true);
		try {
			const now = Timestamp.now();
			if (
				targetTeam.cursedUntil &&
				targetTeam.cursedUntil.toMillis() > now.toMillis()
			) {
				setLocalError(`Team ${targetTeam.name} is already cursed.`);
				return;
			}
			if (
				targetTeam.immuneUntil &&
				targetTeam.immuneUntil.toMillis() > now.toMillis()
			) {
				setLocalError(`Team ${targetTeam.name} is immune at the moment.`);
				return;
			}

			// compute timestamps
			const msCurse = durationMinutes * 60 * 1000;
			const msImmune = (durationMinutes + coolDownMinutes) * 60 * 1000;
			const cursedUntil = Timestamp.fromMillis(now.toMillis() + msCurse);
			const immuneUntil = Timestamp.fromMillis(now.toMillis() + msImmune);

			await updateDoc(targetTeam.ref, {
				cursedUntil,
				cursedBy: team.id,
				immuneUntil,
			});

			// deduct from inventory
			const teamRef = doc(db, 'teams', team.id);
			const newInventory = { ...(team.inventory || {}) };
			newInventory[selectedItem.id] = (newInventory[selectedItem.id] || 1) - 1;
			await updateDoc(teamRef, {
				inventory: newInventory,
				activeItem: null,
			});

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
			{/* Close button */}
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
					<p className="mb-4">No teams are currently able to be cursed.</p>
					<button
						onClick={onClose}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing ? 'Processing...' : 'Go Back'}
					</button>
				</div>
			) : (
				<div>
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
