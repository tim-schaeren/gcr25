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
      if (!isTabActive) return; // Only fetch if the tab is active
      const usersRef = collection(db, "users");
      const usersSnap = await getDocs(usersRef);
      const userList = usersSnap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })).filter(user => user.location); // Only include users with location data

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
    
    const interval = setInterval(fetchUserLocations, 60000); // Update locations every 60 seconds if tab is active
    return () => clearInterval(interval); // Cleanup on unmount
  }, [db, isTabActive]);

  useEffect(() => {
    window.initMap = () => {
      if (!document.getElementById("map")) return;
      const newMap = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 46.9481, lng: 7.4474 }, // Default: Bern
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
        script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&callback=initMap&libraries=marker&loading=async`;
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
      if (google.maps.marker && google.maps.marker.AdvancedMarkerElement) {
        const { AdvancedMarkerElement } = google.maps.marker;
        const newMarkers = users.map(user => {
          return new AdvancedMarkerElement({
            position: user.location,
            map: map,
            title: user.email
          });
        });
        setMarkers(newMarkers);
      } else {
        console.error("AdvancedMarkerElement is not available. Make sure the Marker Library is loaded correctly.");
      }
    }
  }, [map, users]);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h1>🏆 Admin Dashboard</h1>

      <h2>📊 Leaderboard</h2>
      <table border="1" style={{ width: "80%", margin: "auto", textAlign: "center" }}>
        <thead>
          <tr>
            <th>Team</th>
            <th>Current Quest</th>
            <th>Solved Quests</th>
          </tr>
        </thead>
        <tbody>
          {teams.map(team => (
            <tr key={team.id}>
              <td>{team.name}</td>
              <td>{team.progress?.currentQuest || "Not started"}</td>
              <td>{team.solvedQuests}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>📍 User Locations (Updated Every Minute When Tab is Active)</h2>
      <div id="map" style={{ height: "400px", width: "80%", margin: "auto" }}></div>
    </div>
  );
}

export default AdminDashboard;
