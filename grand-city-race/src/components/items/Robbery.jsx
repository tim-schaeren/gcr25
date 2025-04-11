import React, { useEffect, useState } from 'react';
import {
	collection,
	getDocs,
	doc,
	getDoc,
	updateDoc,
} from 'firebase/firestore';

const Robbery = ({ team, selectedItem, db, onClose, targetCoords }) => {
	const [availableTeams, setAvailableTeams] = useState([]);
	const [localError, setLocalError] = useState('');
	const [isProcessing, setIsProcessing] = useState(false);
	const [animate, setAnimate] = useState(false);
	const stealAmount = selectedItem.stealAmount;

	// Use fallback coordinates if targetCoords is not provided.
	const effectiveTargetCoords = targetCoords || { x: 150, y: -50 };

	// Fetch eligible teams (all teams except the user's team and those with insufficient currency)
	useEffect(() => {
		const fetchEligibleTeams = async () => {
			try {
				const teamsSnapshot = await getDocs(collection(db, 'teams'));
				const allTeams = teamsSnapshot.docs.map((doc) => ({
					id: doc.id,
					...doc.data(),
				}));
				const eligible = allTeams.filter(
					(t) => t.id !== team.id && (t.currency || 0) >= stealAmount
				);
				setAvailableTeams(eligible);
			} catch (error) {
				setLocalError('Failed to fetch teams.');
				console.error(error);
			}
		};

		fetchEligibleTeams();
	}, [db, team, stealAmount]);

	// Trigger the animation and then close the modal
	const triggerAnimationAndClose = () => {
		setAnimate(true);
		// After the animation duration (1s here), close the modal
		setTimeout(() => {
			onClose();
		}, 1000);
	};

	// Claim bonus if no eligible teams exist.
	const handleBonusClaim = async () => {
		setIsProcessing(true);
		try {
			const teamRef = doc(db, 'teams', team.id);
			const teamSnap = await getDoc(teamRef);
			if (!teamSnap.exists()) {
				setLocalError('Team data not found.');
				setIsProcessing(false);
				return;
			}
			const teamData = teamSnap.data();
			const updatedCurrency = (teamData.currency || 0) + stealAmount;
			const inventory = teamData.inventory || {};
			inventory[selectedItem.id] = (inventory[selectedItem.id] || 1) - 1;
			await updateDoc(teamRef, {
				currency: updatedCurrency,
				inventory: inventory,
				activeItem: null,
			});
			triggerAnimationAndClose();
		} catch (error) {
			setLocalError('Failed to process bonus.');
			console.error(error);
		}
		setIsProcessing(false);
	};

	// Process a robbery when a target team is selected.
	const handleTargetSelect = async (targetTeam) => {
		setIsProcessing(true);
		try {
			if ((targetTeam.currency || 0) < stealAmount) {
				setLocalError(`Team ${targetTeam.name} does not have enough currency.`);
				setIsProcessing(false);
				return;
			}
			// Subtract from target team.
			const targetTeamRef = doc(db, 'teams', targetTeam.id);
			await updateDoc(targetTeamRef, {
				currency: targetTeam.currency - stealAmount,
			});
			// Add to user's team.
			const teamRef = doc(db, 'teams', team.id);
			const teamSnap = await getDoc(teamRef);
			if (!teamSnap.exists()) {
				setLocalError('Team data not found.');
				setIsProcessing(false);
				return;
			}
			const teamData = teamSnap.data();
			const updatedCurrency = (teamData.currency || 0) + stealAmount;
			const inventory = teamData.inventory || {};
			inventory[selectedItem.id] = (inventory[selectedItem.id] || 1) - 1;
			await updateDoc(teamRef, {
				currency: updatedCurrency,
				inventory: inventory,
				activeItem: null,
			});
			triggerAnimationAndClose();
		} catch (error) {
			setLocalError('Failed to process robbery.');
			console.error(error);
		}
		setIsProcessing(false);
	};

	return (
		<div className="relative">
			<h3 className="text-xl font-semibold mb-4">
				Select a team to steal from:
			</h3>
			{localError && <p className="text-red-500 mb-2">{localError}</p>}
			{availableTeams.length === 0 ? (
				<div>
					<p className="mb-4">
						No teams currently have enough currency for you to steal. You still
						receive {stealAmount}.
					</p>
					<button
						onClick={handleBonusClaim}
						disabled={isProcessing}
						className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded"
					>
						{isProcessing ? 'Processing...' : 'Claim Bonus'}
					</button>
				</div>
			) : (
				<div>
					{availableTeams.map((targetTeam) => (
						<button
							key={targetTeam.id}
							onClick={() => handleTargetSelect(targetTeam)}
							disabled={isProcessing}
							className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-1 px-3 rounded mb-2 block text-left w-full"
						>
							{targetTeam.name} (💰 {targetTeam.currency})
						</button>
					))}
				</div>
			)}
		</div>
	);
};

export default Robbery;
