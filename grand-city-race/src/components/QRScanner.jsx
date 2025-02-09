import React, { useState } from 'react';
import QrReader from 'react-qr-scanner';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

function QRScanner({ user, db }) {
	const [error, setError] = useState(null);
	const [successMessage, setSuccessMessage] = useState(null);
	const [scanning, setScanning] = useState(true);
	// isProcessing will be true while the scanned code is being validated
	const [isProcessing, setIsProcessing] = useState(false);
	const navigate = useNavigate();

	const handleScan = async (data) => {
		if (!data) return;
		// Stop scanning immediately and indicate processing
		setScanning(false);
		setIsProcessing(true);
		console.log('Scanned QR Code:', data.text);
		setError(null);

		try {
			const questId = data.text.trim();

			// 1. Check that the quest exists in the "quests" collection.
			const questRef = doc(db, 'quests', questId);
			const questSnap = await getDoc(questRef);
			if (!questSnap.exists()) {
				setError('❗ This quest does not exist.');
				setIsProcessing(false);
				return;
			}
			const questData = questSnap.data();

			// Get the user document.
			const userRef = doc(db, 'users', user.uid);
			const userSnap = await getDoc(userRef);
			if (!userSnap.exists()) {
				setError('User data not found.');
				setIsProcessing(false);
				return;
			}
			const userData = userSnap.data();
			if (!userData.teamId) {
				setError('User is not assigned to a team.');
				setIsProcessing(false);
				return;
			}

			// Get the team document.
			const teamRef = doc(db, 'teams', userData.teamId);
			const teamSnap = await getDoc(teamRef);
			if (!teamSnap.exists()) {
				setError('Team data not found.');
				setIsProcessing(false);
				return;
			}
			const teamData = teamSnap.data();

			// Prevent re-scanning a quest that's already solved.
			if (teamData.progress?.previousQuests?.includes(questId)) {
				setError('❗ You already solved this quest!');
				setIsProcessing(false);
				return;
			}

			// 2. Check that the scanned quest's sequence is unlocked.
			// Determine the sequence of the last solved quest.
			let lastSequence = 0;
			if (
				teamData.progress?.previousQuests &&
				teamData.progress.previousQuests.length > 0
			) {
				const lastQuestId =
					teamData.progress.previousQuests[
						teamData.progress.previousQuests.length - 1
					];
				const lastQuestRef = doc(db, 'quests', lastQuestId);
				const lastQuestSnap = await getDoc(lastQuestRef);
				if (lastQuestSnap.exists()) {
					const lastQuestData = lastQuestSnap.data();
					lastSequence = lastQuestData.sequence;
				}
			}
			// The next allowed quest must have sequence exactly (lastSequence + 1)
			if (questData.sequence !== lastSequence + 1) {
				setError(
					`❗ Quest locked! You must complete quest with sequence ${
						lastSequence + 1
					} first.`
				);
				setIsProcessing(false);
				return;
			}

			// Optional: Check if the team already has a quest in progress.
			if (
				teamData.progress?.currentQuest &&
				teamData.progress.currentQuest !== ''
			) {
				setError(
					'❗ You already have a quest in progress. Complete it before scanning a new one.'
				);
				setIsProcessing(false);
				return;
			}

			// Assign the new quest.
			await updateDoc(teamRef, {
				'progress.currentQuest': questId,
			});

			setSuccessMessage('✅ Quest assigned! Redirecting...');
			setIsProcessing(false);
			setTimeout(() => navigate('/dashboard'), 2000);
		} catch (err) {
			setError('⚠️ Error processing QR code.');
			console.error('QR Code Processing Error:', err);
			setIsProcessing(false);
		}
	};

	return (
		<div className="flex flex-col items-center justify-center w-screen min-h-screen bg-gray-900 text-white p-6">
			<h2 className="text-3xl font-bold mb-4">📸 Scan a QR Code</h2>

			{/* Scanner Container */}
			<div className="w-full max-w-lg min-h-[350px] flex items-center justify-center">
				{scanning ? (
					<QrReader
						delay={300}
						constraints={{ video: { facingMode: 'environment' } }}
						style={{
							width: '100%',
							maxWidth: '400px',
							borderRadius: '10px',
						}}
						onError={(err) => setError('Camera error: ' + err.message)}
						onScan={handleScan}
					/>
				) : (
					<div className="w-full h-[300px] flex flex-col items-center justify-center bg-gray-800 rounded-lg">
						{isProcessing ? (
							// Loading Spinner
							<>
								<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
								<p className="mt-4 text-gray-300">Processing...</p>
							</>
						) : successMessage ? (
							<p className="text-green-400">{successMessage}</p>
						) : error ? (
							<>
								<p className="text-red-400">{error}</p>
								{/* Try Again Button */}
								<button
									onClick={() => {
										setScanning(true);
										setError(null);
									}}
									className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
								>
									Try Again
								</button>
							</>
						) : (
							<p className="text-gray-500">Scanner stopped</p>
						)}
					</div>
				)}
			</div>

			<button
				onClick={() => navigate('/dashboard')}
				className="mt-6 px-6 py-2 bg-gray-700 hover:bg-gray-600 transition text-white rounded-lg"
			>
				← Back to Dashboard
			</button>
		</div>
	);
}

export default QRScanner;
