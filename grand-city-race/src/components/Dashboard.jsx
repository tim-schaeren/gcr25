import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc } from "firebase/firestore";

function Dashboard({ user, db }) {
  const [quest, setQuest] = useState("Loading quest...");
  const [currency, setCurrency] = useState(0);
  const [inventory, setInventory] = useState({});
  const navigate = useNavigate();

  const handleUseItem = async (itemId) => {
    if (!inventory[itemId] || inventory[itemId] <= 0) {
      alert("You don't have this item!");
      return;
    }

    try {
      const itemRef = doc(db, "shopItems", itemId);
      const itemSnap = await getDoc(itemRef);

      if (!itemSnap.exists()) {
        alert("Invalid item!");
        return;
      }

      const itemData = itemSnap.data();
      let message = "";

      if (itemData.type === "hint") {
        message = "Hint activated: " + itemData.effect;
      } else if (itemData.type === "boost") {
        message = "Boost applied: " + itemData.effect;
      } else if (itemData.type === "curse") {
        message = "Curse applied: " + itemData.effect;
      }

      const userRef = doc(db, "users", user.uid);
      const updatedInventory = { ...inventory };
      updatedInventory[itemId] -= 1;
      await updateDoc(userRef, { inventory: updatedInventory });

      setInventory(updatedInventory);
      alert(message);
    } catch (error) {
      console.error("Error using item:", error);
      alert("Failed to use item.");
    }
  };

  useEffect(() => {
    if (!user) return;

    const fetchUserData = async () => {
      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          setCurrency(data.currency || 0);
          setInventory(data.inventory || {});
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    const fetchQuest = async () => {
      try {
        const questRef = doc(db, "quests", "1");
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

      <h3>🎒 Your Inventory</h3>
      {Object.keys(inventory).length === 0 ? (
        <p>No items in inventory.</p>
      ) : (
        Object.entries(inventory).map(([itemId, count]) => (
          <div key={itemId} style={{ marginBottom: "10px" }}>
            <span>{itemId}: {count}</span>
            <button onClick={() => handleUseItem(itemId)}>Use</button>
          </div>
        ))
      )}

      <button onClick={() => navigate("/qrscanner")}>📸 Scan QR Code</button>
      <button onClick={() => navigate("/shop")}>🛒 Open Shop</button>
    </div>
  );
}

export default Dashboard;
