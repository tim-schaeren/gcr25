import React, { useEffect, useState } from 'react';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
	Timestamp,
} from 'firebase/firestore';

const Robbery = ({ user, teamId, selectedItem, db, onClose, onUsed }) => {
	const [availableTeams, setAvailableTeams] = useState([]);
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const stealAmount = selectedItem.stealAmount;
	const price = selectedItem.price;

	// Fetch eligible teams (all except yours, with enough currency, not immune)
	useEffect(() => {
		const fetchEligibleTeams = async () => {
			try {
				const snap = await getDocs(collection(db, 'teams'));
				const all = snap.docs.map((d) => ({
					id: d.id,
					...d.data(),
					ref: d.ref,
				}));

				const now = Timestamp.now();
				const eligible = all.filter((t) => {
					if (t.id === teamId) return false;
					if ((t.currency || 0) < stealAmount) return false;
					if (t.immuneUntil?.toMillis() > now.toMillis()) return false;
					return true;
				});

				setAvailableTeams(eligible);
			} catch (err) {
				console.error(err);
				setLocalError('Failed to fetch teams.');
			}
		};

		fetchEligibleTeams();
	}, [db, teamId, stealAmount]);

	// Claim bonus if nobody to rob
	const handleBonusClaim = async () => {
		setIsProcessing(true);
		try {
			// add to your team
			const yourTeamRef = doc(db, 'teams', teamId);
			const yourSnap = await getDoc(yourTeamRef);
			const yourData = yourSnap.data() || {};
			await updateDoc(yourTeamRef, {
				currency: (yourData.currency || 0) + price,
			});

			// clear your item/inventory
			await onUsed();
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError('Failed to claim bonus.');
		}
		setIsProcessing(false);
	};

	// Steal from a selected team
	const handleTargetSelect = async (targetTeam) => {
		setIsProcessing(true);
		try {
			const now = Timestamp.now();
			if (targetTeam.immuneUntil?.toMillis() > now.toMillis()) {
				setLocalError(`Team ${targetTeam.name} is currently immune.`);
				setIsProcessing(false);
				return;
			}
			if ((targetTeam.currency || 0) < stealAmount) {
				setLocalError(`Team ${targetTeam.name} doesn’t have enough funds.`);
				setIsProcessing(false);
				return;
			}

			// subtract from target
			await updateDoc(doc(db, 'teams', targetTeam.id), {
				currency: targetTeam.currency - stealAmount,
			});

			// add to your team
			const yourTeamRef = doc(db, 'teams', teamId);
			const yourSnap = await getDoc(yourTeamRef);
			const yourData = yourSnap.data() || {};
			await updateDoc(yourTeamRef, {
				currency: (yourData.currency || 0) + stealAmount,
			});

			// clear your item/inventory
			await onUsed();
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError('Failed to process robbery.');
		}
		setIsProcessing(false);
	};

	return (
		<div className="relative bg-charcoal rounded-lg shadow-lg p-6">
			<h3 className="text-xl font-semibold mb-4">
				Select a team to steal from:
			</h3>
			{localError && <p className="text-red-500 mb-2">{localError}</p>}

			{availableTeams.length === 0 ? (
				<div>
					<p className="mb-4">
						No teams can be stolen from at the moment. Here's your money back.
					</p>
					<button
						onClick={handleBonusClaim}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing ? 'Processing...' : 'Refund'}
					</button>
				</div>
			) : (
				<div className="space-y-2 max-h-64 overflow-y-auto">
					{availableTeams.map((t) => (
						<button
							key={t.id}
							onClick={() => handleTargetSelect(t)}
							disabled={isProcessing}
							className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded block w-full text-left"
						>
							{t.name} (💰 {t.currency})
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default Robbery;
