import React, { useState, useEffect } from "react";
import { doc, getDoc } from "firebase/firestore"; // Import Firestore functions
import { useNavigate } from "react-router-dom";

function Dashboard({ user, db }) {
  const [quest, setQuest] = useState("Loading quest...");
  const [currency, setCurrency] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;

    // Fetch user's currency from Firestore
    const fetchUserData = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setCurrency(userSnap.data().currency || 0);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    // Fetch the current quest from Firestore
    const fetchQuest = async () => {
      try {
        const questRef = doc(db, "quests", "1"); // Fetch quest with ID "1"
        const questSnap = await getDoc(questRef);
        if (questSnap.exists()) {
          setQuest(questSnap.data().text);
        } else {
          setQuest("No active quest found.");
        }
      } catch (error) {
        console.error("Error fetching quest:", error);
      }
    };

    fetchUserData();
    fetchQuest();
  }, [user, db]);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Welcome, {user?.email}</h2>
      <h3>Current Quest:</h3>
      <p>{quest}</p>

      <h3>Your In-Game Currency: 💰 {currency}</h3>

      <button onClick={() => navigate("/qrscanner")}>📸 Scan QR Code</button>
      <button onClick={() => alert("Go to Shop!")}>🛒 Open Shop</button>
    </div>
  );
}

export default Dashboard;
