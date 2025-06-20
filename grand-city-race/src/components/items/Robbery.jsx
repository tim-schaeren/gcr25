import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
	Timestamp,
} from 'firebase/firestore';

const Robbery = ({ user, teamId, selectedItem, db, onClose, onUsed }) => {
	const { t } = useTranslation();
	const [availableTeams, setAvailableTeams] = useState([]);
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const stealAmount = selectedItem.stealAmount;
	const price = selectedItem.price;

	// Fetch eligible teams
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
				setLocalError(t('robbery.errors.fetchTeams'));
			}
		};

		fetchEligibleTeams();
	}, [db, teamId, stealAmount, t]);

	// Claim refund if nobody to rob
	const handleBonusClaim = async () => {
		setIsProcessing(true);
		try {
			const yourTeamRef = doc(db, 'teams', teamId);
			const yourSnap = await getDoc(yourTeamRef);
			const yourData = yourSnap.data() || {};
			await updateDoc(yourTeamRef, {
				currency: (yourData.currency || 0) + price,
			});

			await onUsed();
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError(t('robbery.errors.claimBonus'));
		}
		setIsProcessing(false);
	};

	// Steal from a selected team
	const handleTargetSelect = async (targetTeam) => {
		setIsProcessing(true);
		try {
			const now = Timestamp.now();
			if (targetTeam.immuneUntil?.toMillis() > now.toMillis()) {
				setLocalError(t('robbery.errors.immune', { name: targetTeam.name }));
				setIsProcessing(false);
				return;
			}
			if ((targetTeam.currency || 0) < stealAmount) {
				setLocalError(
					t('robbery.errors.insufficientFunds', { name: targetTeam.name })
				);
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

			await onUsed();
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError(t('robbery.errors.process'));
		}
		setIsProcessing(false);
	};

	return (
		<div className="relative bg-charcoal rounded-lg shadow-lg p-6">
			<h3 className="text-xl font-semibold mb-4">{t('robbery.selectTeam')}</h3>
			{localError && <p className="text-red-500 mb-2">{localError}</p>}

			{availableTeams.length === 0 ? (
				<div>
					<p className="mb-4">{t('robbery.noTeams')}</p>
					<button
						onClick={handleBonusClaim}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing ? t('robbery.processing') : t('robbery.refund')}
					</button>
				</div>
			) : (
				<div className="space-y-2 max-h-64 overflow-y-auto">
					{availableTeams.map((tgt) => (
						<button
							key={tgt.id}
							onClick={() => handleTargetSelect(tgt)}
							disabled={isProcessing}
							className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded block w-full text-left"
						>
							{t('robbery.teamBalance', {
								name: tgt.name,
								currency: tgt.currency,
							})}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default Robbery;
