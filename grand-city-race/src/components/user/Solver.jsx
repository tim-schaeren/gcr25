import React, { useState, useEffect } from 'react';
import {
	doc,
	getDoc,
	updateDoc,
	arrayUnion,
	collection,
	getDocs,
	query,
	orderBy,
	limit,
	where,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

function Solver({ user, db }) {
	const [quest, setQuest] = useState(null);
	const [answer, setAnswer] = useState('');
	const [nextHint, setNextHint] = useState(null);
	const [gameOver, setGameOver] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const navigate = useNavigate();

	// Fetch the current quest for the team.
	useEffect(() => {
		if (!user) return;

		const fetchQuest = async () => {
			try {
				const userRef = doc(db, 'users', user.uid);
				const userSnap = await getDoc(userRef);
				if (!userSnap.exists()) return;

				const userData = userSnap.data();
				if (!userData.teamId) return;

				const teamRef = doc(db, 'teams', userData.teamId);
				const teamSnap = await getDoc(teamRef);
				if (!teamSnap.exists()) return;

				const teamData = teamSnap.data();
				if (teamData.progress?.currentQuest) {
					const questRef = doc(db, 'quests', teamData.progress.currentQuest);
					const questSnap = await getDoc(questRef);
					if (questSnap.exists()) {
						setQuest({
							id: teamData.progress.currentQuest,
							...questSnap.data(),
						});
					}
				}
			} catch (error) {
				console.error('Error fetching quest:', error);
			}
		};

		fetchQuest();
	}, [user, db]);

	const handleAnswerSubmit = async () => {
		// Reset any previous error message.
		setErrorMessage('');

		if (!quest) {
			setErrorMessage('No active quest found!');
			return;
		}

		// Normalize user input
		const userAnswer = answer.trim().toLowerCase();
		// Normalize the array of valid answers from Firestore
		const validAnswers = Array.isArray(quest.answer)
			? quest.answer.map((a) => a.trim().toLowerCase())
			: [];

		// If none of the validAnswers match, show error
		if (!validAnswers.includes(userAnswer)) {
			setErrorMessage('Incorrect answer! Try again.');
			return;
		}

		try {
			const userRef = doc(db, 'users', user.uid);
			const userSnap = await getDoc(userRef);
			if (!userSnap.exists()) return;
			const userData = userSnap.data();
			if (!userData.teamId) return;

			const teamRef = doc(db, 'teams', userData.teamId);

			// Get the quest with the highest sequence.
			const questsRef = collection(db, 'quests');
			const qMax = query(questsRef, orderBy('sequence', 'desc'), limit(1));
			const maxSnapshot = await getDocs(qMax);
			let maxSequence = 0;
			maxSnapshot.forEach((doc) => {
				const data = doc.data();
				if (data.sequence) {
					maxSequence = data.sequence;
				}
			});

			// Mark the current quest as solved.
			await updateDoc(teamRef, {
				'progress.previousQuests': arrayUnion(quest.id),
				'progress.currentQuest': '',
			});

			// If this was the final quest, declare victory.
			if (quest.sequence === maxSequence) {
				setGameOver(true);
				return;
			} else {
				// Otherwise, find the next quest by sequence.
				const nextSequence = quest.sequence + 1;
				const qNext = query(questsRef, where('sequence', '==', nextSequence));
				const nextSnapshot = await getDocs(qNext);
				if (!nextSnapshot.empty) {
					const nextQuestDoc = nextSnapshot.docs[0];
					const nextQuestData = nextQuestDoc.data();
					// Instead of immediately assigning the next quest, display its hint.
					setNextHint(nextQuestData.hint || 'No hint available.');
					// Redirect to the dashboard after a short delay.
					setTimeout(() => navigate('/dashboard'), 3000);
				} else {
					// If no next quest is found, the team wins.
					setGameOver(true);
				}
			}
		} catch (err) {
			console.error('Error updating quest progress:', err);
		}
	};

	return (
		<div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
			{gameOver ? (
				<div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md text-center">
					<h2 className="text-3xl font-bold mb-4">🎉 Congratulations! 🎉</h2>
					<p className="mb-6">Your team has completed the race!</p>
					<button
						onClick={() => navigate('/dashboard')}
						className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition"
					>
						Return to Dashboard
					</button>
				</div>
			) : nextHint ? (
				<div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md text-center">
					<h3 className="text-2xl font-semibold mb-4">Correct!</h3>
					<p className="mb-4">
						Here’s your hint for the location of the next QR code:
					</p>
					<div className="p-4 bg-gray-700 rounded-md mb-6">
						<p className="text-lg">{nextHint}</p>
					</div>
					<p className="text-gray-400">Redirecting to Dashboard...</p>
				</div>
			) : (
				<div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-md text-center">
					{quest ? (
						<>
							<h3 className="text-2xl font-semibold mb-4">{quest.text}</h3>
							{errorMessage && (
								<p className="text-red-500 mb-4">{errorMessage}</p>
							)}
							<input
								type="text"
								value={answer}
								onChange={(e) => setAnswer(e.target.value)}
								placeholder="Enter your answer"
								className="w-full p-2 border border-gray-600 rounded-md mb-4 bg-gray-700 text-white focus:outline-none focus:border-blue-500"
							/>
							<button
								onClick={handleAnswerSubmit}
								className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition"
							>
								Submit
							</button>
						</>
					) : (
						<p className="text-gray-400">Loading quest...</p>
					)}
				</div>
			)}
		</div>
	);
}

export default Solver;
