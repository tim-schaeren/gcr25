import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
	collection,
	getDocs,
	onSnapshot,
	query,
	orderBy,
} from 'firebase/firestore';
import AdminSidebar from './AdminSidebar';

function AdminDashboard({ db }) {
	const [users, setUsers] = useState([]);
	const [teams, setTeams] = useState([]);
	const [quests, setQuests] = useState([]);
	const [members, setMembers] = useState([]);
	const [itemsMap, setItemsMap] = useState({});
	const [map, setMap] = useState(null);
	const [isTabActive, setIsTabActive] = useState(true);

	// Refs to store AdvancedMarkerElement markers and polyline trails by user ID.
	const markersByUser = useRef({});
	const trailsByUser = useRef({});

	// Listen for visibility change to pause/resume fetching user locations.
	useEffect(() => {
		const handleVisibilityChange = () => {
			setIsTabActive(!document.hidden);
		};
		document.addEventListener('visibilitychange', handleVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
		};
	}, []);

	// Fetch user locations (from main user documents) every 30 seconds.
	useEffect(() => {
		const fetchUserLocations = async () => {
			if (!isTabActive) {
				console.log('inactive, not fetching user location');
				return;
			}
			console.log('active, fetching user location');
			const usersRef = collection(db, 'users');
			const usersSnap = await getDocs(usersRef);
			const userList = usersSnap.docs
				.map((doc) => ({ id: doc.id, ...doc.data() }))
				.filter((user) => user.location && !user.isAdmin); // Exclude admins and users without location
			setUsers(userList);
		};

		fetchUserLocations();
		const interval = setInterval(fetchUserLocations, 30000);
		return () => clearInterval(interval);
	}, [db, isTabActive]);

	// Real‑time teams updates.
	useEffect(() => {
		const teamsRef = collection(db, 'teams');
		const unsubscribe = onSnapshot(teamsRef, (snapshot) => {
			const teamList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
				solvedQuests: doc.data().progress?.previousQuests?.length || 0,
			}));
			teamList.sort((a, b) => b.solvedQuests - a.solvedQuests);
			setTeams(teamList);
		});
		return () => unsubscribe();
	}, [db]);

	// Real‑time quest updates.
	useEffect(() => {
		const questRef = collection(db, 'quests');
		const unsubscribe = onSnapshot(questRef, (snapshot) => {
			const questList = snapshot.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
				name: doc.data().name || ' ',
			}));
			setQuests(questList);
		});
		return () => unsubscribe();
	}, [db]);

	// build a fast lookup from questID → questName
	const questMap = useMemo(() => {
		return quests.reduce((m, q) => {
			m[q.id] = q.name;
			return m;
		}, {});
	}, [quests]);

	// decide what to show in the "Current Quest" column
	function getQuestDisplay(team) {
		const curr = team.progress?.currentQuest;
		if (curr) {
			return questMap[curr] || 'Unknown Quest';
		}
		const solved = team.progress?.previousQuests || [];
		const maxSeq = solved.reduce((max, id) => {
			const seq = quests.find((q) => q.id === id)?.sequence || 0;
			return Math.max(max, seq);
		}, 0);
		const nextQuest = quests.find((q) => q.sequence === maxSeq + 1);
		return nextQuest ? `Looking for ${nextQuest.name}` : 'No further quests';
	}

	// Initialize the map.
	useEffect(() => {
		window.initMap = () => {
			if (!document.getElementById('map')) return;
			const newMap = new google.maps.Map(document.getElementById('map'), {
				center: { lat: 46.9481, lng: 7.4474 },
				zoom: 14,
				mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID,
			});
			setMap(newMap);
		};

		if (!window.google || !window.google.maps) {
			const scriptId = 'google-maps-script';
			if (!document.getElementById(scriptId)) {
				const script = document.createElement('script');
				script.id = scriptId;
				script.src = `https://maps.googleapis.com/maps/api/js?key=${
					import.meta.env.VITE_GOOGLE_MAPS_API_KEY
				}&callback=initMap&libraries=places,marker&loading=async`;
				script.async = true;
				script.defer = true;
				document.body.appendChild(script);
			}
		} else {
			window.initMap();
		}
	}, []);

	// ---------- Markers for Current User Locations (unchanged) ----------
	useEffect(() => {
		if (!map) return;

		users.forEach((user) => {
			const pos = new google.maps.LatLng(user.location.lat, user.location.lng);

			// default fallback team
			let userTeam = 'no team';
			if (user.teamId && teams.length > 0) {
				userTeam = teams.find((team) => team.id === user.teamId);
			}

			let markerColor = 'white';
			if (userTeam && userTeam.color && userTeam.color.hex) {
				markerColor = userTeam.color.hex;
			}

			const lastUpdated = user.lastUpdated
				? new Date(user.lastUpdated.seconds * 1000)
				: null;
			const timeDiffSec = lastUpdated
				? Math.round((Date.now() - lastUpdated.getTime()) / 1000)
				: null;
			const infoText =
				timeDiffSec !== null
					? `Last updated: ${timeDiffSec} sec ago`
					: 'Unknown time';

			if (timeDiffSec == null || timeDiffSec > 30) {
				markerColor = 'gray';
			}

			if (markersByUser.current[user.id]) {
				markersByUser.current[user.id].position = pos;
				markersByUser.current[user.id].content.style.backgroundColor =
					markerColor;
				markersByUser.current[user.id].lastUpdated = lastUpdated;
			} else {
				const markerDiv = document.createElement('div');
				markerDiv.style.width = '16px';
				markerDiv.style.height = '16px';
				markerDiv.style.borderRadius = '50%';
				markerDiv.style.backgroundColor = markerColor;
				markerDiv.style.border = '1px solid black';

				const advMarker = new google.maps.marker.AdvancedMarkerElement({
					position: pos,
					map: map,
					title: (user.name || user.email) + ' - ' + userTeam.name,
					content: markerDiv,
					// By not setting a low zIndex here, these user markers will naturally be above our quest overlays.
				});

				const infoWindow = new google.maps.InfoWindow({
					content: `<div class='text-black font-bold'>${
						(user.name || user.email) + ' - ' + userTeam.name
					}</div><div class='text-gray-700'>${infoText}</div>`,
				});

				advMarker.addListener('click', () => {
					infoWindow.open({ anchor: advMarker, map });
				});

				advMarker.infoWindow = infoWindow;
				advMarker.lastUpdated = lastUpdated;
				advMarker.title = (user.name || user.email) + ' - ' + userTeam.name;

				markersByUser.current[user.id] = advMarker;
			}
		});

		const interval = setInterval(() => {
			Object.values(markersByUser.current).forEach((marker) => {
				if (marker.infoWindow && marker.infoWindow.getMap()) {
					const now = Date.now();
					const lastUpdated = marker.lastUpdated;
					if (lastUpdated) {
						const timeDiffSec = Math.round(
							(now - lastUpdated.getTime()) / 1000
						);
						const newInfoText = `Last updated: ${timeDiffSec} sec ago`;
						marker.infoWindow.setContent(
							`<div class='text-black font-bold'>${marker.title}</div>` +
								`<div class='text-gray-700'>${newInfoText}</div>`
						);
					}
				}
			});
		}, 1000);
		return () => clearInterval(interval);
	}, [map, users, teams]);

	// ---------- Polyline Trails from Complete Firestore History (unchanged) ----------
	useEffect(() => {
		if (!map || !db) return;

		users.forEach((user) => {
			const historyRef = collection(db, 'users', user.id, 'locationHistory');
			const q = query(historyRef, orderBy('timestamp', 'asc'));
			getDocs(q)
				.then((snapshot) => {
					const path = snapshot.docs.map((doc) => {
						const data = doc.data();
						return new google.maps.LatLng(data.lat, data.lng);
					});
					if (path.length > 0) {
						let trailColor = 'white';
						if (user.teamId && teams.length > 0) {
							const userTeam = teams.find((team) => team.id === user.teamId);
							if (userTeam && userTeam.color && userTeam.color.hex) {
								trailColor = userTeam.color.hex;
							}
						}
						if (trailsByUser.current[user.id]) {
							trailsByUser.current[user.id].setPath(path);
							trailsByUser.current[user.id].setOptions({
								strokeColor: trailColor,
							});
						} else {
							const polyline = new google.maps.Polyline({
								path: path,
								geodesic: true,
								strokeColor: trailColor,
								strokeOpacity: 1.0,
								strokeWeight: 2,
							});
							polyline.setMap(map);
							trailsByUser.current[user.id] = polyline;
						}
					}
				})
				.catch((error) =>
					console.error(
						'Error fetching location history for user',
						user.id,
						error
					)
				);
		});
	}, [map, users, db, teams]);

	// ---------- QUESTS OVERLAY: Quest Markers & Fence Circles ----------
	// Fetch quests once on page-load (no real‑time updates) and add a marker and a circle for each.
	// ---------- QUESTS OVERLAY: Quest Markers & Fence Circles ----------
	useEffect(() => {
		if (!map || !db) return;
		const fetchQuests = async () => {
			const questsRef = collection(db, 'quests');
			const questsSnap = await getDocs(questsRef);
			const questsData = questsSnap.docs.map((doc) => ({
				id: doc.id,
				...doc.data(),
			}));

			questsData.forEach((quest) => {
				// Only process quests with a valid location.
				if (
					quest.location &&
					quest.location.lat &&
					quest.location.lng &&
					quest.location.fence
				) {
					const pos = new google.maps.LatLng(
						quest.location.lat,
						quest.location.lng
					);

					// Create a custom marker element that displays the quest sequence.
					const markerDiv = document.createElement('div');
					markerDiv.style.width = '30px';
					markerDiv.style.height = '30px';
					// Remove borderRadius to make it square instead of circular.
					// markerDiv.style.borderRadius = '50%';
					markerDiv.style.backgroundColor = 'rgba(128,128,128,0.5)'; // grey with opacity
					markerDiv.style.display = 'flex';
					markerDiv.style.alignItems = 'center';
					markerDiv.style.justifyContent = 'center';
					markerDiv.style.fontSize = '16px';
					markerDiv.style.fontWeight = 'bold';
					markerDiv.style.color = 'black';
					markerDiv.innerText = quest.sequence.toString();

					// Create an AdvancedMarkerElement for the quest.
					const questMarker = new google.maps.marker.AdvancedMarkerElement({
						position: pos,
						map: map,
						title: `Quest: ${quest.name}`,
						content: markerDiv,
						zIndex: 50, // Lower z-index to allow user markers to appear on top
					});

					// Create an info window that shows quest details (name, question, and fence).
					const questInfoWindow = new google.maps.InfoWindow({
						content: `<div style="opacity: 0.9">
								<strong>${quest.name}</strong><br/>
								${quest.text}<br/>
								Fence: ${quest.location.fence} m
							  </div>`,
					});
					questMarker.addListener('click', () => {
						questInfoWindow.open({ anchor: questMarker, map });
					});

					// Draw the fence circle around the quest location with grey styling.
					const questCircle = new google.maps.Circle({
						map: map,
						center: pos,
						radius: quest.location.fence,
						fillColor: 'gray',
						fillOpacity: 0.2,
						strokeColor: 'gray',
						strokeOpacity: 0.7,
						strokeWeight: 1,
						zIndex: 40, // Ensure the circle is below the marker
					});
				}
			});
		};

		fetchQuests();
	}, [map, db]);

	//  ── Items lookup ──
	useEffect(() => {
		const itemsRef = collection(db, 'items');
		const unsubscribe = onSnapshot(itemsRef, (snap) => {
			const map = {};
			snap.docs.forEach((doc) => {
				map[doc.id] = doc.data().name || 'Unnamed Item';
			});
			setItemsMap(map);
		});
		return () => unsubscribe();
	}, [db]);

	//  ── All users (to group by teamId) ──
	useEffect(() => {
		const usersRef = collection(db, 'users');
		const unsubscribe = onSnapshot(usersRef, (snap) => {
			const all = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
			setMembers(all);
		});
		return () => unsubscribe();
	}, [db]);

	// teamId → "2×Lantern, 1×Compass"
	const teamInventory = useMemo(() => {
		const tally = {};
		// init empty buckets
		teams.forEach((t) => {
			tally[t.id] = {};
		});

		members.forEach((u) => {
			const inv = u.inventory || {};
			if (!u.teamId || !tally[u.teamId]) return;
			Object.entries(inv).forEach(([itemId, has]) => {
				if (has) {
					tally[u.teamId][itemId] = (tally[u.teamId][itemId] || 0) + 1;
				}
			});
		});

		// stringify
		const summary = {};
		Object.entries(tally).forEach(([teamId, items]) => {
			const parts = Object.entries(items).map(([itemId, count]) => {
				const name = itemsMap[itemId] || 'Unknown';
				return `${count}×${name}`;
			});
			summary[teamId] = parts.join(', ');
		});
		return summary;
	}, [teams, members, itemsMap]);

	// compute "in effect" items per team
	const teamActiveItems = useMemo(() => {
		const now = Date.now();
		// build a fresh map: teamId → { itemId: count }
		const activeMap = {};
		teams.forEach((t) => {
			activeMap[t.id] = {};
		});

		members.forEach((u) => {
			const a = u.activeItem;
			if (!u.teamId || !activeMap[u.teamId] || !a?.id) return;
			// convert Firestore Timestamp or Date/string to ms
			let expMs = a.expiresAt?.toMillis
				? a.expiresAt.toMillis()
				: a.expiresAt instanceof Date
				? a.expiresAt.getTime()
				: new Date(a.expiresAt).getTime();
			if (expMs > now) {
				activeMap[u.teamId][a.id] = (activeMap[u.teamId][a.id] || 0) + 1;
			}
		});

		// stringify into "Name" or "2×Name"
		const summary = {};
		Object.entries(activeMap).forEach(([teamId, items]) => {
			const parts = Object.entries(items).map(([itemId, count]) => {
				const name = itemsMap[itemId] || 'Unknown';
				return count > 1 ? `${count}×${name}` : name;
			});
			summary[teamId] = parts.join(', ');
		});
		return summary;
	}, [teams, members, itemsMap]);

	// compute each team’s “state”: cursed, immune, or none
	const teamState = useMemo(() => {
		const now = Date.now();
		// map teamId → state string
		const map = {};
		teams.forEach((t) => {
			const cursedMs = t.cursedUntil?.toMillis
				? t.cursedUntil.toMillis()
				: t.cursedUntil instanceof Date
				? t.cursedUntil.getTime()
				: new Date(t.cursedUntil).getTime();
			const immuneMs = t.immuneUntil?.toMillis
				? t.immuneUntil.toMillis()
				: t.immuneUntil instanceof Date
				? t.immuneUntil.getTime()
				: new Date(t.immuneUntil).getTime();

			if (cursedMs > now) {
				// find the name of the team that cursed them
				const by = teams.find((team2) => team2.id === t.cursedBy);
				map[t.id] = by ? `cursed by ${by.name}` : 'cursed';
			} else if (immuneMs > now) {
				map[t.id] = 'immune';
			} else {
				map[t.id] = 'none';
			}
		});
		return map;
	}, [teams]);

	return (
		<div className="min-h-screen h-screen min-w-screen w-screen bg-gray-100 py-20 px-4">
			{/* Prevent Mobile Access */}
			<div className="sm:hidden flex justify-center items-center min-h-screen text-center">
				<p className="text-2xl font-bold text-gray-600">
					🚫 Admin Dashboard is only accessible on a larger screen.
				</p>
			</div>

			{/* Actual Dashboard (Only shown on bigger screens) */}
			<div className="hidden sm:flex w-full max-w-screen mx-auto">
				{/* Sidebar */}
				<AdminSidebar db={db} />
				{/* Main Content */}
				<div className="flex-1">
					{/* Leaderboard */}
					<div className="bg-white shadow-lg rounded-lg p-6 mb-8">
						<h2 className="text-2xl font-semibold text-gray-700 mb-4">
							📊 Leaderboard
						</h2>
						<table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
							<thead className="bg-gray-300 text-gray-700">
								<tr>
									<th className="border border-gray-300 p-4 text-black">
										Team
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Name
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Current Quest
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Solved Quests
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Bank
									</th>
									<th className="border border-gray-300 p-4 text-black">
										Inventory
									</th>
									<th className="border border-gray-300 p-4 text-black">
										In Effect
									</th>
									<th className="border border-gray-300 p-4 text-black">
										State
									</th>
								</tr>
							</thead>
							<tbody>
								{teams.map((team) => (
									<tr
										key={team.id}
										className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
									>
										<td className="border border-gray-300 p-4">
											<div
												className="w-4 h-4 inline-block rounded"
												style={{ backgroundColor: team.color.hex }}
												title={team.color.name}
											></div>
										</td>
										<td className="border border-gray-300 p-4 text-black font-semibold">
											{team.name}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{getQuestDisplay(team)}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{team.solvedQuests}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{team.currency || 'Broke'}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{teamInventory[team.id] || '—'}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{teamActiveItems[team.id] || '—'}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{teamState[team.id]}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					{/* Expanding Full‑Width Map */}
					<div className="mt-8">
						<div
							id="map"
							className="h-[800px] w-full border border-gray-300 shadow-xl rounded-lg"
						></div>
					</div>
				</div>
			</div>
		</div>
	);
}

export default AdminDashboard;
