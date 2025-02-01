import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";

function Dashboard({ user, db }) {
  const [quest, setQuest] = useState(null);
  const [currency, setCurrency] = useState(0);
  const [team, setTeam] = useState(null);
  const [locationPermission, setLocationPermission] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    const fetchUserData = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (!userData.teamId) {
            console.error("User is not assigned to a team.");
            return;
          }

          // Fetch team data
          const teamRef = doc(db, "teams", userData.teamId);
          const teamSnap = await getDoc(teamRef);
          if (teamSnap.exists()) {
            const teamData = teamSnap.data();
            setTeam({ id: userData.teamId, ...teamData });
            setCurrency(teamData.currency || 0);

            // Fetch current quest
            if (teamData.progress?.currentQuest) {
              const questRef = doc(db, "quests", teamData.progress.currentQuest);
              const questSnap = await getDoc(questRef);
              if (questSnap.exists()) {
                setQuest({ id: teamData.progress.currentQuest, ...questSnap.data() });
              }
            }
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [user, db]);

  useEffect(() => {
    if (!user) return;

    const startLocationTracking = () => {
      const updateLocation = async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const userRef = doc(db, "users", user.uid);
          await updateDoc(userRef, {
            location: { lat: latitude, lng: longitude },
            lastUpdated: new Date(),
          });
        } catch (error) {
          console.error("Error updating location:", error);
        }
      };

      const handleLocationError = (error) => {
        console.error("Error getting location:", error);
      };

      navigator.geolocation.watchPosition(updateLocation, handleLocationError, {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000,
      });
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocationPermission(true);
          startLocationTracking();
        },
        (error) => {
          setLocationPermission(false);
          console.error("Error getting location:", error);
        }
      );
    } else {
      console.error("Geolocation is not supported by this browser.");
    }
  }, [user, db]);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Welcome, {user?.email}</h2>
      {team && <h3>Team: {team.name}</h3>}

      {quest ? (
        <div>
          <h3>Current Quest:</h3>
          <p>{quest.text}</p>
          <button onClick={() => navigate("/solver")}>🧠 Solve</button>
        </div>
      ) : (
        <p>No active quest. Scan a QR code to start!</p>
      )}

      <h3>Your Team's Currency: 💰 {currency}</h3>c

      {locationPermission === false && (
        <p style={{ color: "red" }}>Location access denied. Please enable location services.</p>
      )}

      <button onClick={() => navigate("/qrscanner")}>📸 Scan QR Code</button>
      <button onClick={() => navigate("/shop")}>🛒 Open Shop</button>
    </div>
  );
}

export default Dashboard;
