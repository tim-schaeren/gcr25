import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, getDoc, updateDoc } from "firebase/firestore";

function Shop({ user, db }) {
  const [shopItems, setShopItems] = useState([]);
  const [currency, setCurrency] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    console.log("Shop useEffect running...");
  
    if (!user) {
      console.warn("No user found, skipping fetch.");
      return;
    }
  
    const fetchUserData = async () => {
      try {
        console.log("Fetching user data...");
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setCurrency(userSnap.data().currency || 0);
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
  
        if (querySnapshot.empty) {
          console.warn("No shop items found in Firestore.");
        }
  
        const items = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
  
        console.log("Fetched shop items:", items);
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
    if (currency < item.price) {
      alert("Not enough currency!");
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        alert("User data not found.");
        return;
      }

      const userData = userSnap.data();
      const updatedCurrency = userData.currency - item.price;
      const inventory = userData.inventory || {};
      inventory[item.id] = (inventory[item.id] || 0) + 1;

      await updateDoc(userRef, {
        currency: updatedCurrency,
        inventory: inventory,
      });

      setCurrency(updatedCurrency);
      alert(`You purchased: ${item.name}`);
    } catch (err) {
      console.error("Error processing purchase:", err);
      alert("Purchase failed. Try again.");
    }
  };

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>🛒 In-Game Shop</h2>
      <h3>Your Balance: 💰 {currency}</h3>

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
