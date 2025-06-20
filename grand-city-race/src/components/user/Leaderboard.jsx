import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

/**
 * Leaderboard component: shows top 3 teams in real-time.
 * Displays rank, team color dot, team name, and member names.
 * Includes a back button to return to the previous screen.
 */

function Leaderboard({ db }) {
	const { t } = useTranslation();
	const navigate = useNavigate();

	const [teams, setTeams] = useState([]);
	const membersRef = useRef(null);
	const [membersMap, setMembersMap] = useState({}); // teamId -> [member names]

	// Subscribe to teams collection and keep top 3 sorted by solvedQuests
	useEffect(() => {
		const teamsRef = collection(db, 'teams');
		const unsubscribe = onSnapshot(teamsRef, (snapshot) => {
			const list = snapshot.docs.map((doc) => {
				const data = doc.data();
				return {
					id: doc.id,
					name: data.name,
					color: data.color?.hex || '#ccc',
					solvedQuests: data.progress?.previousQuests?.length || 0,
				};
			});
			list.sort((a, b) => b.solvedQuests - a.solvedQuests);
			let lastScore = null;
			let currentRank = 0;

			const withRanks = list.map((team, idx) => {
				if (team.solvedQuests !== lastScore) {
					currentRank += 1;
					lastScore = team.solvedQuests;
				}
				return { ...team, rank: currentRank };
			});

			// now pick all teams whose rank is ≤ 3, and optionally filter out zeros:
			const podium = withRanks
				.filter((t) => t.solvedQuests > 0) // hide empty if you want
				.filter((t) => t.rank <= 3);
			setTeams(podium);
		});
		return unsubscribe;
	}, [db]);

	// Subscribe to users whose teamId is in the current top3
	useEffect(() => {
		// Clean previous listener
		if (membersRef.current) membersRef.current();

		if (teams.length === 0) {
			setMembersMap({});
			return;
		}
		const teamIds = teams.map((t) => t.id);
		const usersRef = collection(db, 'users');
		const q = query(usersRef, where('teamId', 'in', teamIds));
		const unsubscribe = onSnapshot(q, (snap) => {
			const map = {};
			snap.docs.forEach((doc) => {
				const data = doc.data();
				if (!map[data.teamId]) map[data.teamId] = [];
				map[data.teamId].push(data.name || data.email);
			});
			setMembersMap(map);
		});
		membersRef.current = unsubscribe;
		return unsubscribe;
	}, [db, teams]);

	return (
		<div className="min-h-screen  p-6 flex flex-col">
			{/* Back Button */}
			<div className="fixed top-2 left-0 right-0 h-16 w-16 flex items-center px-4 z-10">
				<button
					onClick={() => navigate('/dashboard')}
					className="mr-4 text-3xl text-parchment bg-charcoal"
				>
					←
				</button>
			</div>

			{/* Teams List */}
			<div className="flex-1 overflow-auto pt-20 space-y-6">
				{teams.map((team, idx) => (
					<div
						key={team.id}
						className="relative bg-gray-800 rounded-2xl p-6 shadow-2xl hover:shadow-inner transition-all"
					>
						{/* Decorative accent */}
						<div
							className="absolute inset-0 rounded-2xl opacity-20"
							style={{
								background: `radial-gradient(circle at top left, ${team.color}, transparent 70%)`,
							}}
						/>

						<div className="relative flex items-center mb-4">
							<span className="text-3xl font-extrabold text-parchment mr-4">
								{team.rank}.
							</span>
							<div
								className="w-8 h-8 rounded-full ring-2 ring-parchment mr-3 flex-shrink-0"
								style={{ backgroundColor: team.color }}
							/>
							<h3 className="text-2xl font-bold text-parchment">{team.name}</h3>
						</div>
						<p className="relative text-gray-300 text-lg font-bold">
							{membersMap[team.id]?.join(', ') || '-'}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}

export default Leaderboard;
