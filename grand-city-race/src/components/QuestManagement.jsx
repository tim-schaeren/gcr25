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
	// Combined media state for creation (image OR video)
	const [newQuestMediaFile, setNewQuestMediaFile] = useState(null);
	const [newQuestMediaPreview, setNewQuestMediaPreview] = useState(null);
	const [newQuestMediaType, setNewQuestMediaType] = useState(null); // "image" or "video"
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
	// Combined media state for editing
	const [editQuestMediaFile, setEditQuestMediaFile] = useState(null);
	const [editQuestMediaPreview, setEditQuestMediaPreview] = useState(null);
	const [editQuestMediaType, setEditQuestMediaType] = useState(null); // "image" or "video"
	// Flag to indicate if user wants to remove any currently stored media
	const [shouldDeleteExistingMedia, setShouldDeleteExistingMedia] =
		useState(false);

	// View Details modal state.
	const [isViewModalOpen, setViewModalOpen] = useState(false);
	const [selectedQuestForView, setSelectedQuestForView] = useState(null);

	// Upload error state
	const [uploadError, setUploadError] = useState(null);
	// Upload loading state
	const [isUploading, setIsUploading] = useState(false);

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

	// ── Media File Input Handlers ──
	const handleNewQuestMediaChange = (e) => {
		const file = e.target.files[0];
		if (file) {
			if (file.type.startsWith('image/')) {
				const maxSize = 5 * 1024 * 1024; // 5MB
				if (file.size > maxSize) {
					alert('Image file size should be less than 5MB');
					return;
				}
				setNewQuestMediaFile(file);
				setNewQuestMediaPreview(URL.createObjectURL(file));
				setNewQuestMediaType('image');
			} else if (file.type.startsWith('video/')) {
				// Allow MP4 and MOV (MIME type "video/mp4" and "video/quicktime")
				if (!(file.type === 'video/mp4' || file.type === 'video/quicktime')) {
					alert('Only MP4 and MOV videos are allowed');
					return;
				}
				const maxSize = 20 * 1024 * 1024; // 20MB
				if (file.size > maxSize) {
					alert('Video file size should be less than 20MB');
					return;
				}
				setNewQuestMediaFile(file);
				setNewQuestMediaPreview(URL.createObjectURL(file));
				setNewQuestMediaType('video');
			} else {
				alert('Unsupported file type.');
			}
		}
	};

	const handleEditQuestMediaChange = (e) => {
		const file = e.target.files[0];
		if (file) {
			if (file.type.startsWith('image/')) {
				const maxSize = 5 * 1024 * 1024; // 5MB
				if (file.size > maxSize) {
					alert('Image file size should be less than 5MB');
					return;
				}
				setEditQuestMediaFile(file);
				setEditQuestMediaPreview(URL.createObjectURL(file));
				setEditQuestMediaType('image');
				setShouldDeleteExistingMedia(true);
			} else if (file.type.startsWith('video/')) {
				if (!(file.type === 'video/mp4' || file.type === 'video/quicktime')) {
					alert('Only MP4 and MOV videos are allowed');
					return;
				}
				const maxSize = 200 * 1024 * 1024; // 200MB
				if (file.size > maxSize) {
					alert('Video file size should be less than 200MB');
					return;
				}
				setEditQuestMediaFile(file);
				setEditQuestMediaPreview(URL.createObjectURL(file));
				setEditQuestMediaType('video');
				setShouldDeleteExistingMedia(true);
			} else {
				alert('Unsupported file type.');
			}
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
		// Pre-populate media state from existing quest data.
		if (quest.imageUrl) {
			setEditQuestMediaType('image');
			setEditQuestMediaPreview(quest.imageUrl);
		} else if (quest.videoUrl) {
			setEditQuestMediaType('video');
			setEditQuestMediaPreview(quest.videoUrl);
		} else {
			setEditQuestMediaType(null);
			setEditQuestMediaPreview(null);
		}
		setEditQuestMediaFile(null);
		setShouldDeleteExistingMedia(false);
		setEditModalOpen(true);
	};

	// ── CREATE QUEST ──
	const createQuest = async () => {
		setIsUploading(true);
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
		let videoUrl = '';
		let videoPath = '';
		if (newQuestMediaFile && storage) {
			if (newQuestMediaType === 'image') {
				try {
					const ext = newQuestMediaFile.name.split('.').pop();
					imagePath = `quests/${newQuestRef.id}.${ext}`;
					const imgRef = storageRef(storage, imagePath);
					await uploadBytes(imgRef, newQuestMediaFile);
					imageUrl = await getDownloadURL(imgRef);
					if (!imageUrl) throw new Error('Download URL is empty');
				} catch (error) {
					console.error('Error uploading image:', error);
					setUploadError(
						'Saving image in Firebase Storage failed. Please try again.'
					);
					setIsUploading(false);
					return;
				}
			} else if (newQuestMediaType === 'video') {
				try {
					const ext = newQuestMediaFile.name.split('.').pop();
					videoPath = `quests/${newQuestRef.id}.${ext}`;
					const vidRef = storageRef(storage, videoPath);
					await uploadBytes(vidRef, newQuestMediaFile);
					videoUrl = await getDownloadURL(vidRef);
					if (!videoUrl) throw new Error('Download URL is empty');
				} catch (error) {
					console.error('Error uploading video:', error);
					setUploadError(
						'Saving video in Firebase Storage failed. Please try again.'
					);
					setIsUploading(false);
					return;
				}
			}
		}

		batch.set(newQuestRef, {
			name: newQuestName,
			sequence: newSeq,
			hint: newQuestHint,
			text: newQuestText,
			answer: newQuestAnswer,
			imageUrl: newQuestMediaType === 'image' ? imageUrl : '',
			imagePath: newQuestMediaType === 'image' ? imagePath : '',
			videoUrl: newQuestMediaType === 'video' ? videoUrl : '',
			videoPath: newQuestMediaType === 'video' ? videoPath : '',
		});

		await batch.commit();

		setNewQuestName('');
		setNewQuestSequence('');
		setNewQuestHint('');
		setNewQuestText('');
		setNewQuestAnswer('');
		setNewQuestMediaFile(null);
		setNewQuestMediaPreview(null);
		setNewQuestMediaType(null);
		setUploadError(null);
		setCreateModalOpen(false);
		setIsUploading(false);
	};

	// ── DELETE QUEST ──
	const deleteQuest = async () => {
		if (!selectedQuestForDelete) return;

		const questToDelete = quests.find((q) => q.id === selectedQuestForDelete);
		if (!questToDelete) return;
		const deletedSeq = questToDelete.sequence;

		// Delete associated media if present.
		if (questToDelete.imagePath && storage) {
			const imgRef = storageRef(storage, questToDelete.imagePath);
			try {
				await deleteObject(imgRef);
			} catch (error) {
				console.error('Error deleting image:', error);
			}
		}
		if (questToDelete.videoPath && storage) {
			const vidRef = storageRef(storage, questToDelete.videoPath);
			try {
				await deleteObject(vidRef);
			} catch (error) {
				console.error('Error deleting video:', error);
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
		setIsUploading(true);
		if (!selectedQuestForEdit) return;
		const newSeq = editQuestSequence
			? parseInt(editQuestSequence, 10)
			: selectedQuestForEdit.sequence;
		if (isNaN(newSeq)) return;

		let updatedImageUrl = selectedQuestForEdit.imageUrl || '';
		let updatedImagePath = selectedQuestForEdit.imagePath || '';
		let updatedVideoUrl = selectedQuestForEdit.videoUrl || '';
		let updatedVideoPath = selectedQuestForEdit.videoPath || '';

		if (editQuestMediaFile && storage) {
			if (editQuestMediaType === 'image') {
				try {
					if (selectedQuestForEdit.imagePath && shouldDeleteExistingMedia) {
						const oldImgRef = storageRef(
							storage,
							selectedQuestForEdit.imagePath
						);
						await deleteObject(oldImgRef);
					}
					const ext = editQuestMediaFile.name.split('.').pop();
					updatedImagePath = `quests/${selectedQuestForEdit.id}.${ext}`;
					const imgRef = storageRef(storage, updatedImagePath);
					await uploadBytes(imgRef, editQuestMediaFile);
					updatedImageUrl = await getDownloadURL(imgRef);
					if (!updatedImageUrl) throw new Error('Download URL is empty');
					// Clear video fields if a new image is uploaded.
					updatedVideoUrl = '';
					updatedVideoPath = '';
				} catch (error) {
					console.error('Error uploading new image:', error);
					setUploadError(
						'Saving image in Firebase Storage failed. Please try again.'
					);
					setIsUploading(false);
					return;
				}
			} else if (editQuestMediaType === 'video') {
				try {
					if (selectedQuestForEdit.videoPath && shouldDeleteExistingMedia) {
						const oldVidRef = storageRef(
							storage,
							selectedQuestForEdit.videoPath
						);
						await deleteObject(oldVidRef);
					}
					const ext = editQuestMediaFile.name.split('.').pop();
					updatedVideoPath = `quests/${selectedQuestForEdit.id}.${ext}`;
					const vidRef = storageRef(storage, updatedVideoPath);
					await uploadBytes(vidRef, editQuestMediaFile);
					updatedVideoUrl = await getDownloadURL(vidRef);
					if (!updatedVideoUrl) throw new Error('Download URL is empty');
					// Clear image fields if a new video is uploaded.
					updatedImageUrl = '';
					updatedImagePath = '';
				} catch (error) {
					console.error('Error uploading new video:', error);
					setUploadError(
						'Saving video in Firebase Storage failed. Please try again.'
					);
					setIsUploading(false);
					return;
				}
			}
		} else if (shouldDeleteExistingMedia) {
			// Deletion requested without replacement.
			if (selectedQuestForEdit.imagePath && storage) {
				try {
					const oldImgRef = storageRef(storage, selectedQuestForEdit.imagePath);
					await deleteObject(oldImgRef);
					updatedImageUrl = '';
					updatedImagePath = '';
				} catch (error) {
					console.error('Error deleting image:', error);
					setUploadError(
						'Deleting the existing image in Firebase Storage failed.'
					);
					setIsUploading(false);
					return;
				}
			}
			if (selectedQuestForEdit.videoPath && storage) {
				try {
					const oldVidRef = storageRef(storage, selectedQuestForEdit.videoPath);
					await deleteObject(oldVidRef);
					updatedVideoUrl = '';
					updatedVideoPath = '';
				} catch (error) {
					console.error('Error deleting video:', error);
					setUploadError(
						'Deleting the existing video in Firebase Storage failed.'
					);
					setIsUploading(false);
					return;
				}
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
			videoUrl: updatedVideoUrl,
			videoPath: updatedVideoPath,
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
				videoUrl: quest.videoUrl || '',
				videoPath: quest.videoPath || '',
			});
		});
		await batch.commit();

		setSelectedQuestForEdit(null);
		setEditQuestName('');
		setEditQuestSequence('');
		setEditQuestHint('');
		setEditQuestText('');
		setEditQuestAnswer('');
		setEditQuestMediaFile(null);
		setEditQuestMediaPreview(null);
		setEditQuestMediaType(null);
		setShouldDeleteExistingMedia(false);
		setUploadError(null);
		setEditModalOpen(false);
		setIsUploading(false);
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
						<Link
							to="/admin/registrations"
							className="p-3 bg-gray-800 rounded-lg hover:bg-gray-700 text-white"
						>
							Registrations
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
			{/* Create Modal */}
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
								accept="image/png, image/jpeg, video/mp4, video/quicktime"
								onChange={handleNewQuestMediaChange}
							/>
							{newQuestMediaPreview && newQuestMediaType === 'image' && (
								<div>
									<img
										src={newQuestMediaPreview}
										alt="Preview"
										style={{ maxWidth: '200px' }}
										className="mt-2"
									/>
									<button
										onClick={() => {
											setNewQuestMediaFile(null);
											setNewQuestMediaPreview(null);
											setNewQuestMediaType(null);
										}}
										className="mt-2 px-2 py-1 bg-red-300 rounded"
									>
										Remove Image
									</button>
								</div>
							)}
							{newQuestMediaPreview && newQuestMediaType === 'video' && (
								<div>
									<video
										src={newQuestMediaPreview}
										style={{
											maxWidth: '200px',
											maxHeight: '200px',
											objectFit: 'contain',
										}}
										className="mt-2"
										controls={false}
									/>
									<button
										onClick={() => {
											setNewQuestMediaFile(null);
											setNewQuestMediaPreview(null);
											setNewQuestMediaType(null);
										}}
										className="mt-2 px-2 py-1 bg-red-300 rounded"
									>
										Remove Video
									</button>
								</div>
							)}
						</div>
						{uploadError && (
							<div className="mt-2 text-red-600">{uploadError}</div>
						)}
						{isUploading && (
							<div className="mt-2 text-blue-600">Uploading...</div>
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
			{/* Edit Modal */}
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
								accept="image/png, image/jpeg, video/mp4, video/quicktime"
								onChange={handleEditQuestMediaChange}
							/>
							{editQuestMediaPreview ? (
								<div>
									{editQuestMediaType === 'image' ? (
										<>
											<img
												src={editQuestMediaPreview}
												alt="Preview"
												style={{ maxWidth: '200px' }}
												className="mt-2"
											/>
											<button
												onClick={() => {
													setEditQuestMediaFile(null);
													setEditQuestMediaPreview(null);
													setEditQuestMediaType(null);
													setShouldDeleteExistingMedia(true);
												}}
												className="mt-2 px-2 py-1 bg-red-300 rounded"
											>
												Remove Image
											</button>
										</>
									) : (
										<>
											<video
												src={editQuestMediaPreview}
												style={{
													maxWidth: '200px',
													maxHeight: '200px',
													objectFit: 'contain',
												}}
												className="mt-2"
												controls={false}
											/>
											<button
												onClick={() => {
													setEditQuestMediaFile(null);
													setEditQuestMediaPreview(null);
													setEditQuestMediaType(null);
													setShouldDeleteExistingMedia(true);
												}}
												className="mt-2 px-2 py-1 bg-red-300 rounded"
											>
												Remove Video
											</button>
										</>
									)}
								</div>
							) : selectedQuestForEdit.imageUrl &&
							  !editQuestMediaPreview &&
							  editQuestMediaType === null ? (
								<div>
									<img
										src={selectedQuestForEdit.imageUrl}
										alt="Current"
										style={{ maxWidth: '200px' }}
										className="mt-2"
									/>
									<button
										onClick={() => {
											setShouldDeleteExistingMedia(true);
											setEditQuestMediaPreview(null);
											setEditQuestMediaType(null);
										}}
										className="mt-2 px-2 py-1 bg-red-300 rounded"
									>
										Remove Image
									</button>
								</div>
							) : selectedQuestForEdit.videoUrl &&
							  !editQuestMediaPreview &&
							  editQuestMediaType === null ? (
								<div>
									<video
										src={selectedQuestForEdit.videoUrl}
										alt="Current"
										style={{
											maxWidth: '200px',
											maxHeight: '200px',
											objectFit: 'contain',
										}}
										className="mt-2"
										controls
									/>
									<button
										onClick={() => {
											setShouldDeleteExistingMedia(true);
											setEditQuestMediaPreview(null);
											setEditQuestMediaType(null);
										}}
										className="mt-2 px-2 py-1 bg-red-300 rounded"
									>
										Remove Video
									</button>
								</div>
							) : null}
						</div>
						{uploadError && (
							<div className="mt-2 text-red-600">{uploadError}</div>
						)}
						{isUploading && (
							<div className="mt-2 text-blue-600">Uploading...</div>
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
			{/* Delete Modal */}
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
			{/* View Modal */}
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
						{selectedQuestForView.videoUrl && (
							<div className="mt-2">
								<video
									src={selectedQuestForView.videoUrl}
									alt="Quest Video"
									style={{
										maxWidth: '200px',
										maxHeight: '200px',
										objectFit: 'contain',
									}}
									controls
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
