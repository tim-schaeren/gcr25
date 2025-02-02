import React, { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";

function AdminDashboard({ db }) {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [map, setMap] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [isTabActive, setIsTabActive] = useState(true);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabActive(!document.hidden);
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    const fetchUserLocations = async () => {
      if (!isTabActive) return;
      const usersRef = collection(db, "users");
      const usersSnap = await getDocs(usersRef);
      const userList = usersSnap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(user => user.location);
      setUsers(userList);
    };

    const fetchTeams = async () => {
      const teamsRef = collection(db, "teams");
      const teamsSnap = await getDocs(teamsRef);
      const teamList = teamsSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        solvedQuests: doc.data().progress?.previousQuests?.length || 0
      }));

      teamList.sort((a, b) => b.solvedQuests - a.solvedQuests);
      setTeams(teamList);
    };

    fetchUserLocations();
    fetchTeams();

    const interval = setInterval(fetchUserLocations, 60000);
    return () => clearInterval(interval);
  }, [db, isTabActive]);

  useEffect(() => {
    window.initMap = () => {
      if (!document.getElementById("map")) return;
      const newMap = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 46.9481, lng: 7.4474 },
        zoom: 14,
        mapId: import.meta.env.VITE_GOOGLE_MAPS_MAP_ID
      });
      setMap(newMap);
    };

    if (!window.google || !window.google.maps) {
      const scriptId = "google-maps-script";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=places,marker&loading=async`;
        script.async = true;
        script.defer = true;
        document.body.appendChild(script);
      }
    } else {
      window.initMap();
    }
  }, []);

  useEffect(() => {
    if (map && users.length > 0) {
      markers.forEach(marker => marker.setMap(null));
      users.forEach(user => {
        const lastUpdated = user.lastUpdated ? new Date(user.lastUpdated.seconds * 1000) : null;
        const timeDiff = lastUpdated ? Math.round((Date.now() - lastUpdated.getTime()) / 60000) : null;
        const infoText = timeDiff !== null ? `Last updated: ${timeDiff} min ago` : "Unknown time";
        const markerColor = timeDiff !== null && timeDiff > 5 ? "grey" : "red";

        const pin = new google.maps.marker.PinElement({
          background: markerColor,
          borderColor: "black",
          glyphColor: "white",
          scale: 1.2,
        });

        const marker = new google.maps.marker.AdvancedMarkerElement({
          position: user.location,
          map: map,
          title: user.name || user.email,
          content: pin.element,
        });

        const infoWindow = new google.maps.InfoWindow({
          content: `<div class='text-black font-bold'>${user.name || user.email}</div><div class='text-gray-700'>${infoText}</div>`
        });

        marker.addListener("click", () => {
          infoWindow.open({ anchor: marker, map });
        });

        markers.push(marker);
      });
    }
  }, [map, users]);

  return (
    <div className="min-h-screen bg-gray-100 flex justify-center py-10 md:py-16 px-4 md:px-16 xl:px-24">
      {/* Prevent Mobile Access */}
      <div className="sm:hidden flex justify-center items-center min-h-screen text-center">
        <p className="text-2xl font-bold text-gray-600">
          🚫 Admin Dashboard is only accessible on a larger screen.
        </p>
      </div>
  
      {/* Actual Dashboard (Only shown on bigger screens) */}
      <div className="hidden sm:grid w-full max-w-[1600px] grid-cols-3 gap-8">
        
        {/* Sidebar (Leaderboard & Features) */}
        <div className="flex flex-col gap-6 col-span-1">
          {/* Leaderboard */}
          <div className="bg-white shadow-lg rounded-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-700 mb-4">📊 Leaderboard</h2>
            <table className="w-full text-center border border-gray-300 rounded-lg overflow-hidden">
              <thead className="bg-gray-300 text-gray-700">
                <tr>
                  <th className="border border-gray-300 p-4 text-black">Team</th>
                  <th className="border border-gray-300 p-4 text-black">Current Quest</th>
                  <th className="border border-gray-300 p-4 text-black">Solved Quests</th>
                </tr>
              </thead>
              <tbody>
                {teams.map(team => (
                  <tr key={team.id} className="odd:bg-white even:bg-gray-100 hover:bg-gray-200">
                    <td className="border border-gray-300 p-4 text-black font-semibold">{team.name}</td>
                    <td className="border border-gray-300 p-4 text-black">{team.progress?.currentQuest || "Not started"}</td>
                    <td className="border border-gray-300 p-4 text-black">{team.solvedQuests}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
  
          {/* Future Features */}
          <div className="bg-white shadow-lg rounded-lg p-10 flex flex-col justify-center items-center">
            <h2 className="text-2xl font-semibold text-gray-700">🚀 Future Features</h2>
            <p className="text-gray-500 text-lg">This space can be used for admin controls, logs, or real-time updates.</p>
          </div>
        </div>
  
        {/* Main Content Section (Expands to fill the rest) */}
        <div className="col-span-2 bg-white shadow-lg rounded-lg p-6 flex justify-center items-center">
          <h2 className="text-2xl font-semibold text-gray-700">📍 User Locations</h2>
        </div>
  
        {/* Expanding Full-Width Map */}
        <div className="col-span-3 mt-8">
          <div id="map" className="h-[600px] w-full border border-gray-300 shadow-xl rounded-lg"></div>
        </div>
      </div>
    </div>
  );
  
  
  
  
}

export default AdminDashboard;
