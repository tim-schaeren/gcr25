import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
	const { t } = useTranslation();
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

	// Fetch teamId
	useEffect(() => {
		if (!user) return;
		const fetchTeamId = async () => {
			const userRef = doc(db, 'users', user.uid);
			const userSnap = await getDoc(userRef);
			if (userSnap.exists() && userSnap.data().teamId) {
				setTeamId(userSnap.data().teamId);
			}
		};
		fetchTeamId();
	}, [user, db]);

	// Listen for messages
	useEffect(() => {
		if (!teamId) return;

		// admin → team
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

			const batch = writeBatch(db);
			let doCommit = false;

			if (initialAdminSnapshot.current) {
				initialAdminSnapshot.current = false;
				snapshot.docs.forEach((docSnap) => {
					if (!docSnap.data().readByTeam) {
						doCommit = true;
						batch.update(doc(db, 'messages', docSnap.id), { readByTeam: true });
					}
				});
			} else {
				snapshot.docChanges().forEach((change) => {
					if (change.type === 'added' && !change.doc.data().readByTeam) {
						doCommit = true;
						batch.update(doc(db, 'messages', change.doc.id), {
							readByTeam: true,
						});
					}
				});
			}

			if (doCommit) {
				try {
					await batch.commit();
				} catch (err) {
					console.error('Error marking read:', err);
				}
			}
		});

		// team → admin
		const t2aQuery = query(
			collection(db, 'messages'),
			where('from', '==', teamId),
			where('to', '==', 'admin'),
			orderBy('timestamp', 'asc')
		);
		const unsubT2A = onSnapshot(t2aQuery, (snap) => {
			setTeamToAdminMsgs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
		});

		return () => {
			unsubA2T();
			unsubT2A();
			initialAdminSnapshot.current = true;
		};
	}, [db, teamId]);

	// Merge & scroll
	useEffect(() => {
		const combined = [...adminToTeamMsgs, ...teamToAdminMsgs].sort((a, b) => {
			const aTs = a.timestamp?.toMillis?.() || 0;
			const bTs = b.timestamp?.toMillis?.() || 0;
			return aTs - bTs;
		});
		setMergedMessages(combined);
		requestAnimationFrame(() => {
			chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
		});
	}, [adminToTeamMsgs, teamToAdminMsgs]);

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
			{/* HEADER */}
			<div className="bg-charcoal fixed top-0 left-0 right-0 h-16 shadow-md flex items-center px-4 z-10">
				<button
					onClick={() => navigate('/dashboard')}
					className="mr-4 text-3xl text-parchment bg-charcoal"
				>
					←
				</button>
			</div>

			{/* MESSAGE LIST */}
			<div className="bg-parchment fixed top-16 bottom-16 left-0 right-0 overflow-y-auto px-2">
				{mergedMessages.length === 0 ? (
					<div className="flex h-full items-center justify-center text-charcoal">
						{t('chat.empty')}
					</div>
				) : (
					mergedMessages.map((msg) => {
						const isAdmin = msg.from === 'admin';
						return (
							<div
								key={msg.id}
								className={`mb-3 flex text-lg ${
									isAdmin ? 'justify-start' : 'justify-end'
								}`}
							>
								<div
									className={`max-w-[90%] px-5 py-2 rounded-lg ${
										isAdmin
											? 'bg-blue-600 text-parchment text-left'
											: 'bg-green-600 text-parchment text-right'
									}`}
								>
									<p className="break-words">{msg.text}</p>
									<div
										className={`mt-1 text-xs flex items-center ${
											isAdmin ? '' : 'justify-end'
										}`}
									>
										<span>
											{msg.timestamp
												? new Date(msg.timestamp.toMillis()).toLocaleTimeString(
														[],
														{ hour: '2-digit', minute: '2-digit' }
												  )
												: ''}
										</span>
										{!isAdmin && msg.readByAdmin && (
											<span className="ml-2">{t('chat.seen')}</span>
										)}
									</div>
								</div>
							</div>
						);
					})
				)}
				<div ref={chatEndRef} />
			</div>

			{/* INPUT BAR */}
			<div className="bg-charcoal fixed bottom-0 left-0 right-0 h-16 p-2 flex items-center px-4 z-10">
				<input
					type="text"
					className="flex-grow p-2 border border-gray-300 rounded-lg text-charcoal"
					placeholder={t('chat.placeholder')}
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
					{t('chat.send')}
				</button>
			</div>
		</div>
	);
}

export default Chat;
