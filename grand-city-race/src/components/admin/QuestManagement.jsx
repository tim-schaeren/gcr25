import React, { useEffect, useState, useRef } from 'react';
import { collection, onSnapshot, doc, writeBatch } from 'firebase/firestore';
import AdminSidebar from './AdminSidebar';
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
import {
	ref as storageRef,
	uploadBytes,
	getDownloadURL,
	deleteObject,
} from 'firebase/storage';

// ── Reusable component for picking a location on a Google Map ──
function MapPicker({ initialLocation, initialFence, onChange }) {
	const mapRef = useRef(null);
	const mapInstanceRef = useRef(null);
	const markerRef = useRef(null);
	const circleRef = useRef(null);

	useEffect(() => {
		if (!window.google) {
			console.error('Google Maps API not loaded');
			return;
		}

		// Use initial location or a default center
		const defaultCenter = initialLocation || { lat: 46.9481, lng: 7.4474 };

		// Initialize map
		mapInstanceRef.current = new google.maps.Map(mapRef.current, {
			center: defaultCenter,
			zoom: 14,
		});

		// Create a draggable marker
		markerRef.current = new google.maps.Marker({
			position: defaultCenter,
			map: mapInstanceRef.current,
			draggable: true,
		});

		// Create a circle overlay using the given fence radius
		circleRef.current = new google.maps.Circle({
			map: mapInstanceRef.current,
			center: defaultCenter,
			radius: initialFence || 20, // default to 20 meters if none provided
			fillColor: '#AA0000',
			fillOpacity: 0.2,
			strokeColor: '#AA0000',
			strokeOpacity: 0.7,
		});
		// Keep the circle centered on the marker
		circleRef.current.bindTo('center', markerRef.current, 'position');

		// Update parent state when the marker drag ends.
		markerRef.current.addListener('dragend', () => {
			const pos = markerRef.current.getPosition();
			const lat = pos.lat();
			const lng = pos.lng();
			if (onChange) {
				onChange({ lat, lng, fence: circleRef.current.getRadius() });
			}
		});
	}, []); // Initialize only once

	// When the fence (radius) value changes, update the circle.
	useEffect(() => {
		if (circleRef.current) {
			circleRef.current.setRadius(initialFence);
			// In case you want to propagate the new fence value:
			if (onChange && markerRef.current) {
				const pos = markerRef.current.getPosition();
				onChange({ lat: pos.lat(), lng: pos.lng(), fence: initialFence });
			}
		}
	}, [initialFence]);

	return <div ref={mapRef} style={{ height: '300px', width: '100%' }}></div>;
}

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
	// ── State for quest info ──
	const [newQuestName, setNewQuestName] = useState('');
	const [newQuestSequence, setNewQuestSequence] = useState('');
	const [newQuestHint, setNewQuestHint] = useState('');
	const [newQuestText, setNewQuestText] = useState('');
	const [newQuestAnswers, setNewQuestAnswers] = useState(['']);
	const [newQuestClue, setNewQuestClue] = useState('');
	// New state for location and fence in the add modal.
	const [newQuestLocation, setNewQuestLocation] = useState({
		lat: 46.9481,
		lng: 7.4474,
	});
	const [newQuestFence, setNewQuestFence] = useState(20);
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
	const [editQuestAnswers, setEditQuestAnswers] = useState([]);
	const [editQuestClue, setEditQuestClue] = useState('');
	// New state for location/fence in the edit modal.
	const [editQuestLocation, setEditQuestLocation] = useState({
		lat: 46.9481,
		lng: 7.4474,
	});
	const [editQuestFence, setEditQuestFence] = useState(20);
	// Combined media state for editing
	const [editQuestMediaFile, setEditQuestMediaFile] = useState(null);
	const [editQuestMediaPreview, setEditQuestMediaPreview] = useState(null);
	const [editQuestMediaType, setEditQuestMediaType] = useState(null); // "image" or "video"
	const [shouldDeleteExistingMedia, setShouldDeleteExistingMedia] =
		useState(false);

	// View Details modal state.
	const [isViewModalOpen, setViewModalOpen] = useState(false);
	const [selectedQuestForView, setSelectedQuestForView] = useState(null);

	// Upload error and loading states.
	const [uploadError, setUploadError] = useState(null);
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

	// ── Media File Input Handlers (unchanged) ──
	const handleNewQuestMediaChange = (e) => {
		// ... existing media handling code remains here ...
		const file = e.target.files[0];
		if (file) {
			if (file.type.startsWith('image/')) {
				const maxSize = 5 * 1024 * 1024;
				if (file.size > maxSize) {
					alert('Image file size should be less than 5MB');
					return;
				}
				setNewQuestMediaFile(file);
				setNewQuestMediaPreview(URL.createObjectURL(file));
				setNewQuestMediaType('image');
			} else if (file.type.startsWith('video/')) {
				if (!(file.type === 'video/mp4' || file.type === 'video/quicktime')) {
					alert('Only MP4 and MOV videos are allowed');
					return;
				}
				const maxSize = 20 * 1024 * 1024;
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
		// ... existing media handling code remains here ...
		const file = e.target.files[0];
		if (file) {
			if (file.type.startsWith('image/')) {
				const maxSize = 5 * 1024 * 1024;
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
				const maxSize = 200 * 1024 * 1024;
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
		setEditQuestAnswers(
			Array.isArray(quest.answer)
				? quest.answer
				: quest.answer
				? [quest.answer]
				: ['']
		);
		setEditQuestClue(quest.clue || '');
		// Prepopulate media info as before…
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
		// ── NEW: Prepopulate location and fence if available ──
		if (quest.location) {
			setEditQuestLocation({
				lat: quest.location.lat,
				lng: quest.location.lng,
			});
			setEditQuestFence(quest.location.fence);
		} else {
			setEditQuestLocation({ lat: 46.9481, lng: 7.4474 });
			setEditQuestFence(20);
		}
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

		// Set the new values
		batch.set(newQuestRef, {
			name: newQuestName,
			sequence: newSeq,
			hint: newQuestHint,
			text: newQuestText,
			answer: newQuestAnswers,
			clue: newQuestClue,
			imageUrl: newQuestMediaType === 'image' ? imageUrl : '',
			imagePath: newQuestMediaType === 'image' ? imagePath : '',
			videoUrl: newQuestMediaType === 'video' ? videoUrl : '',
			videoPath: newQuestMediaType === 'video' ? videoPath : '',
			location: {
				lat: newQuestLocation.lat,
				lng: newQuestLocation.lng,
				fence: newQuestFence,
			},
		});

		await batch.commit();

		// Reset states for quest creation.
		setNewQuestName('');
		setNewQuestSequence('');
		setNewQuestHint('');
		setNewQuestText('');
		setNewQuestAnswers(['']);
		setNewQuestClue('');
		setNewQuestMediaFile(null);
		setNewQuestMediaPreview(null);
		setNewQuestMediaType(null);
		// Optionally reset location to the default
		setNewQuestLocation({ lat: 46.9481, lng: 7.4474 });
		setNewQuestFence(20);
		setUploadError(null);
		setCreateModalOpen(false);
		setIsUploading(false);
	};

	// Delete quests
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

	// Update quests
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

		// Update quest data
		const updatedQuest = {
			...selectedQuestForEdit,
			name: editQuestName,
			hint: editQuestHint,
			text: editQuestText,
			answer: editQuestAnswers,
			clue: editQuestClue,
			sequence: clampedSeq,
			imageUrl: updatedImageUrl,
			imagePath: updatedImagePath,
			videoUrl: updatedVideoUrl,
			videoPath: updatedVideoPath,
			location: {
				lat: editQuestLocation.lat,
				lng: editQuestLocation.lng,
				fence: editQuestFence,
			},
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
				name: quest.name ?? '',
				sequence: quest.sequence,
				hint: quest.hint ?? '',
				text: quest.text ?? '',
				answer: quest.answer ?? [],
				clue: quest.clue || '',
				imageUrl: quest.imageUrl || '',
				imagePath: quest.imagePath || '',
				videoUrl: quest.videoUrl || '',
				videoPath: quest.videoPath || '',
				location: quest.location || {},
			});
		});
		await batch.commit();

		// Reset edit state.
		setSelectedQuestForEdit(null);
		setEditQuestName('');
		setEditQuestSequence('');
		setEditQuestHint('');
		setEditQuestText('');
		setEditQuestAnswers('');
		setEditQuestClue('');
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
			{/* Mobile access message */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar */}
				<AdminSidebar db={db} />
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
					</div>
				</div>
			</div>
			{/* Create Modal */}
			{isCreateModalOpen && (
				<div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
					<div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
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
							placeholder="Question or Riddle"
							value={newQuestText}
							onChange={(e) => setNewQuestText(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Clue to help the player"
							value={newQuestClue}
							onChange={(e) => setNewQuestClue(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<label>Answers</label>
						{newQuestAnswers.map((ans, idx) => (
							<div key={idx} className="flex mb-2">
								<input
									type="text"
									placeholder={`Answer ${idx + 1}`}
									value={ans}
									onChange={(e) => {
										const arr = [...newQuestAnswers];
										arr[idx] = e.target.value;
										setNewQuestAnswers(arr);
									}}
								/>
								{newQuestAnswers.length > 1 && (
									<button
										onClick={() => {
											setNewQuestAnswers(
												newQuestAnswers.filter((_, i) => i !== idx)
											);
										}}
									>
										Remove
									</button>
								)}
							</div>
						))}
						<button
							onClick={() => setNewQuestAnswers([...newQuestAnswers, ''])}
						>
							Add Answer
						</button>
						{/* ── New location picker section ── */}
						<div className="mb-4">
							<label className="block font-semibold mb-2">
								Pick Quest Location
							</label>
							<MapPicker
								initialLocation={newQuestLocation}
								initialFence={newQuestFence}
								onChange={(data) => {
									setNewQuestLocation({ lat: data.lat, lng: data.lng });
									setNewQuestFence(data.fence);
								}}
							/>
						</div>
						<input
							type="number"
							placeholder="Fence (in meters)"
							value={newQuestFence}
							onChange={(e) => setNewQuestFence(parseInt(e.target.value, 10))}
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
					<div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full max-h-[80vh] overflow-y-auto">
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
							placeholder="Question or riddle"
							value={editQuestText}
							onChange={(e) => setEditQuestText(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<input
							type="text"
							placeholder="Clue to help the player"
							value={editQuestClue}
							onChange={(e) => setEditQuestClue(e.target.value)}
							className="w-full p-2 border rounded-md mb-4"
						/>
						<label>Answers</label>
						{editQuestAnswers.map((ans, idx) => (
							<div key={idx} className="flex mb-2">
								<input
									type="text"
									placeholder={`Answer ${idx + 1}`}
									value={ans}
									onChange={(e) => {
										const arr = [...editQuestAnswers];
										arr[idx] = e.target.value;
										setEditQuestAnswers(arr);
									}}
								/>
								{editQuestAnswers.length > 1 && (
									<button
										onClick={() => {
											setEditQuestAnswers(
												editQuestAnswers.filter((_, i) => i !== idx)
											);
										}}
									>
										Remove
									</button>
								)}
							</div>
						))}
						<button
							onClick={() => setEditQuestAnswers([...editQuestAnswers, ''])}
						>
							Add Answer
						</button>
						{/* ── New location picker in edit modal ── */}
						<div className="mb-4">
							<label className="block font-semibold mb-2">
								Pick Quest Location
							</label>
							<MapPicker
								initialLocation={editQuestLocation}
								initialFence={editQuestFence}
								onChange={(data) => {
									setEditQuestLocation({ lat: data.lat, lng: data.lng });
									setEditQuestFence(data.fence);
								}}
							/>
						</div>
						<input
							type="number"
							placeholder="Fence (in meters)"
							value={editQuestFence}
							onChange={(e) => setEditQuestFence(parseInt(e.target.value, 10))}
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
							<strong>Clue:</strong> {selectedQuestForView.clue}
						</p>
						<p>
							<strong>Answers:</strong>
						</p>
						<ul>
							{selectedQuestForView.answer.map((ans, i) => (
								<li key={i}>{ans}</li>
							))}
						</ul>
						{/* Optionally display location info */}
						{selectedQuestForView.location && (
							<p>
								<strong>Location:</strong>{' '}
								{selectedQuestForView.location.lat.toFixed(5)},{' '}
								{selectedQuestForView.location.lng.toFixed(5)} (Fence:{' '}
								{selectedQuestForView.location.fence} m)
							</p>
						)}
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
