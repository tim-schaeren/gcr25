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
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <div className="bg-gray-800 p-8 rounded-lg shadow-lg w-full max-w-2xl">
        <h2 className="text-2xl font-bold text-center">👋 Welcome, {user?.email}</h2>
        {team && <h3 className="text-lg text-gray-400 text-center mt-2">Team: <span className="font-semibold text-white">{team.name}</span></h3>}

        <div className="mt-6 p-4 bg-gray-700 rounded-lg text-center">
          {quest ? (
            <>
              <h3 className="text-xl font-semibold">📜 Current Quest:</h3>
              <p className="text-gray-300 mt-2">{quest.text}</p>
              <button
                onClick={() => navigate("/solver")}
                className="mt-4 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-md"
              >
                🧠 Solve Quest
              </button>
            </>
          ) : (
            <p className="text-gray-400">⚡ No active quest. Scan a QR code to start!</p>
          )}
        </div>

        <div className="mt-6 p-4 bg-gray-700 rounded-lg text-center">
          <h3 className="text-xl font-semibold">💰 Team Currency: {currency}</h3>
        </div>

        {locationPermission === false && (
          <p className="mt-4 text-red-400 text-center">
            ⚠️ Location access denied. Please enable location services.
          </p>
        )}

        <div className="flex flex-col sm:flex-row justify-between mt-6">
          <button
            onClick={() => navigate("/qrscanner")}
            className="w-full sm:w-auto bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-6 rounded-md mb-3 sm:mb-0 sm:mr-2"
          >
            📸 Scan QR Code
          </button>
          <button
            onClick={() => navigate("/shop")}
            className="w-full sm:w-auto bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-2 px-6 rounded-md"
          >
            🛒 Open Shop
          </button>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
