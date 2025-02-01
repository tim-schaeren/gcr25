import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

function Shop({ user, db }) {
  const [shopItems, setShopItems] = useState([]);
  const [currency, setCurrency] = useState(0);
  const [team, setTeam] = useState(null);
  const [error, setError] = useState(null);

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
          } else {
            console.error("Team data not found!");
          }
        }
      } catch (err) {
        setError("Error fetching user data.");
        console.error(err);
      }
    };

    const fetchShopItems = async () => {
      try {
        console.log("Fetching shop items...");
        const querySnapshot = await getDocs(collection(db, "shopItems"));
        const items = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));

        setShopItems(items);
      } catch (err) {
        setError("Error fetching shop items.");
        console.error("Firestore error:", err);
      }
    };

    fetchUserData();
    fetchShopItems();
  }, [user, db]);

  const handlePurchase = async (item) => {
    if (!team) {
      alert("No team found!");
      return;
    }

    if (currency < item.price) {
      alert("Not enough team currency!");
      return;
    }

    try {
      const teamRef = doc(db, "teams", team.id);
      const teamSnap = await getDoc(teamRef);

      if (!teamSnap.exists()) {
        alert("Team data not found.");
        return;
      }

      const teamData = teamSnap.data();
      const updatedCurrency = teamData.currency - item.price;
      const inventory = teamData.inventory || {};
      inventory[item.id] = (inventory[item.id] || 0) + 1;

      await updateDoc(teamRef, {
        currency: updatedCurrency,
        inventory: inventory,
      });

      setCurrency(updatedCurrency);
      alert(`Your team purchased: ${item.name}`);
    } catch (err) {
      console.error("Error processing purchase:", err);
      alert("Purchase failed. Try again.");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>🛒 In-Game Shop</h2>
      <h3>Your Team's Balance: 💰 {currency}</h3>

      {error && <p style={{ color: "red" }}>{error}</p>}
      <div>
        {shopItems.length === 0 ? (
          <p>No items found.</p>
        ) : (
          shopItems.map((item) => (
            <div key={item.id} style={{ border: "1px solid #ccc", padding: "10px", margin: "10px" }}>
              <h4>{item.name}</h4>
              <p>{item.description}</p>
              <p>💰 {item.price}</p>
              <button onClick={() => handlePurchase(item)}>Buy</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default Shop;
