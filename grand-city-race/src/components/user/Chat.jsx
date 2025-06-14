import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
	collection,
	onSnapshot,
	addDoc,
	query,
	where,
	orderBy,
	serverTimestamp,
	writeBatch,
	doc,
	getDoc,
} from 'firebase/firestore';

function Chat({ user, db }) {
	const [teamId, setTeamId] = useState(null);
	const [adminToTeamMsgs, setAdminToTeamMsgs] = useState([]);
	const [teamToAdminMsgs, setTeamToAdminMsgs] = useState([]);
	const [mergedMessages, setMergedMessages] = useState([]);
	const [newMessageText, setNewMessageText] = useState('');

	const navigate = useNavigate();
	const chatEndRef = useRef(null);

	// This ref tracks whether we've processed the very first onSnapshot callback.
	// We use it so that we can run our “mark all unread on mount” logic exactly once,
	// and thereafter only mark newly arriving docs.
	const initialAdminSnapshot = useRef(true);

	// On mount: fetch the user's teamId
	useEffect(() => {
		if (!user) return;
		const fetchTeamId = async () => {
			const userRef = doc(db, 'users', user.uid);
			const userSnap = await getDoc(userRef);
			if (userSnap.exists()) {
				const data = userSnap.data();
				if (data.teamId) {
					setTeamId(data.teamId);
				} else {
					console.error('User has no teamId.');
				}
			}
		};
		fetchTeamId();
	}, [user, db]);

	// Once we know teamId, set up two real-time listeners:
	useEffect(() => {
		if (!teamId) return;

		// (A) admin → team: listen for admin→team messages in ascending timestamp order.
		const a2tQuery = query(
			collection(db, 'messages'),
			where('from', '==', 'admin'),
			where('to', '==', teamId),
			orderBy('timestamp', 'asc')
		);

		const unsubA2T = onSnapshot(a2tQuery, async (snapshot) => {
			const allAdminMsgs = snapshot.docs.map((d) => ({
				id: d.id,
				...d.data(),
			}));
			setAdminToTeamMsgs(allAdminMsgs);

			if (initialAdminSnapshot.current) {
				// This is the very first time we get a snapshot after mounting.
				// Let’s find all admin→team messages that are still unread (readByTeam === false),
				// and batch‐mark them as read.
				initialAdminSnapshot.current = false;

				const batch = writeBatch(db);
				let foundAnyUnread = false;

				snapshot.docs.forEach((docSnap) => {
					const data = docSnap.data();
					if (!data.readByTeam) {
						foundAnyUnread = true;
						batch.update(doc(db, 'messages', docSnap.id), { readByTeam: true });
					}
				});

				if (foundAnyUnread) {
					try {
						await batch.commit();
					} catch (err) {
						console.error(
							'Error marking initial admin→team messages as read:',
							err
						);
					}
				}
			} else {
				// This is NOT the initial snapshot. That means “the user is already on this screen”
				// and Firestore is telling us about changes (including any newly added docs).
				// We only want to mark as read those docs which have just been added (and which
				// are still unread).
				const batch = writeBatch(db);
				let foundNewUnread = false;

				snapshot.docChanges().forEach((change) => {
					// Only consider newly added documents (i.e. messages that arrived now).
					if (change.type === 'added') {
						const data = change.doc.data();
						if (!data.readByTeam) {
							foundNewUnread = true;
							batch.update(doc(db, 'messages', change.doc.id), {
								readByTeam: true,
							});
						}
					}
				});

				if (foundNewUnread) {
					try {
						await batch.commit();
					} catch (err) {
						console.error(
							'Error marking newly arrived admin→team message as read:',
							err
						);
					}
				}
			}
		});

		// team → admin: normal listener for messages that this team sends to admin
		const t2aQuery = query(
			collection(db, 'messages'),
			where('from', '==', teamId),
			where('to', '==', 'admin'),
			orderBy('timestamp', 'asc')
		);
		const unsubT2A = onSnapshot(t2aQuery, (snapshot) => {
			const msgs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
			setTeamToAdminMsgs(msgs);
		});

		return () => {
			unsubA2T();
			unsubT2A();
			// If the user leaves this chat, reset the “initial” flag so that next time they come back,
			// we’ll mark all unread on mount again:
			initialAdminSnapshot.current = true;
		};
	}, [db, teamId]);

	// Merge & sort whenever either stream changes, then auto-scroll
	useEffect(() => {
		const combined = [...adminToTeamMsgs, ...teamToAdminMsgs];
		combined.sort((a, b) => {
			const aTs = a.timestamp?.toMillis?.() || 0;
			const bTs = b.timestamp?.toMillis?.() || 0;
			return aTs - bTs;
		});
		setMergedMessages(combined);

		// Scroll to bottom on the next animation frame
		requestAnimationFrame(() => {
			if (chatEndRef.current) {
				chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
			}
		});
	}, [adminToTeamMsgs, teamToAdminMsgs]);

	// Sending a new message (team → admin)
	const sendMessage = async () => {
		if (!newMessageText.trim() || !teamId) return;
		await addDoc(collection(db, 'messages'), {
			from: teamId,
			to: 'admin',
			text: newMessageText.trim(),
			timestamp: serverTimestamp(),
			readByTeam: true, // They wrote it, so it’s “read” by the team
			readByAdmin: false, // Admin hasn’t seen it yet
		});
		setNewMessageText('');
	};

	return (
		<div className="relative h-screen bg-parchment">
			{/* ── HEADER (fixed to top) ───────────────────────── */}
			<div className="bg-charcoal fixed top-0 left-0 right-0 h-16 shadow-md flex items-center px-4 z-10">
				<button
					onClick={() => navigate('/dashboard')}
					className="mr-4 text-3xl text-parchment bg-charcoal"
				>
					←
				</button>
			</div>

			{/* ── MESSAGE LIST (fixed between header & footer) ─── */}
			<div className="bg-parchment fixed top-16 bottom-16 left-0 right-0 overflow-y-auto px-2">
				{mergedMessages.length === 0 ? (
					<div className="flex h-full items-center justify-center ">
						Say hello to your admins!
					</div>
				) : (
					mergedMessages.map((msg) => {
						const isAdminMessage = msg.from === 'admin';
						return (
							<div
								key={msg.id}
								className={`mb-3 flex text-lg ${
									isAdminMessage ? 'justify-start' : 'justify-end'
								}`}
							>
								<div
									className={`max-w-[90%] px-5 py-2 rounded-lg ${
										isAdminMessage
											? 'bg-blue-600 text-parchment text-left'
											: 'bg-green-600 text-parchment text-right'
									}`}
								>
									<p className="break-words">{msg.text}</p>
									<div
										className={`mt-1 text-xs flex items-center ${
											isAdminMessage ? '' : 'justify-end'
										}`}
									>
										<span>
											{msg.timestamp
												? new Date(msg.timestamp.toMillis()).toLocaleTimeString(
														[],
														{
															hour: '2-digit',
															minute: '2-digit',
														}
												  )
												: ''}
										</span>
										{!isAdminMessage && msg.readByAdmin && (
											<span className="ml-2">(seen)</span>
										)}
									</div>
								</div>
							</div>
						);
					})
				)}
				<div ref={chatEndRef} />
			</div>

			{/* ── INPUT BAR (fixed to bottom) ───────────────────── */}
			<div className="bg-charcoal fixed bottom-0 left-0 right-0 h-16 p-2 flex items-center px-4 z-10">
				<input
					type="text"
					className="flex-grow p-2 border border-gray-300 rounded-lg text-charcoal"
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
					className={`ml-2 py-2 px-4 rounded-lg font-semibold ${
						newMessageText.trim()
							? 'bg-blue-500 hover:bg-blue-600 text-white'
							: 'bg-gray-300 text-gray-500 cursor-not-allowed'
					}`}
				>
					send
				</button>
			</div>
		</div>
	);
}

export default Chat;
