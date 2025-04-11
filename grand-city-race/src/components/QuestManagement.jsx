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
import QRCode from 'qrcode';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

// Import Firebase Storage functions (aliased as storageRef to avoid confusion with Firestore's doc ref)
import {
	ref as storageRef,
	uploadBytes,
	getDownloadURL,
	deleteObject,
} from 'firebase/storage';

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

function QuestManagement({ db, storage }) {
	// Quest data state
	const [quests, setQuests] = useState([]);
	// Create modal state
	const [newQuestName, setNewQuestName] = useState('');
	const [newQuestSequence, setNewQuestSequence] = useState('');
	const [newQuestHint, setNewQuestHint] = useState('');
	const [newQuestText, setNewQuestText] = useState('');
	const [newQuestAnswer, setNewQuestAnswer] = useState('');
	// New image state for creation
	const [newQuestImageFile, setNewQuestImageFile] = useState(null);
	const [newQuestImagePreview, setNewQuestImagePreview] = useState(null);
	const [isCreateModalOpen, setCreateModalOpen] = useState(false);

	// Delete modal state.
	const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
	const [selectedQuestForDelete, setSelectedQuestForDelete] = useState(null);

	// Edit modal state.
	const [isEditModalOpen, setEditModalOpen] = useState(false);
	const [selectedQuestForEdit, setSelectedQuestForEdit] = useState(null);
	const [editQuestName, setEditQuestName] = useState('');
	const [editQuestSequence, setEditQuestSequence] = useState('');
	const [editQuestHint, setEditQuestHint] = useState('');
	const [editQuestText, setEditQuestText] = useState('');
	const [editQuestAnswer, setEditQuestAnswer] = useState('');
	// Image state for editing:
	const [editQuestImageFile, setEditQuestImageFile] = useState(null);
	const [editQuestImagePreview, setEditQuestImagePreview] = useState(null);
	// Flag to indicate if user wants to remove any currently stored image (even without selecting a new one)
	const [shouldDeleteExistingImage, setShouldDeleteExistingImage] =
		useState(false);

	// View Details modal state.
	const [isViewModalOpen, setViewModalOpen] = useState(false);
	const [selectedQuestForView, setSelectedQuestForView] = useState(null);

	// Upload error state
	const [uploadError, setUploadError] = useState(null);

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

	// ── File Input Handlers ──
	const handleNewQuestImageChange = (e) => {
		const file = e.target.files[0];
		if (file) {
			const validTypes = ['image/jpeg', 'image/png'];
			const maxSize = 5 * 1024 * 1024; // 5 MB
			if (!validTypes.includes(file.type)) {
				alert('Only JPEG and PNG files are allowed');
				return;
			}
			if (file.size > maxSize) {
				alert('File size should be less than 5MB');
				return;
			}
			setNewQuestImageFile(file);
			setNewQuestImagePreview(URL.createObjectURL(file));
		}
	};

	const handleEditQuestImageChange = (e) => {
		const file = e.target.files[0];
		if (file) {
			const validTypes = ['image/jpeg', 'image/png'];
			const maxSize = 5 * 1024 * 1024; // 5 MB
			if (!validTypes.includes(file.type)) {
				alert('Only JPEG and PNG files are allowed');
				return;
			}
			if (file.size > maxSize) {
				alert('File size should be less than 5MB');
				return;
			}
			setEditQuestImageFile(file);
			setEditQuestImagePreview(URL.createObjectURL(file));
			setShouldDeleteExistingImage(true);
		}
	};

	// ── Function to Open Edit Modal ──
	const openEditModal = (quest) => {
		setSelectedQuestForEdit(quest);
		setEditQuestName(quest.name || '');
		setEditQuestSequence(quest.sequence ? quest.sequence.toString() : '');
		setEditQuestHint(quest.hint || '');
		setEditQuestText(quest.text || '');
		setEditQuestAnswer(quest.answer || '');
		// Reset image states for editing
		setEditQuestImageFile(null);
		setEditQuestImagePreview(null);
		setShouldDeleteExistingImage(false);
		setEditModalOpen(true);
	};

	// ── CREATE QUEST ──
	const createQuest = async () => {
		const newSeq = newQuestSequence
			? parseInt(newQuestSequence, 10)
			: quests.length + 1;
		const batch = writeBatch(db);
		const questsRef = collection(db, 'quests');

		quests.forEach((quest) => {
			if (quest.sequence >= newSeq) {
				const questDocRef = doc(db, 'quests', quest.id);
				batch.update(questDocRef, { sequence: quest.sequence + 1 });
			}
		});

		const newQuestRef = doc(questsRef);
		let imageUrl = '';
		let imagePath = '';
		if (newQuestImageFile && storage) {
			try {
				const ext = newQuestImageFile.name.split('.').pop();
				imagePath = `quests/${newQuestRef.id}.${ext}`;
				const imgRef = storageRef(storage, imagePath);
				await uploadBytes(imgRef, newQuestImageFile);
				imageUrl = await getDownloadURL(imgRef);
				if (!imageUrl) {
					throw new Error('Download URL is empty');
				}
			} catch (error) {
				console.error('Error uploading file:', error);
				setUploadError(
					'Saving file in Firebase Storage failed. Please try again.'
				);
				return;
			}
		}

		batch.set(newQuestRef, {
			name: newQuestName,
			sequence: newSeq,
			hint: newQuestHint,
			text: newQuestText,
			answer: newQuestAnswer,
			imageUrl,
			imagePath,
		});

		await batch.commit();

		setNewQuestName('');
		setNewQuestSequence('');
		setNewQuestHint('');
		setNewQuestText('');
		setNewQuestAnswer('');
		setNewQuestImageFile(null);
		setNewQuestImagePreview(null);
		setUploadError(null);
		setCreateModalOpen(false);
	};

	// ── DELETE QUEST ──
	const deleteQuest = async () => {
		if (!selectedQuestForDelete) return;

		const questToDelete = quests.find((q) => q.id === selectedQuestForDelete);
		if (!questToDelete) return;
		const deletedSeq = questToDelete.sequence;

		if (questToDelete.imagePath && storage) {
			const imgRef = storageRef(storage, questToDelete.imagePath);
			try {
				await deleteObject(imgRef);
			} catch (error) {
				console.error('Error deleting image:', error);
			}
		}

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

	// ── UPDATE QUEST ──
	const updateQuest = async () => {
		if (!selectedQuestForEdit) return;
		const newSeq = editQuestSequence
			? parseInt(editQuestSequence, 10)
			: selectedQuestForEdit.sequence;
		if (isNaN(newSeq)) return;

		let updatedImageUrl = selectedQuestForEdit.imageUrl || '';
		let updatedImagePath = selectedQuestForEdit.imagePath || '';
		if (editQuestImageFile && storage) {
			try {
				if (selectedQuestForEdit.imagePath && shouldDeleteExistingImage) {
					const oldImgRef = storageRef(storage, selectedQuestForEdit.imagePath);
					await deleteObject(oldImgRef);
				}
				const ext = editQuestImageFile.name.split('.').pop();
				updatedImagePath = `quests/${selectedQuestForEdit.id}.${ext}`;
				const newImgRef = storageRef(storage, updatedImagePath);
				await uploadBytes(newImgRef, editQuestImageFile);
				updatedImageUrl = await getDownloadURL(newImgRef);
				if (!updatedImageUrl) {
					throw new Error('Download URL is empty');
				}
			} catch (error) {
				console.error('Error uploading new image:', error);
				setUploadError(
					'Saving file in Firebase Storage failed. Please try again.'
				);
				return;
			}
		} else if (
			shouldDeleteExistingImage &&
			selectedQuestForEdit.imagePath &&
			storage
		) {
			try {
				const oldImgRef = storageRef(storage, selectedQuestForEdit.imagePath);
				await deleteObject(oldImgRef);
				updatedImageUrl = '';
				updatedImagePath = '';
			} catch (error) {
				console.error('Error deleting image:', error);
				setUploadError(
					'Deleting the existing file in Firebase Storage failed.'
				);
				return;
			}
		}

		const sortedQuests = quests.slice().sort((a, b) => a.sequence - b.sequence);
		const filteredQuests = sortedQuests.filter(
			(q) => q.id !== selectedQuestForEdit.id
		);
		const effectiveLength = filteredQuests.length + 1;
		const clampedSeq = Math.max(1, Math.min(newSeq, effectiveLength));

		const updatedQuest = {
			...selectedQuestForEdit,
			name: editQuestName,
			hint: editQuestHint,
			text: editQuestText,
			answer: editQuestAnswer,
			sequence: clampedSeq,
			imageUrl: updatedImageUrl,
			imagePath: updatedImagePath,
		};

		filteredQuests.splice(clampedSeq - 1, 0, updatedQuest);

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
				imageUrl: quest.imageUrl || '',
				imagePath: quest.imagePath || '',
			});
		});
		await batch.commit();

		setSelectedQuestForEdit(null);
		setEditQuestName('');
		setEditQuestSequence('');
		setEditQuestHint('');
		setEditQuestText('');
		setEditQuestAnswer('');
		setEditQuestImageFile(null);
		setEditQuestImagePreview(null);
		setShouldDeleteExistingImage(false);
		setUploadError(null);
		setEditModalOpen(false);
	};

	const openViewModal = (quest) => {
		setSelectedQuestForView(quest);
		setViewModalOpen(true);
	};

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

	const generateAllQRCodes = async () => {
		const zip = new JSZip();
		const folder = zip.folder('qrcodes');
		const promises = sortedQuests.map(async (quest) => {
			const url = await QRCode.toDataURL(quest.id);
			const base64Data = url.split(',')[1];
			folder.file(`${quest.sequence}.png`, base64Data, { base64: true });
		});
		await Promise.all(promises);
		zip.generateAsync({ type: 'blob' }).then((content) => {
			saveAs(content, 'qrcodes.zip');
		});
	};

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
	const sortedQuests = quests.slice().sort((a, b) => a.sequence - b.sequence);

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			{/* Prevent Mobile Access */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
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
						<Link
							to="/admin/items"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Items
						</Link>
					</nav>
				</aside>
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
						<div className="mb-4">
							<input
								type="file"
								accept="image/png, image/jpeg"
								onChange={handleNewQuestImageChange}
							/>
							{newQuestImagePreview && (
								<div>
									<img
										src={newQuestImagePreview}
										alt="Preview"
										style={{ maxWidth: '200px' }}
										className="mt-2"
									/>
									<button
										onClick={() => {
											setNewQuestImageFile(null);
											setNewQuestImagePreview(null);
										}}
										className="mt-2 px-2 py-1 bg-red-300 rounded"
									>
										Remove Image
									</button>
								</div>
							)}
						</div>
						{uploadError && (
							<div className="mt-2 text-red-600">{uploadError}</div>
						)}
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
						<div className="mb-4">
							<input
								type="file"
								accept="image/png, image/jpeg"
								onChange={handleEditQuestImageChange}
							/>
							{editQuestImagePreview ? (
								<div>
									<img
										src={editQuestImagePreview}
										alt="Preview"
										style={{ maxWidth: '200px' }}
										className="mt-2"
									/>
									<button
										onClick={() => {
											setEditQuestImageFile(null);
											setEditQuestImagePreview(null);
											setShouldDeleteExistingImage(true);
										}}
										className="mt-2 px-2 py-1 bg-red-300 rounded"
									>
										Remove Image
									</button>
								</div>
							) : (
								selectedQuestForEdit.imageUrl && (
									<div>
										<img
											src={selectedQuestForEdit.imageUrl}
											alt="Current"
											style={{ maxWidth: '200px' }}
											className="mt-2"
										/>
										<button
											onClick={() => {
												setShouldDeleteExistingImage(true);
											}}
											className="mt-2 px-2 py-1 bg-red-300 rounded"
										>
											Remove Image
										</button>
									</div>
								)
							)}
						</div>
						{uploadError && (
							<div className="mt-2 text-red-600">{uploadError}</div>
						)}
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
						{selectedQuestForView.imageUrl && (
							<div className="mt-2">
								<img
									src={selectedQuestForView.imageUrl}
									alt="Quest"
									style={{ maxWidth: '200px' }}
								/>
							</div>
						)}
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
