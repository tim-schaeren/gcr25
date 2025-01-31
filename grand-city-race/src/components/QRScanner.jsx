import React, { useEffect, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import { doc, getDoc, updateDoc } from "firebase/firestore";

function QRScanner({ user, db }) {
  const [scannedData, setScannedData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      async (decodedText) => {
        setScannedData(decodedText);
        console.log("Scanned QR Code:", decodedText);

        try {
          const questId = decodedText.trim();
          const questRef = doc(db, "quests", questId);
          const questSnap = await getDoc(questRef);

          if (questSnap.exists()) {
            alert(`Quest Unlocked: ${questSnap.data().text}`);

            // OPTIONAL: Update user's last completed quest
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, { lastCompletedQuest: questId });
          } else {
            alert("Invalid QR code! Quest not found.");
          }
        } catch (err) {
          setError("Error processing QR code.");
          console.error("QR Code Processing Error:", err);
        }
      },
      (scanError) => console.warn("Scan Error:", scanError)
    );

    return () => scanner.clear();
  }, [db, user]);

  return (
    <div style={{ textAlign: "center", marginTop: "50px" }}>
      <h2>Scan a QR Code</h2>
      <div id="qr-reader" style={{ width: "300px" }}></div>

      {scannedData && <p>✅ Scanned: {scannedData}</p>}
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}

export default QRScanner;
