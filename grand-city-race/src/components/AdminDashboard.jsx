import React, { useEffect, useState, useRef } from 'react';
import {
	collection,
	getDocs,
	onSnapshot,
	query,
	orderBy,
} from 'firebase/firestore';
import { Link } from 'react-router-dom';

function AdminDashboard({ db }) {
	const [users, setUsers] = useState([]);
	const [teams, setTeams] = useState([]);
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

	// Use Firestore's onSnapshot for real‑time teams updates on teams.
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

	// ---------- Markers for Current Locations ----------
	// Dependency includes teams so we can lookup team color.
	useEffect(() => {
		if (!map) return;

		users.forEach((user) => {
			const pos = new google.maps.LatLng(user.location.lat, user.location.lng);

			// default fallback team
			let userTeam = 'no team';

			// find team of user
			if (user.teamId && teams.length > 0) {
				userTeam = teams.find((team) => team.id === user.teamId);
			}

			// Determine the marker color based on the user's team.
			let markerColor = 'white'; // default fallback

			if (userTeam && userTeam.color && userTeam.color.hex) {
				markerColor = userTeam.color.hex;
			}

			// Calculate age of location in seconds based on lastUpdated timestamp.
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

			// if the location is older than 30 seconds, paint the marker gray.
			if (timeDiffSec == null || timeDiffSec > 30) {
				markerColor = 'gray';
			}

			// ----- AdvancedMarkerElement for Current Location -----
			if (markersByUser.current[user.id]) {
				// Update the marker's position and icon.
				markersByUser.current[user.id].position = pos;
				markersByUser.current[user.id].content.style.backgroundColor =
					markerColor;
				markersByUser.current[user.id].lastUpdated = lastUpdated;
			} else {
				// Create a custom HTML element to use as marker content.
				const markerDiv = document.createElement('div');
				markerDiv.style.width = '16px';
				markerDiv.style.height = '16px';
				markerDiv.style.borderRadius = '50%';
				markerDiv.style.backgroundColor = markerColor;
				markerDiv.style.border = '1px solid black';

				// Create the AdvancedMarkerElement.
				const advMarker = new google.maps.marker.AdvancedMarkerElement({
					position: pos,
					map: map,
					title: (user.name || user.email) + ' - ' + userTeam.name,
					content: markerDiv,
				});

				// Create an info window for this marker.
				const infoWindow = new google.maps.InfoWindow({
					content: `<div class='text-black font-bold'>${
						(user.name || user.email) + ' - ' + userTeam.name
					}</div><div class='text-gray-700'>${infoText}</div>`,
				});

				advMarker.addListener('click', () => {
					infoWindow.open({ anchor: advMarker, map });
				});

				// Store extra data on the marker for later updates.
				advMarker.infoWindow = infoWindow;
				advMarker.lastUpdated = lastUpdated;
				advMarker.title = (user.name || user.email) + ' - ' + userTeam.name;

				markersByUser.current[user.id] = advMarker;
			}
		});

		// Update open info windows every second so the "last updated" text is current.
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

	// ---------- Polyline Trails from Complete Firestore History ----------
	// For each user, fetch the full locationHistory subcollection and draw the complete trail.
	// Dependency includes teams so we can use the same color as the marker.
	useEffect(() => {
		if (!map || !db) return;

		users.forEach((user) => {
			const historyRef = collection(db, 'users', user.id, 'locationHistory');
			// Query the complete history ordered by timestamp ascending.
			const q = query(historyRef, orderBy('timestamp', 'asc'));
			getDocs(q)
				.then((snapshot) => {
					const path = snapshot.docs.map((doc) => {
						const data = doc.data();
						return new google.maps.LatLng(data.lat, data.lng);
					});
					if (path.length > 0) {
						// Determine the trail color from the user's team.
						let trailColor = 'white'; // fallback
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
								strokeColor: trailColor, // Use the hex value directly.
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
				<aside className="w-64 bg-white shadow-lg rounded-lg p-6 mr-8">
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
								</tr>
							</thead>
							<tbody>
								{teams.map((team) => (
									<tr
										key={team.id}
										className="odd:bg-white even:bg-gray-100 hover:bg-gray-200"
									>
										{/* Color swatch cell */}
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
											{team.progress?.currentQuest || 'Not started'}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{team.solvedQuests}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											{team.currency || 'Broke'}
										</td>
										<td className="border border-gray-300 p-4 text-black">
											item so and so
										</td>
										<td className="border border-gray-300 p-4 text-black">
											item so and so
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
