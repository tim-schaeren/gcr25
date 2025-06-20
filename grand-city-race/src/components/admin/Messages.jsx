import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
	collection,
	onSnapshot,
	addDoc,
	query,
	where,
	orderBy,
	serverTimestamp,
	getDocs,
	writeBatch,
	doc,
} from 'firebase/firestore';
import AdminSidebar from './AdminSidebar';

function MessagesPage({ db }) {
	const [teams, setTeams] = useState([]);
	const [selectedTeamId, setSelectedTeamId] = useState(null);

	const [adminToTeamMsgs, setAdminToTeamMsgs] = useState([]);
	const [teamToAdminMsgs, setTeamToAdminMsgs] = useState([]);
	const [mergedMessages, setMergedMessages] = useState([]);

	const [unreadTeams, setUnreadTeams] = useState(new Set());

	const [newMessageText, setNewMessageText] = useState('');
	const [broadcastText, setBroadcastText] = useState('');

	const chatEndRef = useRef(null);
	const initialTeamSnapshot = useRef(true);

	const [allMembers, setAllMembers] = useState([]);

	// 1) Fetch teams in real time
	useEffect(() => {
		const teamsRef = collection(db, 'teams');
		const unsubscribe = onSnapshot(teamsRef, (snapshot) => {
			const teamList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setTeams(teamList);
		});
		return () => unsubscribe();
	}, [db]);

	// 1.5) Fetch team-members
	useEffect(() => {
		const unsub = onSnapshot(collection(db, 'users'), (snap) =>
			setAllMembers(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
		);
		return () => unsub();
	}, [db]);

	// 2) Track which teams have unread “team → admin” messages
	useEffect(() => {
		const unreadGlobalQuery = query(
			collection(db, 'messages'),
			where('to', '==', 'admin'),
			where('readByAdmin', '==', false)
		);
		const unsubscribe = onSnapshot(unreadGlobalQuery, (snapshot) => {
			const unreadSet = new Set();
			snapshot.docs.forEach((d) => {
				const data = d.data();
				if (data.from) {
					unreadSet.add(data.from);
				}
			});
			setUnreadTeams(unreadSet);
		});
		return () => unsubscribe();
	}, [db]);

	const membersByTeam = useMemo(() => {
		const m = {};
		teams.forEach((t) => {
			m[t.id] = [];
		});
		allMembers.forEach((u) => {
			if (u.teamId && m[u.teamId]) m[u.teamId].push(u.name || u.email);
		});
		return m;
	}, [teams, allMembers]);

	// Sort teams so unread ones come first
	const sortedTeams = useMemo(() => {
		return teams
			.slice() // copy so we don’t mutate original
			.sort((a, b) => {
				// selected team at very top
				if (a.id === selectedTeamId) return -1;
				if (b.id === selectedTeamId) return 1;
				// then unread teams
				const aUnread = unreadTeams.has(a.id);
				const bUnread = unreadTeams.has(b.id);
				if (aUnread && !bUnread) return -1;
				if (!aUnread && bUnread) return 1;
				// otherwise keep original order
				return 0;
			});
	}, [teams, unreadTeams, selectedTeamId]);

	// 3) When a team is selected, listen for both directions and handle “read” logic
	useEffect(() => {
		if (!selectedTeamId) {
			setAdminToTeamMsgs([]);
			setTeamToAdminMsgs([]);
			initialTeamSnapshot.current = true;
			return;
		}

		// (A) admin → team
		const adminToQuery = query(
			collection(db, 'messages'),
			where('from', '==', 'admin'),
			where('to', '==', selectedTeamId),
			orderBy('timestamp', 'asc')
		);
		const unsubAdminTo = onSnapshot(adminToQuery, (snapshot) => {
			const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
			setAdminToTeamMsgs(msgs);
		});

		// (B) team → admin (with two‐phase read‐receipt)
		const teamToQuery = query(
			collection(db, 'messages'),
			where('from', '==', selectedTeamId),
			where('to', '==', 'admin'),
			orderBy('timestamp', 'asc')
		);
		const unsubTeamTo = onSnapshot(teamToQuery, async (snapshot) => {
			const msgs = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
			setTeamToAdminMsgs(msgs);

			if (initialTeamSnapshot.current) {
				// First snapshot: batch-mark any existing unread as readByAdmin
				initialTeamSnapshot.current = false;
				const batch = writeBatch(db);
				let foundAnyUnread = false;
				snapshot.docs.forEach((docSnap) => {
					const data = docSnap.data();
					if (!data.readByAdmin) {
						foundAnyUnread = true;
						batch.update(doc(db, 'messages', docSnap.id), {
							readByAdmin: true,
						});
					}
				});
				if (foundAnyUnread) {
					try {
						await batch.commit();
					} catch (err) {
						console.error(
							'Error marking initial team→admin messages as readByAdmin:',
							err
						);
					}
				}
			} else {
				// Subsequent snapshots: only mark newly added docs
				const batch = writeBatch(db);
				let foundNewUnread = false;
				snapshot.docChanges().forEach((change) => {
					if (change.type === 'added') {
						const data = change.doc.data();
						if (!data.readByAdmin) {
							foundNewUnread = true;
							batch.update(doc(db, 'messages', change.doc.id), {
								readByAdmin: true,
							});
						}
					}
				});
				if (foundNewUnread) {
					try {
						await batch.commit();
					} catch (err) {
						console.error(
							'Error marking newly arrived team→admin message as readByAdmin:',
							err
						);
					}
				}
			}
		});

		return () => {
			unsubAdminTo();
			unsubTeamTo();
			initialTeamSnapshot.current = true;
		};
	}, [db, selectedTeamId]);

	// 4) Merge & sort
	useEffect(() => {
		const combined = [...adminToTeamMsgs, ...teamToAdminMsgs];
		combined.sort((a, b) => {
			const aTs = a.timestamp?.toMillis?.() || 0;
			const bTs = b.timestamp?.toMillis?.() || 0;
			return aTs - bTs;
		});
		setMergedMessages(combined);
	}, [adminToTeamMsgs, teamToAdminMsgs]);

	// 5) Auto-scroll to bottom
	useEffect(() => {
		if (chatEndRef.current) {
			chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
		}
	}, [mergedMessages]);

	// 6) Send a new message (admin → team)
	const sendMessage = async () => {
		if (!selectedTeamId || !newMessageText.trim()) return;
		await addDoc(collection(db, 'messages'), {
			from: 'admin',
			to: selectedTeamId,
			text: newMessageText.trim(),
			timestamp: serverTimestamp(),
			readByTeam: false,
			readByAdmin: true, // admin wrote it → already “read” by admin
		});
		setNewMessageText('');
	};

	// 7) Broadcast to all teams
	const sendBroadcast = async () => {
		if (!broadcastText.trim()) return;
		const text = broadcastText.trim();
		for (const team of teams) {
			await addDoc(collection(db, 'messages'), {
				from: 'admin',
				to: team.id,
				text,
				timestamp: serverTimestamp(),
				readByTeam: false,
				readByAdmin: true,
			});
		}
		setBroadcastText('');
	};

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			{/* Mobile placeholder */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>

			{/* Desktop layout */}
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar with team list */}
				<AdminSidebar db={db} />
				{/* Main content */}
				<div className="flex-1 flex flex-col">
					{/* Broadcast section */}
					<div className="bg-white shadow-lg rounded-lg p-6 mb-4">
						<h2 className="text-xl font-semibold text-gray-700 mb-2">
							📢 Broadcast to All Teams
						</h2>
						<div className="flex space-x-2">
							<input
								type="text"
								className="flex-grow p-2 border rounded-lg"
								placeholder="Enter broadcast message…"
								value={broadcastText}
								onChange={(e) => setBroadcastText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && !e.shiftKey) {
										e.preventDefault();
										sendBroadcast();
									}
								}}
							/>
							<button
								onClick={sendBroadcast}
								disabled={!broadcastText.trim()}
								className={`py-2 px-4 rounded-lg font-semibold ${
									broadcastText.trim()
										? 'bg-green-500 hover:bg-green-600 text-white'
										: 'bg-gray-300 text-gray-500 cursor-not-allowed'
								}`}
							>
								Broadcast
							</button>
						</div>
					</div>

					{/* Team conversations */}
					<div className="bg-white shadow-lg rounded-lg p-6 flex flex-col flex-grow">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							📬 Team Conversations
						</h2>
						<div className="flex flex-grow overflow-hidden">
							{/* Team list */}
							<div className="w-1/4 border-r border-gray-300 h-[calc(100vh-350px)] overflow-y-auto">
								{sortedTeams.map((team) => (
									<div
										key={team.id}
										onClick={() => setSelectedTeamId(team.id)}
										className={`
									  relative p-3 cursor-pointer hover:bg-gray-200
									  flex flex-col space-y-1
									  ${selectedTeamId === team.id ? 'bg-gray-200 font-semibold' : ''}
									`}
									>
										<span className="font-semibold">{team.name}</span>

										{membersByTeam[team.id]?.length ? (
											<ul className="list-none list-inside text-sm text-gray-500 ml-4 space-y-1">
												{membersByTeam[team.id].map((member) => (
													<li key={member}>{member}</li>
												))}
											</ul>
										) : (
											<span className="text-sm text-gray-500 ml-4">
												No members.
											</span>
										)}

										{unreadTeams.has(team.id) && (
											<span className="absolute top-3 right-3 h-2 w-2 bg-red-500 rounded-full" />
										)}
									</div>
								))}
							</div>

							{/* Chat window */}
							<div className="w-3/4 flex flex-col">
								{!selectedTeamId ? (
									<div className="flex-grow flex items-center justify-center text-gray-500">
										Select a team to view chat
									</div>
								) : (
									<>
										{/* Messages list (scrollable) */}
										<div className="p-4 bg-gray-100 rounded-t-lg overflow-y-auto h-[calc(100vh-350px)]">
											{mergedMessages.map((msg) => {
												const isAdminMessage = msg.from === 'admin';
												return (
													<div
														key={msg.id}
														className={`mb-3 flex ${
															isAdminMessage ? 'justify-end' : 'justify-start'
														}`}
													>
														<div
															className={`max-w-[70%] p-2 rounded-lg ${
																isAdminMessage
																	? 'bg-blue-500 text-white'
																	: 'bg-green-500 text-white'
															}`}
														>
															<p className="break-words">{msg.text}</p>
															<div
																className={`mt-1 text-xs flex items-center ${
																	isAdminMessage ? 'justify-end' : ''
																}`}
															>
																<span>
																	{msg.timestamp
																		? new Date(
																				msg.timestamp.toMillis()
																		  ).toLocaleTimeString([], {
																				hour: '2-digit',
																				minute: '2-digit',
																		  })
																		: ''}
																</span>

																{/* Only show a checkmark on admin→team bubbles */}
																{isAdminMessage && msg.readByTeam && (
																	<span className="ml-2 text-green-200">
																		✔️
																	</span>
																)}
																{/*
                                  Removed the checkmark for team→admin messages,
                                  since the admin is already viewing and thus implicitly
                                  “has read” them.
                                */}
															</div>
														</div>
													</div>
												);
											})}
											<div ref={chatEndRef} />
										</div>

										{/* Message input (admin → team) */}
										<div className="p-4 bg-white border-t border-gray-300 rounded-b-lg flex space-x-2">
											<input
												type="text"
												className="flex-grow p-2 border rounded-lg"
												placeholder="Type your message…"
												value={newMessageText}
												onChange={(e) => setNewMessageText(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === 'Enter' && !e.shiftKey) {
														e.preventDefault();
														sendMessage();
													}
												}}
											/>
											<button
												onClick={sendMessage}
												disabled={!newMessageText.trim()}
												className={`py-2 px-4 rounded-lg font-semibold ${
													newMessageText.trim()
														? 'bg-blue-500 hover:bg-blue-600 text-white'
														: 'bg-gray-300 text-gray-500 cursor-not-allowed'
												}`}
											>
												Send
											</button>
										</div>
									</>
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default MessagesPage;
