import React, { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { useNavigate } from "react-router-dom";

function QRScanner({ user, db }) {
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      async (decodedText) => {
        console.log("Scanned QR Code:", decodedText);

        try {
          const questId = decodedText.trim();
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);

          if (!userSnap.exists()) {
            alert("User data not found.");
            return;
          }

          const userData = userSnap.data();
          if (!userData.teamId) {
            alert("User is not assigned to a team.");
            return;
          }

          const teamRef = doc(db, "teams", userData.teamId);
          const teamSnap = await getDoc(teamRef);

          if (!teamSnap.exists()) {
            alert("Team data not found.");
            return;
          }

          const teamData = teamSnap.data();
          if (teamData.progress?.previousQuests?.includes(questId)) {
            alert("You already solved this quest!");
            return;
          }

          // Assign the new quest
          await updateDoc(teamRef, {
            "progress.currentQuest": questId,
          });

          alert("Quest assigned! Returning to dashboard...");
          navigate("/dashboard"); // Redirect to the dashboard
        } catch (err) {
          setError("Error processing QR code.");
          console.error("QR Code Processing Error:", err);
        }
      },
      (scanError) => console.warn("Scan Error:", scanError)
    );

    return () => scanner.clear();
  }, [db, user, navigate]);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Scan a QR Code</h2>
      <div id="qr-reader" style={{ width: "300px" }}></div>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default QRScanner;
