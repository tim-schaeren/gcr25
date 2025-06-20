import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
	const { t } = useTranslation();
	const [availableTeams, setAvailableTeams] = useState([]);
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);

	const durationMinutes = selectedItem.duration;
	const coolDownMinutes = selectedItem.coolDownPeriod;
	const price = selectedItem.price;

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
					if (t.id === teamId) return false;
					if (t.cursedUntil?.toMillis() > now.toMillis()) return false;
					if (t.immuneUntil?.toMillis() > now.toMillis()) return false;
					return true;
				});

				if (eligible.length === 0) {
					setAvailableTeams([]);
					return;
				}

				const ids = eligible.map((t) => t.id);
				const usersSnap = await getDocs(
					query(collection(db, 'users'), where('teamId', 'in', ids))
				);
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
				setLocalError(t('curse.errors.fetchTeams'));
			}
		};
		fetchEligible();
	}, [db, teamId, t]);

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
			setLocalError(t('curse.errors.claimRefund'));
		} finally {
			setIsProcessing(false);
		}
	};

	const handleTargetSelect = async (targetTeam) => {
		setIsProcessing(true);
		try {
			const now = Timestamp.now();
			if (targetTeam.cursedUntil?.toMillis() > now.toMillis()) {
				setLocalError(
					t('curse.errors.alreadyCursed', { name: targetTeam.name })
				);
				return;
			}
			if (targetTeam.immuneUntil?.toMillis() > now.toMillis()) {
				setLocalError(t('curse.errors.immune', { name: targetTeam.name }));
				return;
			}

			const msCurse = durationMinutes * 60 * 1000;
			const msImmune = (durationMinutes + coolDownMinutes) * 60 * 1000;
			const cursedUntil = Timestamp.fromMillis(now.toMillis() + msCurse);
			const immuneUntil = Timestamp.fromMillis(now.toMillis() + msImmune);

			await updateDoc(targetTeam.ref, {
				cursedUntil,
				cursedBy: teamId,
				immuneUntil,
			});

			await onUsed();
			onClose();
		} catch (err) {
			console.error(err);
			setLocalError(t('curse.errors.processCurse'));
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

			<h3 className="text-xl font-semibold mb-4">{t('curse.selectTeam')}</h3>
			{localError && <p className="text-red-500 mb-2">{localError}</p>}

			{availableTeams.length === 0 ? (
				<div>
					<p className="mb-4">{t('curse.noTeams')}</p>
					<button
						onClick={handleBonusClaim}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing ? t('curse.processing') : t('curse.claimRefund')}
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
