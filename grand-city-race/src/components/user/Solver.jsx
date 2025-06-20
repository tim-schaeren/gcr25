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
	onSnapshot,
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

// Helper for MM:SS formatting
function formatMMSS(totalSeconds) {
	const m = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
	const s = String(totalSeconds % 60).padStart(2, '0');
	return `${m}:${s}`;
}

function Solver({ user, db }) {
	const [quest, setQuest] = useState(null);
	const [answer, setAnswer] = useState('');
	const [nextHint, setNextHint] = useState(null);
	const [gameOver, setGameOver] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [isTextOverlayOpen, setIsTextOverlayOpen] = useState(false);
	const [teamId, setTeamId] = useState(null);
	const [cursedById, setCursedById] = useState(null);
	const [cursingTeamName, setCursingTeamName] = useState('');
	const [remainingSeconds, setRemainingSeconds] = useState(0);

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

				setTeamId(userData.teamId);

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

	// curse stuff
	useEffect(() => {
		if (!teamId) return;
		const teamRef = doc(db, 'teams', teamId);
		const unsub = onSnapshot(teamRef, (snap) => {
			if (!snap.exists()) return;
			const data = snap.data();
			// compute remaining seconds
			const curseTs = data.cursedUntil?.toMillis() ?? 0;
			const secs =
				curseTs > Date.now() ? Math.floor((curseTs - Date.now()) / 1000) : 0;
			setRemainingSeconds(secs);
			// track who cursed you
			setCursedById(data.cursedBy || null);
		});
		return () => unsub();
	}, [db, teamId]);

	// find cursing name
	useEffect(() => {
		if (!cursedById) {
			setCursingTeamName('');
			return;
		}
		let cancelled = false;
		getDoc(doc(db, 'teams', cursedById))
			.then((snap) => {
				if (!cancelled && snap.exists()) {
					setCursingTeamName(snap.data().name || 'Unknown');
				}
			})
			.catch(console.error);
		return () => {
			cancelled = true;
		};
	}, [db, cursedById]);

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
			setErrorMessage('Incorrect answer!');
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

	// If we’re still cursed, show the red box and bail out
	if (remainingSeconds > 0) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-charcoal p-6">
				<div className="p-8 bg-red-100 border border-red-400 text-red-700 rounded-xl text-center">
					<p className="font-semibold text-lg">
						You have been cursed by {cursingTeamName}!
					</p>
					<p className="mt-2 text-2xl">{formatMMSS(remainingSeconds)}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center min-h-screen text-white p-6">
			<div className="bg-charcoal fixed top-0 left-0 right-0 h-16 w-16 flex items-center px-4 z-10">
				<button
					onClick={() => navigate('/dashboard')}
					className="mr-4 text-3xl text-parchment bg-charcoal"
				>
					←
				</button>
			</div>
			{gameOver ? (
				<div className="p-8 rounded-lg shadow-lg w-full max-w-md text-center">
					<h2 className="text-2xl font-bold mb-4">🎉 Congratulations! 🎉</h2>
					<p className="mb-6">Your team has completed the race!</p>
					<button
						onClick={() => navigate('/dashboard')}
						className="w-full hover:bg-blue-600 text-charcoal font-semibold py-2 px-4 rounded-lg transition"
					>
						Return to Dashboard
					</button>
				</div>
			) : nextHint ? (
				<div className="bg-olive p-8 rounded-lg shadow-lg w-full max-w-md text-center border border-parchment">
					<h3 className="text-2xl font-semibold mb-4">Correct!🎉</h3>
					<p className="mb-4">Loading your next hint!</p>
				</div>
			) : (
				<div className="p-8 rounded-lg shadow-lg w-full max-w-md text-center border border-1 border-parchment">
					{quest ? (
						<>
							<div
								onClick={() => setIsTextOverlayOpen(true)}
								className="mt-2 text-parchment text-lg max-h-48 overflow-y-auto p-2 text-left"
							>
								{quest.text}
							</div>
							{errorMessage && (
								<p className="text-red-500 mb-4">{errorMessage}</p>
							)}
							<input
								type="text"
								value={answer}
								onChange={(e) => setAnswer(e.target.value)}
								placeholder="your answer"
								className="w-full p-4 border border-gray-600 rounded-md mb-4 mt-8 bg-gray-700 text-white scroll focus:outline-none focus:border-blue-500"
							/>
							<button
								onClick={handleAnswerSubmit}
								className="w-full bg-green-800 hover:bg-green-600 text-white text-lg font-semibold py-2 px-4 rounded-lg transition"
							>
								Submit
							</button>
						</>
					) : (
						<p className="text-gray-400">Loading quest...</p>
					)}
				</div>
			)}

			{/* Full-Screen Text Overlay */}
			{isTextOverlayOpen && (
				<div
					onClick={() => setIsTextOverlayOpen(false)}
					className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-6"
				>
					<div
						onClick={(e) => e.stopPropagation()}
						className="bg-white max-w-3xl w-full max-h-full overflow-y-auto p-6 rounded-lg"
					>
						<button
							onClick={() => setIsTextOverlayOpen(false)}
							className="mb-4 text-parchment bg-charcoal font-bold absolute top-7 right-7"
						>
							X
						</button>
						<div className="text-charcoal text-xl whitespace-pre-wrap">
							{quest.text}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default Solver;
