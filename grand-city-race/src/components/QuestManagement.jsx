import React, { useEffect, useState } from 'react';
import {
	collection,
	onSnapshot,
	addDoc,
	doc,
	updateDoc,
	deleteDoc,
	writeBatch,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';

// dnd-kit imports
import {
	DndContext,
	closestCenter,
	PointerSensor,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	SortableContext,
	verticalListSortingStrategy,
	arrayMove,
	useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Additional imports for QR code generation and ZIP file creation.
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// ── SortableRow Component ──
// Accepts an onClick prop so that clicking a row (except its action buttons)
// will open the view details modal.
function SortableRow({ id, children, onClick }) {
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id });

	const style = {
		transform: CSS.Transform.toString(transform),
		transition,
		backgroundColor: isDragging ? '#f0f0f0' : undefined,
		opacity: isDragging ? 0.8 : 1,
		cursor: 'pointer',
	};

	return (
		<tr
			ref={setNodeRef}
			style={style}
			onClick={onClick}
			{...attributes}
			{...listeners}
		>
			{children}
		</tr>
	);
}

function QuestManagement({ db }) {
	// State for quests and create modal.
	const [quests, setQuests] = useState([]);
	const [newQuestName, setNewQuestName] = useState('');
	const [newQuestSequence, setNewQuestSequence] = useState('');
	const [newQuestHint, setNewQuestHint] = useState('');
	const [newQuestText, setNewQuestText] = useState('');
	const [newQuestAnswer, setNewQuestAnswer] = useState('');
	const [isCreateModalOpen, setCreateModalOpen] = useState(false);

	// State for delete modal.
	const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
	const [selectedQuestForDelete, setSelectedQuestForDelete] = useState(null);

	// State for edit modal.
	const [isEditModalOpen, setEditModalOpen] = useState(false);
	const [selectedQuestForEdit, setSelectedQuestForEdit] = useState(null);
	const [editQuestName, setEditQuestName] = useState('');
	const [editQuestSequence, setEditQuestSequence] = useState('');
	const [editQuestHint, setEditQuestHint] = useState('');
	const [editQuestText, setEditQuestText] = useState('');
	const [editQuestAnswer, setEditQuestAnswer] = useState('');

	// State for view details modal.
	const [isViewModalOpen, setViewModalOpen] = useState(false);
	const [selectedQuestForView, setSelectedQuestForView] = useState(null);

	// ── Firestore Listener ──
	useEffect(() => {
		const questsRef = collection(db, 'quests');
		const unsubscribe = onSnapshot(questsRef, (snapshot) => {
			const questList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));
			setQuests(questList);
		});
		return () => unsubscribe();
	}, [db]);

	// ── CREATE QUEST ──
	const createQuest = async () => {
		if (
			!newQuestName.trim() ||
			!newQuestSequence ||
			!newQuestHint.trim() ||
			!newQuestText.trim() ||
			!newQuestAnswer.trim()
		)
			return;

		const newSeq = parseInt(newQuestSequence, 10);
		const batch = writeBatch(db);
		const questsRef = collection(db, 'quests');

		// Increment sequence of any quest whose sequence is >= newSeq.
		quests.forEach((quest) => {
			if (quest.sequence >= newSeq) {
				const questDocRef = doc(db, 'quests', quest.id);
				batch.update(questDocRef, { sequence: quest.sequence + 1 });
			}
		});

		// Create the new quest.
		const newQuestRef = doc(questsRef); // auto-generated ID
		batch.set(newQuestRef, {
			name: newQuestName,
			sequence: newSeq,
			hint: newQuestHint,
			text: newQuestText,
			answer: newQuestAnswer,
		});

		await batch.commit();

		// Clear inputs and close modal.
		setNewQuestName('');
		setNewQuestSequence('');
		setNewQuestHint('');
		setNewQuestText('');
		setNewQuestAnswer('');
		setCreateModalOpen(false);
	};

	// ── DELETE QUEST ──
	const deleteQuest = async () => {
		if (!selectedQuestForDelete) return;

		const questToDelete = quests.find((q) => q.id === selectedQuestForDelete);
		if (!questToDelete) return;
		const deletedSeq = questToDelete.sequence;

		const batch = writeBatch(db);
		const questDocRef = doc(db, 'quests', selectedQuestForDelete);
		batch.delete(questDocRef);

		quests.forEach((quest) => {
			if (quest.sequence > deletedSeq) {
				const questRef = doc(db, 'quests', quest.id);
				batch.update(questRef, { sequence: quest.sequence - 1 });
			}
		});

		await batch.commit();
		setDeleteModalOpen(false);
		setSelectedQuestForDelete(null);
	};

	// ── EDIT QUEST ──
	const openEditModal = (quest) => {
		setSelectedQuestForEdit(quest);
		setEditQuestName(quest.name || '');
		setEditQuestSequence(quest.sequence.toString());
		setEditQuestHint(quest.hint || '');
		setEditQuestText(quest.text || '');
		setEditQuestAnswer(quest.answer || '');
		setEditModalOpen(true);
	};

	const updateQuest = async () => {
		if (!selectedQuestForEdit) return;
		const newSeq = parseInt(editQuestSequence, 10);
		if (isNaN(newSeq)) return;

		// Create an ordered list without the quest being edited.
		const sortedQuests = quests.slice().sort((a, b) => a.sequence - b.sequence);
		const filteredQuests = sortedQuests.filter(
			(q) => q.id !== selectedQuestForEdit.id
		);
		const effectiveLength = filteredQuests.length + 1;
		const clampedSeq = Math.max(1, Math.min(newSeq, effectiveLength));

		// Build the updated quest object.
		const updatedQuest = {
			...selectedQuestForEdit,
			name: editQuestName,
			hint: editQuestHint,
			text: editQuestText,
			answer: editQuestAnswer,
			sequence: clampedSeq, // temporary value
		};

		// Insert the updated quest at the desired position.
		filteredQuests.splice(clampedSeq - 1, 0, updatedQuest);

		// Recalculate sequences for all quests.
		const newOrderedQuests = filteredQuests.map((quest, index) => ({
			...quest,
			sequence: index + 1,
		}));

		const batch = writeBatch(db);
		newOrderedQuests.forEach((quest) => {
			const questRef = doc(db, 'quests', quest.id);
			batch.update(questRef, {
				name: quest.name,
				sequence: quest.sequence,
				hint: quest.hint,
				text: quest.text,
				answer: quest.answer,
			});
		});
		await batch.commit();

		// Clear edit state.
		setSelectedQuestForEdit(null);
		setEditQuestName('');
		setEditQuestSequence('');
		setEditQuestHint('');
		setEditQuestText('');
		setEditQuestAnswer('');
		setEditModalOpen(false);
	};

	// ── VIEW DETAILS MODAL ──
	const openViewModal = (quest) => {
		setSelectedQuestForView(quest);
		setViewModalOpen(true);
	};

	// ── QR CODE FUNCTIONS ──
	// Generate and download a QR code image for a single quest ID.
	const downloadQRCode = async (questId) => {
		try {
			const url = await QRCode.toDataURL(questId);
			const link = document.createElement('a');
			link.href = url;
			link.download = `${questId}.png`;
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
		} catch (err) {
			console.error('Error generating QR code:', err);
		}
	};

	// Generate QR codes for all quests, package them into a ZIP file, and download.
	const generateAllQRCodes = async () => {
		const zip = new JSZip();
		const folder = zip.folder('qrcodes');
		// Use the sorted quests array.
		const promises = sortedQuests.map(async (quest) => {
			const url = await QRCode.toDataURL(quest.id);
			const base64Data = url.split(',')[1];
			folder.file(`${quest.id}.png`, base64Data, { base64: true });
		});
		await Promise.all(promises);
		zip.generateAsync({ type: 'blob' }).then((content) => {
			saveAs(content, 'qrcodes.zip');
		});
	};

	// ── dnd-kit Setup ──
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
	);

	const handleDragEnd = async (event) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;

		const sortedQuests = quests.slice().sort((a, b) => a.sequence - b.sequence);
		const oldIndex = sortedQuests.findIndex((quest) => quest.id === active.id);
		const newIndex = sortedQuests.findIndex((quest) => quest.id === over.id);
		const newSortedQuests = arrayMove(sortedQuests, oldIndex, newIndex);

		const batch = writeBatch(db);
		newSortedQuests.forEach((quest, index) => {
			const newSequence = index + 1;
			if (quest.sequence !== newSequence) {
				const questRef = doc(db, 'quests', quest.id);
				batch.update(questRef, { sequence: newSequence });
			}
		});
		await batch.commit();
	};

	// ── Sorted Quests for Display ──
	const sortedQuests = quests.slice().sort((a, b) => a.sequence - b.sequence);

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			{/* Prevent Mobile Access */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>

			{/* Dashboard for larger screens */}
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar */}
				<aside className="w-64 h-screen bg-white shadow-lg rounded-lg p-6 mr-8">
					<h3 className="text-xl font-bold mb-4">Admin Menu</h3>
					<nav className="flex flex-col space-y-4">
						<Link
							to="/admin"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Leaderboard
						</Link>
						<Link
							to="/admin/users"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Users
						</Link>
						<Link
							to="/admin/teams"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Teams
						</Link>
						<Link
							to="/admin/quests"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Quests
						</Link>
					</nav>
				</aside>

				{/* Main Content */}
				<div className="flex-1">
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							? Quest Management
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Sequence
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Name
									</th>
									<th className="border border-gray-300 p-4 text-black">ID</th>
									<th className="border border-gray-300 p-4 text-black">
										Actions
									</th>
								</tr>
							</thead>
							<DndContext
								sensors={sensors}
								collisionDetection={closestCenter}
								onDragEnd={handleDragEnd}
							>
								<SortableContext
									items={sortedQuests.map((quest) => quest.id)}
									strategy={verticalListSortingStrategy}
								>
									<tbody>
										{sortedQuests.map((quest) => (
											<SortableRow
												key={quest.id}
												id={quest.id}
												onClick={() => openViewModal(quest)}
											>
												<td className="border border-gray-300 p-4 text-black font-semibold">
													{quest.sequence}
												</td>
												<td className="border border-gray-300 p-4 text-black font-semibold">
													{quest.name}
												</td>
												<td className="border border-gray-300 p-4 text-black font-semibold">
													{quest.id}
												</td>
												<td className="border border-gray-300 p-4 text-black font-semibold">
													<button
														onClick={(e) => {
															e.stopPropagation();
															openEditModal(quest);
														}}
														className="text-blue-600 hover:text-blue-800 mr-2"
													>
														✏️ Edit
													</button>
													<button
														onClick={(e) => {
															e.stopPropagation();
															setSelectedQuestForDelete(quest.id);
															setDeleteModalOpen(true);
														}}
														className="text-red-600 hover:text-red-800 mr-2"
													>
														❌ Delete
													</button>
													<button
														onClick={(e) => {
															e.stopPropagation();
															downloadQRCode(quest.id);
														}}
														className="text-green-600 hover:text-green-800"
													>
														QR
													</button>
												</td>
											</SortableRow>
										))}
									</tbody>
								</SortableContext>
							</DndContext>
						</table>
					</div>
					<div className="flex space-x-4">
						<button
							onClick={() => setCreateModalOpen(true)}
							className="bg-blue-300 text-black px-4 py-2 rounded-lg hover:bg-blue-700 transition"
						>
							➕ Create Quest
						</button>
						<button
							onClick={generateAllQRCodes}
							className="bg-green-300 text-black px-4 py-2 rounded-lg hover:bg-green-700 transition"
						>
							Generate QR Codes
						</button>
					</div>
				</div>
			</div>

			{/* Create Quest Modal */}
			{isCreateModalOpen && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg">
						<h3 className="text-lg font-semibold mb-4">Create New Quest</h3>
						<input
							type="text"
							placeholder="Name"
							value={newQuestName}
							onChange={(e) => setNewQuestName(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="number"
							placeholder="Sequence"
							value={newQuestSequence}
							onChange={(e) => setNewQuestSequence(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Hint"
							value={newQuestHint}
							onChange={(e) => setNewQuestHint(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Text"
							value={newQuestText}
							onChange={(e) => setNewQuestText(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Answer"
							value={newQuestAnswer}
							onChange={(e) => setNewQuestAnswer(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<div className="flex justify-end space-x-3">
							<button
								onClick={() => setCreateModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={createQuest}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Create
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Edit Quest Modal */}
			{isEditModalOpen && selectedQuestForEdit && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">Edit Quest</h3>
						<input
							type="text"
							placeholder="Name"
							value={editQuestName}
							onChange={(e) => setEditQuestName(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="number"
							placeholder="Sequence"
							value={editQuestSequence}
							onChange={(e) => setEditQuestSequence(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Hint"
							value={editQuestHint}
							onChange={(e) => setEditQuestHint(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Text"
							value={editQuestText}
							onChange={(e) => setEditQuestText(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Answer"
							value={editQuestAnswer}
							onChange={(e) => setEditQuestAnswer(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<div className="flex justify-end space-x-3">
							<button
								onClick={() => setEditModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={updateQuest}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Save
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Delete Quest Modal */}
			{isDeleteModalOpen && selectedQuestForDelete && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">Delete Quest</h3>
						<p>Are you sure you want to delete this quest?</p>
						<div className="flex justify-end space-x-3 mt-4">
							<button
								onClick={() => setDeleteModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Cancel
							</button>
							<button
								onClick={deleteQuest}
								className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}

			{/* View Quest Details Modal */}
			{isViewModalOpen && selectedQuestForView && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-md">
						<h3 className="text-lg font-semibold mb-4">Quest Details</h3>
						<p>
							<strong>Name:</strong> {selectedQuestForView.name}
						</p>
						<p>
							<strong>Sequence:</strong> {selectedQuestForView.sequence}
						</p>
						<p>
							<strong>Hint:</strong> {selectedQuestForView.hint}
						</p>
						<p>
							<strong>Text:</strong> {selectedQuestForView.text}
						</p>
						<p>
							<strong>Answer:</strong> {selectedQuestForView.answer}
						</p>
						<div className="flex justify-end space-x-3 mt-4">
							<button
								onClick={() => setViewModalOpen(false)}
								className="px-4 py-2 bg-gray-300 rounded-lg hover:bg-gray-400"
							>
								Close
							</button>
							<button
								onClick={() => {
									setViewModalOpen(false);
									openEditModal(selectedQuestForView);
								}}
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
							>
								Edit
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export default QuestManagement;
